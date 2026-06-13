const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { parseCSVLine, analyzeCSVInbound } = require('../utils/importer');
const { calculateSplits } = require('../utils/splits');
const { sendAndLogEmail } = require('../utils/notifications');

router.use(authMiddleware);

// Helper to resolve or create a user by name/email and ensure group membership
async function getOrCreateGroupMember(connection, identifier, groupId) {
  let user = null;
  const cleanId = identifier.trim();

  if (cleanId.includes('@')) {
    // Lookup by email
    const [rows] = await connection.query('SELECT id, name, email FROM users WHERE email = ?', [cleanId]);
    if (rows.length > 0) {
      user = rows[0];
    }
  } else {
    // Lookup by name
    const [rows] = await connection.query('SELECT id, name, email FROM users WHERE LOWER(name) = ?', [cleanId.toLowerCase()]);
    if (rows.length > 0) {
      user = rows[0];
    }
  }

  // If user does not exist, create a pending placeholder user (e.g. for Dev's friend Kabir)
  if (!user) {
    const fallbackName = cleanId.includes('@') ? cleanId.split('@')[0] : cleanId;
    const sanitized = fallbackName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const placeholderEmail = cleanId.includes('@') ? cleanId : `pending_${sanitized}_${Math.floor(1000 + Math.random() * 9000)}@splitlet.com`;

    const [insertResult] = await connection.query(
      `INSERT INTO users (name, email, status) VALUES (?, ?, 'pending')`,
      [fallbackName, placeholderEmail]
    );

    user = {
      id: insertResult.insertId,
      name: fallbackName,
      email: placeholderEmail
    };

    // Send placeholder invite email
    sendAndLogEmail(
      user.id,
      'invite',
      user.email,
      'Welcome to Splitlet! You have been invited.',
      `Hi ${user.name},\n\nYou have been added to a group expense sheet on Splitlet. Please sign up to claim your account.\n\nClaim here: http://localhost:3000/claim-account?email=${encodeURIComponent(user.email)}`
    ).catch(e => console.error('Error sending invite email:', e));
  }

  // Ensure member is in the group
  const [memberCheck] = await connection.query(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, user.id]
  );

  if (memberCheck.length === 0) {
    await connection.query(
      'INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, NOW())',
      [groupId, user.id]
    );
  }

  return user;
}

// 1. Ingest CSV file and run anomaly detection, saving to database logs
router.post('/upload', async (req, res) => {
  const { groupId, csvText, exchangeRate = 83, fileName = 'expenses_export.csv' } = req.body;

  if (!groupId || !csvText) {
    return res.status(400).json({ error: 'groupId and csvText are required.' });
  }

  try {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    const rows = lines.map(line => parseCSVLine(line));

    const rate = parseFloat(exchangeRate);
    const analysis = await analyzeCSVInbound(rows, rate);

    // Write log to DB
    const [logResult] = await db.query(
      `INSERT INTO import_logs (file_name, total_rows, valid_rows, anomalies_count) 
       VALUES (?, ?, ?, ?)`,
      [fileName, rows.length - 1, rows.length - 1 - analysis.anomalies.length, analysis.anomalies.length]
    );
    const logId = logResult.insertId;

    // Write anomalies to DB
    for (const anomaly of analysis.anomalies) {
      await db.query(
        `INSERT INTO import_anomalies (import_log_id, \`row_number\`, field_name, raw_value, anomaly_type, proposed_fix, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [logId, anomaly.rowNumber, anomaly.fieldName, anomaly.rawValue, anomaly.anomalyType, anomaly.proposedFix]
      );
    }

    res.json({
      success: true,
      importLogId: logId,
      anomalies: analysis.anomalies,
      parsedRows: analysis.parsedRows
    });
  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: error.message || 'Server error during CSV processing' });
  }
});

// 2. Retrieve active queue for approval
router.get('/queue/:logId', async (req, res) => {
  const logId = parseInt(req.params.logId, 10);

  try {
    const [logs] = await db.query('SELECT * FROM import_logs WHERE id = ?', [logId]);
    if (logs.length === 0) {
      return res.status(404).json({ error: 'Import log not found.' });
    }

    const [anomalies] = await db.query(
      'SELECT * FROM import_anomalies WHERE import_log_id = ? AND status = "pending"',
      [logId]
    );

    res.json({
      log: logs[0],
      anomalies
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Server error fetching queue' });
  }
});

// 3. Process resolutions and write approved rows to the ledger in a transaction
router.post('/queue/:logId/resolve', async (req, res) => {
  const logId = parseInt(req.params.logId, 10);
  const { groupId, approvedRows, exchangeRate = 83 } = req.body;

  if (!groupId || !approvedRows || !Array.isArray(approvedRows)) {
    return res.status(400).json({ error: 'groupId and approvedRows (array) are required.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verify group exists
    const [groupCheck] = await connection.query('SELECT id FROM `groups` WHERE id = ?', [groupId]);
    if (groupCheck.length === 0) {
      throw new Error('Group not found');
    }

    let insertedCount = 0;

    for (const row of approvedRows) {
      // 1. Resolve/Create Payer
      if (!row.payerEmail && !row.paidBy) {
        throw new Error(`Row ${row.rowNumber} is missing a payer identifier.`);
      }
      const payer = await getOrCreateGroupMember(connection, row.payerEmail || row.paidBy, groupId);

      // 2. Format amounts
      const currency = row.currencyCode || row.currency || 'INR';
      const amtOriginal = Math.round(row.amountCentsOriginal);
      const amtInr = currency === 'USD' ? Math.round(amtOriginal * parseFloat(exchangeRate)) : amtOriginal;
      const expenseDate = row.date || new Date().toISOString().slice(0, 10);

      if (row.isSettlement) {
        // Resolve Receiver
        const receiverIdent = row.receiverEmail || (row.splitWith && row.splitWith[0]);
        if (!receiverIdent) {
          throw new Error(`Row ${row.rowNumber} is a settlement but is missing receiver details.`);
        }
        const receiver = await getOrCreateGroupMember(connection, receiverIdent, groupId);

        await connection.query(
          `INSERT INTO settlements (group_id, payer_id, receiver_id, amount_cents_original, currency_code, amount_cents_inr, date) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [groupId, payer.id, receiver.id, amtOriginal, currency, amtInr, expenseDate]
        );
      } else {
        // Resolve splits
        const splitType = row.splitType || 'equal';
        
        // Insert Expense
        const [expenseResult] = await connection.query(
          `INSERT INTO expenses (group_id, payer_id, amount_cents_original, currency_code, amount_cents_inr, description, split_type, date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [groupId, payer.id, amtOriginal, currency, amtInr, row.description || 'Imported Expense', splitType, expenseDate]
        );
        const expenseId = expenseResult.insertId;

        // Ensure all split participants exist and are in the group
        const splitUsers = [];
        for (const userIdent of row.splitWith) {
          const user = await getOrCreateGroupMember(connection, userIdent, groupId);
          splitUsers.push(user);
        }

        // Calculate split values
        // Format splits for calculation utility
        const formattedSplits = splitUsers.map(u => {
          let customVal = null;
          // Parse split details if custom logic applies
          if (row.splitDetails && (splitType === 'percentage' || splitType === 'shares' || splitType === 'unequal')) {
            const parts = row.splitDetails.split(';');
            const match = parts.find(p => p.toLowerCase().includes(u.name.toLowerCase()));
            if (match) {
              const numVal = parseFloat(match.replace(/[^0-9.]/g, ''));
              if (!isNaN(numVal)) customVal = numVal;
            }
          }
          return {
            userId: u.id,
            value: customVal
          };
        });

        const calculatedSplits = calculateSplits(amtOriginal, splitType, formattedSplits);

        for (const split of calculatedSplits) {
          const owedOriginal = split.amountOwedCents;
          const owedInr = currency === 'USD' ? Math.round(owedOriginal * parseFloat(exchangeRate)) : owedOriginal;

          await connection.query(
            `INSERT INTO splits (expense_id, user_id, amount_owed_cents_original, amount_owed_cents_inr, percentage, shares) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [expenseId, split.userId, owedOriginal, owedInr, split.percentage, split.shares]
          );
        }
      }

      insertedCount++;
    }

    // Update anomalies status
    await connection.query(
      'UPDATE import_anomalies SET status = "resolved" WHERE import_log_id = ?',
      [logId]
    );

    // Update import logs summary
    await connection.query(
      'UPDATE import_logs SET valid_rows = ?, anomalies_count = 0 WHERE id = ?',
      [insertedCount, logId]
    );

    await connection.commit();
    res.json({
      success: true,
      message: `${insertedCount} records successfully imported into ledger.`,
      validRows: insertedCount
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error resolving CSV queue:', error);
    res.status(400).json({ error: error.message || 'Error executing ledger insertions' });
  } finally {
    connection.release();
  }
});

module.exports = router;
