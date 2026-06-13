const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getUserGlobalBalances } = require('../utils/balances');

router.use(authMiddleware);

// Get global balances for the current user
router.get('/', async (req, res) => {
  try {
    const balances = await getUserGlobalBalances(req.user.id);
    res.json(balances);
  } catch (error) {
    console.error('Error fetching global balances:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
