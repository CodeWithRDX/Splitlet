const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { calculateSplits } = require('../utils/splits');
const { sendAndLogEmail } = require('../utils/notifications');
const { getExchangeRates } = require('../utils/rates');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

router.use(authMiddleware);

// 1. Create a new expense
router.post('/', async (req, res) => {
  const { groupId, description, amountCents, splitType, payerId, splits } = req.body;

  if (!groupId || !description || !amountCents || !splitType || !payerId || !splits) {
    return res.status(400).json({ error: 'All fields (groupId, description, amountCents, splitType, payerId, splits) are required.' });
  }

  if (!['equal', 'unequal', 'percentage', 'shares'].includes(splitType)) {
    return res.status(400).json({ error: 'Invalid split type.' });
  }

  let calculatedSplits;
  try {
    calculatedSplits = calculateSplits(amountCents, splitType, splits);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verify payer is member of group
    const [payerMembership] = await connection.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, payerId]
    );
    if (payerMembership.length === 0) {
      throw new Error('Payer is not a member of the group.');
    }

    const currency = req.body.currencyCode || 'INR';
    const rates = await getExchangeRates();
    const amountOriginal = amountCents;
    const amountInr = currency !== 'INR' ? Math.round(amountCents * (1 / (rates[currency] || 1.0))) : amountCents;
    const expenseDate = req.body.date || new Date().toISOString().slice(0, 10);

    // Insert expense record
    const [expenseResult] = await connection.query(
      `INSERT INTO expenses (group_id, payer_id, amount_cents_original, currency_code, amount_cents_inr, description, split_type, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [groupId, payerId, amountOriginal, currency, amountInr, description, splitType, expenseDate]
    );
    const expenseId = expenseResult.insertId;

    // Insert splits and gather user details for notifications
    const notificationReceivers = [];

    for (const split of calculatedSplits) {
      // Verify split user is in group
      const [splitMembership] = await connection.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, split.userId]
      );
      if (splitMembership.length === 0) {
        throw new Error(`User ID ${split.userId} is not a member of the group.`);
      }

      const owedOriginal = split.amountOwedCentsOriginal !== undefined ? split.amountOwedCentsOriginal : split.amountOwedCents;
      const owedInr = split.amountOwedCentsInr !== undefined ? split.amountOwedCentsInr : (currency !== 'INR' ? Math.round(split.amountOwedCents * (1 / (rates[currency] || 1.0))) : split.amountOwedCents);

      await connection.query(
        `INSERT INTO splits (expense_id, user_id, amount_owed_cents_original, amount_owed_cents_inr, percentage, shares) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [expenseId, split.userId, owedOriginal, owedInr, split.percentage, split.shares]
      );

      // Collect user info to send emails (excluding the payer themselves)
      if (split.userId !== payerId) {
        const [userData] = await connection.query('SELECT name, email FROM users WHERE id = ?', [split.userId]);
        if (userData.length > 0) {
          notificationReceivers.push({
            userId: split.userId,
            name: userData[0].name,
            email: userData[0].email,
            owedCents: split.amountOwedCents
          });
        }
      }
    }

    // Retrieve group and payer details for email context
    const [groupData] = await connection.query('SELECT name FROM `groups` WHERE id = ?', [groupId]);
    const [payerData] = await connection.query('SELECT name FROM users WHERE id = ?', [payerId]);
    const groupName = groupData[0]?.name || 'a group';
    const payerName = payerData[0]?.name || 'someone';

    await connection.commit();

    // Trigger email notifications (non-blocking, async background calls)
    notificationReceivers.forEach(receiver => {
      const formattedTotal = `$${(amountCents / 100).toFixed(2)}`;
      const formattedShare = `$${(receiver.owedCents / 100).toFixed(2)}`;
      
      sendAndLogEmail(
        receiver.userId,
        'new_expense',
        receiver.email,
        `New expense added: "${description}"`,
        `Hi ${receiver.name},\n\nA new expense of ${formattedTotal} ("${description}") was added in group "${groupName}" by ${payerName}.\n\nYour split share is ${formattedShare}.\n\nView details: ${CLIENT_URL}`
      ).catch(err => console.error('Email trigger error:', err));
    });

    res.status(201).json({ message: 'Expense created successfully', expenseId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating expense:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  } finally {
    connection.release();
  }
});

// 2. Edit an expense
router.put('/:id', async (req, res) => {
  const expenseId = parseInt(req.params.id, 10);
  const { description, amountCents, splitType, payerId, splits } = req.body;

  if (!description || !amountCents || !splitType || !payerId || !splits) {
    return res.status(400).json({ error: 'All fields (description, amountCents, splitType, payerId, splits) are required.' });
  }

  if (!['equal', 'unequal', 'percentage', 'shares'].includes(splitType)) {
    return res.status(400).json({ error: 'Invalid split type.' });
  }

  let calculatedSplits;
  try {
    calculatedSplits = calculateSplits(amountCents, splitType, splits);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verify expense exists
    const [expenseCheck] = await connection.query(
      'SELECT group_id FROM expenses WHERE id = ? AND is_deleted = FALSE',
      [expenseId]
    );
    if (expenseCheck.length === 0) {
      throw new Error('Expense not found or has been deleted.');
    }
    const groupId = expenseCheck[0].group_id;

    // Verify payer is member of group
    const [payerMembership] = await connection.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, payerId]
    );
    if (payerMembership.length === 0) {
      throw new Error('Payer is not a member of the group.');
    }

    const currency = req.body.currencyCode || 'INR';
    const rates = await getExchangeRates();
    const amountOriginal = amountCents;
    const amountInr = currency !== 'INR' ? Math.round(amountCents * (1 / (rates[currency] || 1.0))) : amountCents;
    const expenseDate = req.body.date || new Date().toISOString().slice(0, 10);

    // Update expense record
    await connection.query(
      `UPDATE expenses 
       SET payer_id = ?, amount_cents_original = ?, currency_code = ?, amount_cents_inr = ?, description = ?, split_type = ?, date = ? 
       WHERE id = ?`,
      [payerId, amountOriginal, currency, amountInr, description, splitType, expenseDate, expenseId]
    );

    // Delete existing splits
    await connection.query('DELETE FROM splits WHERE expense_id = ?', [expenseId]);

    // Insert new splits
    for (const split of calculatedSplits) {
      const [splitMembership] = await connection.query(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, split.userId]
      );
      if (splitMembership.length === 0) {
        throw new Error(`User ID ${split.userId} is not a member of the group.`);
      }

      const owedOriginal = split.amountOwedCentsOriginal !== undefined ? split.amountOwedCentsOriginal : split.amountOwedCents;
      const owedInr = split.amountOwedCentsInr !== undefined ? split.amountOwedCentsInr : (currency !== 'INR' ? Math.round(split.amountOwedCents * (1 / (rates[currency] || 1.0))) : split.amountOwedCents);

      await connection.query(
        `INSERT INTO splits (expense_id, user_id, amount_owed_cents_original, amount_owed_cents_inr, percentage, shares) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [expenseId, split.userId, owedOriginal, owedInr, split.percentage, split.shares]
      );
    }

    await connection.commit();
    res.json({ message: 'Expense updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating expense:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  } finally {
    connection.release();
  }
});

// 3. Soft delete an expense
router.delete('/:id', async (req, res) => {
  const expenseId = parseInt(req.params.id, 10);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [expenseCheck] = await connection.query(
      `SELECT e.group_id 
       FROM expenses e 
       JOIN group_members gm ON e.group_id = gm.group_id 
       WHERE e.id = ? AND gm.user_id = ? AND e.is_deleted = FALSE`,
      [expenseId, req.user.id]
    );

    if (expenseCheck.length === 0) {
      throw new Error('Expense not found or unauthorized.');
    }

    await connection.query(
      'UPDATE expenses SET is_deleted = TRUE WHERE id = ?',
      [expenseId]
    );

    await connection.commit();
    res.json({ message: 'Expense soft deleted successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting expense:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  } finally {
    connection.release();
  }
});

// 4. Get expense details
router.get('/:id', async (req, res) => {
  const expenseId = parseInt(req.params.id, 10);

  try {
    const [expenses] = await db.query(
      `SELECT e.id, e.group_id, e.payer_id, u.name as payer_name, e.amount_cents_inr AS amount_cents, e.amount_cents_original, e.currency_code, e.description, e.split_type, e.date, e.created_at, e.is_deleted 
       FROM expenses e 
       JOIN users u ON e.payer_id = u.id 
       WHERE e.id = ? AND e.is_deleted = FALSE`,
      [expenseId]
    );

    if (expenses.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    const expense = expenses[0];

    const [membership] = await db.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [expense.group_id, req.user.id]
    );

    if (membership.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [splits] = await db.query(
      `SELECT s.user_id, u.name as user_name, s.amount_owed_cents_inr AS amount_owed_cents, s.amount_owed_cents_original, s.percentage, s.shares 
       FROM splits s
       JOIN users u ON s.user_id = u.id 
       WHERE s.expense_id = ?`,
      [expenseId]
    );

    const [messages] = await db.query(
      `SELECT c.id, c.user_id, u.name as user_name, c.content, c.timestamp 
       FROM chat_messages c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.expense_id = ? 
       ORDER BY c.timestamp ASC`,
      [expenseId]
    );

    res.json({
      expense,
      splits,
      comments: messages
    });
  } catch (error) {
    console.error('Error fetching expense details:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
