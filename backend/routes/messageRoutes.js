const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized message access attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const messages = await collections.messageCollection
      .find({
        $or: [
          { user: req.account.AccountID },
          { targetUser: req.account.AccountID }
        ]
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    logger.info('Fetched message history', { accountId: req.account.AccountID, count: messages.length, correlationId: req.correlationId });
    res.json(messages.map(msg => ({
      ...msg,
      _id: msg._id.toHexString(),
      timestamp: msg.timestamp.toISOString()
    })));
  } catch (err) {
    logger.error('Error in GET /messages', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;