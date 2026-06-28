const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendAndLogEmail } = require('../utils/notifications');

const JWT_SECRET = process.env.JWT_SECRET || 'splitlet_super_secret_jwt_key_2026';

// Register a new user (Local credentials)
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if email already exists
    const [existing] = await db.query('SELECT id, status FROM users WHERE email = ?', [email]);
    
    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.status === 'active') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      // If user exists as a 'pending' placeholder, let them know they should claim it
      return res.status(400).json({ 
        error: 'This email has a pending invitation. Please use the invitation link sent to your email to sign up.' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await db.query(
      "INSERT INTO users (name, email, password_hash, status) VALUES (?, ?, ?, 'active')",
      [name, email, passwordHash]
    );

    const userId = result.insertId;

    // Generate JWT
    const token = jwt.sign(
      { id: userId, email, name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: userId, name, email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login (Local credentials)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (user.status === 'pending' || !user.password_hash) {
      return res.status(400).json({ 
        error: 'This account has not been activated. Please check your email for the invitation link.' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify invitation token & decode placeholder account info
router.get('/invites/decode', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).json({ error: 'Invite token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch placeholder user
    const [users] = await db.query(
      'SELECT id, name, email, status FROM users WHERE id = ?', 
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Invited user not found' });
    }

    const user = users[0];
    if (user.status !== 'pending') {
      return res.status(400).json({ error: 'This invitation has already been claimed.' });
    }

    res.json({
      user,
      groupId: decoded.groupId
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid or expired invitation link.' });
  }
});

// Claim pending/placeholder account
router.post('/invites/claim', async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    return res.status(400).json({ error: 'Token, name, and password are required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Check user state
    const [users] = await db.query('SELECT id, status FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const user = users[0];
    if (user.status !== 'pending') {
      return res.status(400).json({ error: 'Account is already active.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Update user to active
    await db.query(
      "UPDATE users SET name = ?, password_hash = ?, status = 'active' WHERE id = ?",
      [name, passwordHash, userId]
    );

    // Generate login JWT
    const [updatedUsers] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [userId]);
    const updatedUser = updatedUsers[0];

    const loginToken = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: loginToken,
      user: updatedUser
    });
  } catch (error) {
    console.error('Claim account error:', error);
    res.status(400).json({ error: 'Invalid or expired invitation link.' });
  }
});

// --- PASSWORD RESET ENDPOINTS ---

const CLIENT_URL_FOR_RESET = process.env.CLIENT_URL || 'http://localhost:3000';

// Request a password reset link
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const [users] = await db.query('SELECT id, name, email, status, oauth_provider, password_hash FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      // Don't reveal whether the email exists
      return res.json({ message: 'If that email is registered, you will receive a password reset link shortly.' });
    }

    const user = users[0];

    // Allow OAuth users to set a password via reset flow too.
    // No guard needed — the flow works for both local and OAuth accounts.

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing (so DB compromise doesn't leak valid tokens)
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Set expiry to 15 minutes from now
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Save hashed token and expiry to user record
    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [hashedToken, expires, user.id]
    );

    // Construct reset link
    const resetLink = `${CLIENT_URL_FOR_RESET}/reset-password/${resetToken}`;

    // Send email
    const subject = 'Splitlet – Password Reset Request';
    const text = `Hi ${user.name || 'there'},\n\nWe received a request to reset your Splitlet password.\n\nClick the link below to set a new password (valid for 15 minutes):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\nCheers,\nThe Splitlet Team`;

    await sendAndLogEmail(user.id, 'password_reset', user.email, subject, text);

    res.json({ message: 'If that email is registered, you will receive a password reset link shortly.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with token
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Find users that have an unexpired reset token
    const [users] = await db.query(
      'SELECT id, reset_token, reset_token_expires FROM users WHERE reset_token IS NOT NULL AND reset_token_expires > NOW()'
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Find the matching user by comparing the provided token against hashed tokens
    let matchedUser = null;
    for (const u of users) {
      const isMatch = await bcrypt.compare(token, u.reset_token);
      if (isMatch) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Update password and clear reset token
    await db.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [passwordHash, matchedUser.id]
    );

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- GOOGLE OAUTH 2.0 ENDPOINTS ---

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/auth/oauth/google/callback';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Redirect to Google Consent Screen
router.get('/oauth/google', (req, res) => {
  if (!CLIENT_ID) {
    // DEV MODE: No credentials set, redirect to mock callback automatically
    console.log('Google Client ID missing. Redirecting to MOCK OAuth callback.');
    return res.redirect(`${REDIRECT_URI}?code=mock_developer_code`);
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
    `client_id=${encodeURIComponent(CLIENT_ID)}` + 
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` + 
    `&response_type=code` + 
    `&scope=openid%20email%20profile` + 
    `&access_type=offline` + 
    `&prompt=consent`;

  res.redirect(googleAuthUrl);
});

// Google Redirect Callback endpoint
router.get('/oauth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${CLIENT_URL}/login?error=oauth_failed`);
  }

  try {
    let email, name, googleId;

    if (code === 'mock_developer_code') {
      // Mock OAuth Flow for local testing
      email = 'google_mock@example.com';
      name = 'Google Mock User';
      googleId = 'mock_google_user_id_12345';
    } else {
      // Real OAuth Flow - Exchange Code for Access Token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || 'Failed to exchange OAuth token.');
      }

      // Fetch User Info
      const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      const profile = await userinfoResponse.json();
      email = profile.email;
      name = profile.name || profile.given_name || 'Google User';
      googleId = profile.sub;
    }

    // Database Sync: Check if user exists
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    let userId;
    let finalName = name;

    if (existing.length > 0) {
      const user = existing[0];
      userId = user.id;
      finalName = user.name || name;

      // Update user details (e.g. if placeholder pending account or linking OAuth provider)
      await db.query(
        `UPDATE users 
         SET oauth_provider = 'google', oauth_id = ?, status = 'active' 
         WHERE id = ?`,
        [googleId, userId]
      );
    } else {
      // Create new user
      const [result] = await db.query(
        `INSERT INTO users (name, email, oauth_provider, oauth_id, status) 
         VALUES (?, ?, 'google', ?, 'active')`,
        [name, email, googleId]
      );
      userId = result.insertId;
    }

    // Sign login JWT
    const token = jwt.sign(
      { id: userId, email, name: finalName },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect back to frontend
    res.redirect(`${CLIENT_URL}/oauth-success?token=${token}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${CLIENT_URL}/login?error=oauth_error`);
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, status, oauth_provider, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: users[0] });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
