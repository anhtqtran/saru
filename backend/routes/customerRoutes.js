const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/profile', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized profile access attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const customer = await collections.customerCollection.findOne({ CustomerID: req.account.CustomerID });
    if (!customer) {
      logger.info('Customer not found', { customerId: req.account.CustomerID, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Customer not found' });
    }
    logger.info('Fetched customer profile', { customerId: req.account.CustomerID, correlationId: req.correlationId });
    res.json({ ...customer, _id: customer._id.toHexString() });
  } catch (err) {
    logger.error('Error in GET /customers/profile', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized profile update attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { CustomerName, CustomerAdd, CustomerPhone, CustomerBirth, CustomerAvatar, ReceiveEmail } = req.body;
  try {
    const updateFields = {};
    if (CustomerName) updateFields.CustomerName = CustomerName;
    if (CustomerAdd) updateFields.CustomerAdd = CustomerAdd;
    if (CustomerPhone) updateFields.CustomerPhone = CustomerPhone;
    if (CustomerBirth) updateFields.CustomerBirth = CustomerBirth;
    if (CustomerAvatar) updateFields.CustomerAvatar = CustomerAvatar;
    if (typeof ReceiveEmail === 'boolean') updateFields.ReceiveEmail = ReceiveEmail;

    const result = await collections.customerCollection.updateOne(
      { CustomerID: req.account.CustomerID },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      logger.info('Customer not found for update', { customerId: req.account.CustomerID, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Customer not found' });
    }

    logger.info('Updated customer profile', { customerId: req.account.CustomerID, correlationId: req.correlationId });
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    logger.error('Error in PUT /customers/profile', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;