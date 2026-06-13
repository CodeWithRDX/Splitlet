const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { getGroupBalances } = require('../utils/balances');
const { sendAndLogEmail } = require('../utils/notifications');

const JWT_SECRET = process.env.JWT_SECRET || 'splitlet_super_secret_jwt_key_2026';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

router.use(authMiddleware);

// 1. Get all groups user belongs to
router.get('/', async (req, res) => {
  try {
    const [groups] = await db.query(
      `SELECT g.id, g.name, g.created_at 
       FROM \`groups\` g 
       JOIN group_members gm ON g.id = gm.group_id 
       WHERE gm.user_id = ? 
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(groups);
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Create a new group
router.post('/', async (req, res) => {
  const { name, emails } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Insert group
    const [groupResult] = await connection.query(
      'INSERT INTO `groups` (name) VALUES (?)',
      [name]
    );
    const groupId = groupResult.insertId;

    // Add creator to group
    await connection.query(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, req.user.id]
    );

    // Process other invited members
    if (emails && Array.isArray(emails) && emails.length > 0) {
      for (const email of emails) {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || trimmedEmail === req.user.email) continue;

        // Check if user exists
        const [users] = await connection.query('SELECT id, status FROM users WHERE email = ?', [trimmedEmail]);
        let memberId;

        if (users.length > 0) {
          memberId = users[0].id;
          // Add to group
          await connection.query(
            'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            [groupId, memberId]
          );

          // Trigger email notification for existing user (non-blocking)
          sendAndLogEmail(
            memberId,
            'group_added',
            trimmedEmail,
            `You have been added to a new group: ${name}`,
            `Hi! You have been added to the group "${name}" on Splitlet by ${req.user.name}.\n\nAccess your dashboard at: ${CLIENT_URL}`
          ).catch(e => console.error(e));

        } else {
          // Create placeholder pending user
          const defaultName = trimmedEmail.split('@')[0];
          const [placeholderResult] = await connection.query(
            "INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, NULL, 'pending')",
            [defaultName, trimmedEmail]
          );
          memberId = placeholderResult.insertId;

          // Add to group
          await connection.query(
            'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            [groupId, memberId]
          );

          // Generate secure JWT invitation token
          const inviteToken = jwt.sign(
            { userId: memberId, email: trimmedEmail, groupId },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          const inviteLink = `${CLIENT_URL}/claim?token=${inviteToken}`;

          // Trigger invitation email (non-blocking)
          sendAndLogEmail(
            memberId,
            'group_invite',
            trimmedEmail,
            `Invitation to join Splitlet group: ${name}`,
            `Hello!\n\nYou have been added to the group "${name}" on Splitlet by ${req.user.name}.\n\nSince you don't have an account yet, click the link below to set up your password and access your historical ledger:\n\n${inviteLink}\n\nWelcome to Splitlet!`
          ).catch(e => console.error(e));
        }
      }
    }

    await connection.commit();
    res.status(201).json({ id: groupId, name });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
});

// 3. Get group details (includes members, expenses, and balances)
router.get('/:id', async (req, res) => {
  const groupId = parseInt(req.params.id, 10);

  try {
    // Verify user belongs to the group
    const [membership] = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Access denied: not a group member' });
    }

    // Get group name
    const [group] = await db.query('SELECT name, created_at FROM `groups` WHERE id = ?', [groupId]);
    if (group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Fetch expenses in the group
    const [expenses] = await db.query(
      `SELECT e.id, e.payer_id, u.name as payer_name, e.amount_cents_inr AS amount_cents, e.amount_cents_original, e.currency_code, e.description, e.split_type, e.date, e.created_at 
       FROM expenses e 
       JOIN users u ON e.payer_id = u.id 
       WHERE e.group_id = ? AND e.is_deleted = FALSE 
       ORDER BY e.date DESC, e.created_at DESC`,
      [groupId]
    );

    // Fetch splits for all group expenses
    let expensesWithSplits = [];
    if (expenses.length > 0) {
      const expenseIds = expenses.map(e => e.id);
      const [splits] = await db.query(
        `SELECT s.expense_id, s.user_id, u.name as user_name, s.amount_owed_cents_inr AS amount_owed_cents, s.amount_owed_cents_original, s.percentage, s.shares 
         FROM splits s
         JOIN users u ON s.user_id = u.id 
         WHERE s.expense_id IN (?)`,
        [expenseIds]
      );

      const splitsMap = {};
      splits.forEach(s => {
        if (!splitsMap[s.expense_id]) {
          splitsMap[s.expense_id] = [];
        }
        splitsMap[s.expense_id].push({
          userId: s.user_id,
          userName: s.user_name,
          amountOwedCents: s.amount_owed_cents,
          amountOwedCentsOriginal: s.amount_owed_cents_original,
          percentage: s.percentage,
          shares: s.shares
        });
      });

      expensesWithSplits = expenses.map(e => ({
        ...e,
        splits: splitsMap[e.id] || []
      }));
    }

    // Fetch settlements in the group
    const [settlements] = await db.query(
      `SELECT s.id, s.payer_id, u1.name as payer_name, s.receiver_id, u2.name as receiver_name, s.amount_cents_inr AS amount_cents, s.amount_cents_original, s.currency_code, s.date, s.created_at 
       FROM settlements s 
       JOIN users u1 ON s.payer_id = u1.id 
       JOIN users u2 ON s.receiver_id = u2.id 
       WHERE s.group_id = ? 
       ORDER BY s.date DESC, s.created_at DESC`,
      [groupId]
    );

    // Get group balances
    const balanceDetails = await getGroupBalances(groupId);

    res.json({
      id: groupId,
      name: group[0].name,
      createdAt: group[0].created_at,
      expenses: expensesWithSplits,
      settlements,
      members: balanceDetails.members,
      pairwiseBalances: balanceDetails.pairwiseBalances,
      userSummaries: balanceDetails.userSummaries
    });
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Add a member to a group (invites placeholders if they don't exist)
router.post('/:id/members', async (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Member email is required' });
  }

  const trimmedEmail = email.trim().toLowerCase();

  try {
    // Verify current user is in group
    const [membership] = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch group details
    const [groupData] = await db.query('SELECT name FROM `groups` WHERE id = ?', [groupId]);
    const groupName = groupData[0].name;

    // Check if user exists
    const [users] = await db.query('SELECT id, name, status FROM users WHERE email = ?', [trimmedEmail]);
    
    let targetUserId;
    let isNewUser = false;

    if (users.length > 0) {
      targetUserId = users[0].id;

      // Check if already a member
      const [existing] = await db.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, targetUserId]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User is already a member of this group' });
      }

      // Add to group
      await db.query(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, targetUserId]
      );

      // Trigger standard email notification
      sendAndLogEmail(
        targetUserId,
        'group_added',
        trimmedEmail,
        `You have been added to: ${groupName}`,
        `Hi ${users[0].name},\n\nYou have been added to the group "${groupName}" on Splitlet by ${req.user.name}.\n\nAccess your dashboard at: ${CLIENT_URL}`
      ).catch(e => console.error(e));

    } else {
      isNewUser = true;
      const defaultName = trimmedEmail.split('@')[0];

      // Create placeholder account
      const [placeholderResult] = await db.query(
        "INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, NULL, 'pending')",
        [defaultName, trimmedEmail]
      );
      targetUserId = placeholderResult.insertId;

      // Add membership
      await db.query(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, targetUserId]
      );

      // Generate signed JWT invitation token
      const inviteToken = jwt.sign(
        { userId: targetUserId, email: trimmedEmail, groupId },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      const inviteLink = `${CLIENT_URL}/claim?token=${inviteToken}`;

      // Trigger invitation email
      sendAndLogEmail(
        targetUserId,
        'group_invite',
        trimmedEmail,
        `Invitation to join Splitlet group: ${groupName}`,
        `Hello!\n\nYou have been added to the group "${groupName}" on Splitlet by ${req.user.name}.\n\nSince you do not have an account yet, click the link below to set up your password and access your historical ledger:\n\n${inviteLink}\n\nWelcome to Splitlet!`
      ).catch(e => console.error(e));
    }

    res.status(200).json({ 
      message: 'Member added successfully', 
      member: { id: targetUserId, email: trimmedEmail, status: isNewUser ? 'pending' : 'active' } 
    });
  } catch (error) {
    console.error('Error adding group member:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Remove a member from a group (Only allowed if net balance is exactly $0)
router.delete('/:id/members/:userId', async (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const userIdToRemove = parseInt(req.params.userId, 10);

  try {
    // Verify user is in group
    const [membership] = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate group balances
    const balanceDetails = await getGroupBalances(groupId);
    
    // Find net balance for the user being removed
    const userSummary = balanceDetails.userSummaries[userIdToRemove];
    const netBalance = userSummary ? userSummary.netBalanceCents : 0;

    if (netBalance !== 0) {
      return res.status(400).json({ 
        error: `Cannot remove member. User has a non-zero balance of $${(netBalance / 100).toFixed(2)}. Net balance must be exactly $0.` 
      });
    }

    // Delete membership
    const [result] = await db.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userIdToRemove]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Member not found in group' });
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing group member:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
