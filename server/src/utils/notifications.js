const nodemailer = require('nodemailer');
const db = require('../db');
require('dotenv').config();

// Create transporter from environment vars (with fallback configuration)
const useSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER);

let transporter = null;

if (useSMTP) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  console.log('Nodemailer SMTP Transporter initialized successfully.');
} else {
  console.log('No SMTP config found. Nodemailer running in local MOCK/CONSOLE mode.');
}

/**
 * Sends an email notification and logs its state (sent/failed) to the database.
 * 
 * @param {number|null} userId - ID of the user receiving the notification (or null if unregistered).
 * @param {string} type - Notification trigger type (e.g. 'group_invite', 'new_expense', 'debt_settled').
 * @param {string} recipientEmail - Email address of the recipient.
 * @param {string} subject - Email subject line.
 * @param {string} text - Email body content.
 */
async function sendAndLogEmail(userId, type, recipientEmail, subject, text) {
  // Check user preference
  if (userId) {
    try {
      const [users] = await db.query(
        'SELECT email_notifications_enabled FROM users WHERE id = ?',
        [userId]
      );
      if (users.length > 0 && users[0].email_notifications_enabled === 0) {
        console.log(`Skipping email notification: user ID ${userId} has disabled emails.`);
        return; // User has explicitly opted out of notifications
      }
    } catch (prefErr) {
      console.error('Error checking user email preference, continuing:', prefErr);
    }
  }

  // 1. Create a log in the database as 'pending'
  let logId = null;
  try {
    const [result] = await db.query(
      `INSERT INTO email_notifications (user_id, type, recipient_email, status) 
       VALUES (?, ?, ?, 'pending')`,
      [userId, type, recipientEmail]
    );
    logId = result.insertId;
  } catch (error) {
    console.error('Failed to log email notification to DB:', error);
  }

  const fromEmail = process.env.EMAIL_FROM || 'noreply@splitlet.com';
  const mailOptions = {
    from: `"Splitlet Team" <${fromEmail}>`,
    to: recipientEmail,
    subject: subject,
    text: text
  };

  // 2. Attempt to send the email
  if (useSMTP && transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email notification of type '${type}' successfully sent to ${recipientEmail}`);
      
      // Update status to 'sent'
      if (logId) {
        await db.query(
          "UPDATE email_notifications SET status = 'sent' WHERE id = ?",
          [logId]
        );
      }
    } catch (error) {
      console.error(`Failed to send email notification to ${recipientEmail}:`, error);
      
      // Update status to 'failed' and save error message
      if (logId) {
        await db.query(
          "UPDATE email_notifications SET status = 'failed', error_message = ? WHERE id = ?",
          [error.message, logId]
        );
      }
    }
  } else {
    // Mock SMTP Mode: Print details to the console log
    console.log('\n--- [MOCK EMAIL SENT] ---');
    console.log(`To:      ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${text}`);
    console.log('-------------------------\n');

    // Update status to 'sent' in Mock Mode
    if (logId) {
      await db.query(
        "UPDATE email_notifications SET status = 'sent' WHERE id = ?",
        [logId]
      );
    }
  }
}

module.exports = {
  sendAndLogEmail
};
