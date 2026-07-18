const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendAndLogEmail } = require('../utils/notifications');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

router.use(authMiddleware);

// Record a new settlement
router.post('/', async (req, res) => {
  const { groupId, payerId, receiverId, amountCents } = req.body;

  if (!groupId || !payerId || !receiverId || !amountCents) {
    return res.status(400).json({ error: 'All fields (groupId, payerId, receiverId, amountCents) are required.' });
  }

  if (amountCents <= 0) {
    return res.status(400).json({ error: 'Settlement amount must be greater than zero.' });
  }

  if (payerId === receiverId) {
    return res.status(400).json({ error: 'Payer and receiver cannot be the same user.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verify payer is in group
    const [payerMembership] = await connection.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, payerId]
    );
    if (payerMembership.length === 0) {
      throw new Error('Payer is not a member of the group.');
    }

    // Verify receiver is in group
    const [receiverMembership] = await connection.query(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, receiverId]
    );
    if (receiverMembership.length === 0) {
      throw new Error('Receiver is not a member of the group.');
    }

    const { getExchangeRates } = require('../utils/rates');
    const currency = req.body.currencyCode || 'INR';
    const rates = await getExchangeRates();
    const amountOriginal = amountCents;
    const amountInr = currency !== 'INR' ? Math.round(amountCents * (1 / (rates[currency] || 1.0))) : amountCents;
    const settlementDate = req.body.date || new Date().toISOString().slice(0, 10);

    // Insert settlement record
    const [result] = await connection.query(
      `INSERT INTO settlements (group_id, payer_id, receiver_id, amount_cents_original, currency_code, amount_cents_inr, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [groupId, payerId, receiverId, amountOriginal, currency, amountInr, settlementDate]
    );

    // Retrieve user and group info for notifications
    const [groupData] = await connection.query('SELECT name FROM `groups` WHERE id = ?', [groupId]);
    const [payerData] = await connection.query('SELECT name, email FROM users WHERE id = ?', [payerId]);
    const [receiverData] = await connection.query('SELECT name, email FROM users WHERE id = ?', [receiverId]);
    
    const groupName = groupData[0]?.name || 'a group';
    const payerName = payerData[0]?.name || 'someone';
    const payerEmail = payerData[0]?.email;
    const receiverName = receiverData[0]?.name || 'someone';
    const receiverEmail = receiverData[0]?.email;

    await connection.commit();

    // Trigger emails (non-blocking) only if requested
    if (req.body.sendNotification !== false) {
      const formattedAmount = `$${(amountCents / 100).toFixed(2)}`;

      // Payer confirmation
      if (payerEmail) {
        sendAndLogEmail(
          payerId,
          'debt_settled',
          payerEmail,
          `Payment to ${receiverName} recorded`,
          `Hi ${payerName},\n\nYour payment of ${formattedAmount} to ${receiverName} in group "${groupName}" has been successfully recorded.\n\nView details: ${CLIENT_URL}`
        ).catch(e => console.error(e));
      }

      // Receiver notification
      if (receiverEmail) {
        sendAndLogEmail(
          receiverId,
          'debt_settled',
          receiverEmail,
          `Payment from ${payerName} received`,
          `Hi ${receiverName},\n\n${payerName} has recorded a payment of ${formattedAmount} to you in group "${groupName}".\n\nYour balance has been updated.\n\nView details: ${CLIENT_URL}`
        ).catch(e => console.error(e));
      }
    }

    res.status(201).json({ 
      message: 'Settlement recorded successfully', 
      settlementId: result.insertId 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error recording settlement:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  } finally {
    connection.release();
  }
});

module.exports = router;
