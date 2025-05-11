const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const memberships = await collections.membershipCollection.find().toArray();
    logger.info('Fetched memberships', { count: memberships.length, correlationId: req.correlationId });
    res.json(memberships);
  } catch (err) {
    logger.error('Error in GET /memberships', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.post('/subscribe', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized membership subscription attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { MemberID } = req.body;
  if (!MemberID) {
    logger.warn('Missing MemberID for subscription', { correlationId: req.correlationId });
    return res.status(400).json({ message: 'MemberID is required' });
  }

  try {
    const membership = await collections.membershipCollection.findOne({ MemberID });
    if (!membership) {
      logger.warn('Invalid MemberID provided', { MemberID, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Invalid MemberID' });
    }

    await collections.customerCollection.updateOne(
      { CustomerID: req.account.CustomerID },
      { $set: { MemberID } }
    );
    logger.info('Membership subscribed', { customerId: req.account.CustomerID, MemberID, correlationId: req.correlationId });
    res.json({ message: 'Membership subscribed successfully' });
  } catch (err) {
    logger.error('Error in POST /memberships/subscribe', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;