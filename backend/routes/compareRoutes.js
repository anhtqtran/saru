const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  const { productId } = req.body;
  if (!productId || !ObjectId.isValid(productId)) {
    logger.warn('Invalid productId provided', { productId, correlationId: req.correlationId });
    return res.status(400).json({ error: 'Invalid or missing productId' });
  }

  try {
    const productExists = await collections.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!productExists) {
      logger.warn('Product not found for compare', { productId, correlationId: req.correlationId });
      return res.status(404).json({ error: 'Product not found' });
    }

    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const compareCollection = collections.database.collection('compares');
      let compare = await compareCollection.findOne({ AccountID });

      if (!compare) {
        compare = { AccountID, items: [productId] };
        await compareCollection.insertOne(compare);
      } else if (!compare.items.includes(productId)) {
        await compareCollection.updateOne(
          { AccountID },
          { $push: { items: productId } }
        );
      }
      const updatedCompare = await compareCollection.findOne({ AccountID });
      logger.info('Added to compare list in MongoDB', { AccountID, compareList: updatedCompare.items, correlationId: req.correlationId });
      res.json({ message: 'Added to compare list', compareList: updatedCompare.items });
    } else {
      req.session.compareList = req.session.compareList || [];
      if (!req.session.compareList.includes(productId)) {
        req.session.compareList.push(productId);
      }
      logger.info('Added to compare list in session', { sessionId: req.sessionID, compareList: req.session.compareList, correlationId: req.correlationId });
      res.json({ message: 'Added to compare list', compareList: req.session.compareList });
    }
  } catch (err) {
    logger.error('Error in POST /compare', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const compareCollection = collections.database.collection('compares');
      let compare = await compareCollection.findOne({ AccountID });

      if (!compare && req.session.compareList?.length > 0) {
        await compareCollection.insertOne({ AccountID, items: req.session.compareList });
        compare = await compareCollection.findOne({ AccountID });
        req.session.compareList = [];
        logger.info('Synchronized compare list from session to MongoDB', { AccountID, correlationId: req.correlationId });
      }

      const items = compare ? compare.items : [];
      const products = await collections.productCollection
        .find({ _id: { $in: items.map(id => new ObjectId(id)) } })
        .toArray();
      logger.info('Fetched compare list from MongoDB', { AccountID, compareList: items, correlationId: req.correlationId });
      res.json(products);
    } else {
      const compareList = req.session.compareList || [];
      const products = await collections.productCollection
        .find({ _id: { $in: compareList.map(id => new ObjectId(id)) } })
        .toArray();
      logger.info('Fetched compare list from session', { sessionId: req.sessionID, compareList, correlationId: req.correlationId });
      res.json(products);
    }
  } catch (err) {
    logger.error('Error in GET /compare', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:productId', authenticateToken, async (req, res) => {
  const { productId } = req.params;
  if (!productId || !ObjectId.isValid(productId)) {
    logger.warn('Invalid productId provided for deletion', { productId, correlationId: req.correlationId });
    return res.status(400).json({ error: 'Invalid productId' });
  }

  try {
    if (req.isAuthenticated) {
      const AccountID = req.account.AccountID;
      const compareCollection = collections.database.collection('compares');
      await compareCollection.updateOne(
        { AccountID },
        { $pull: { items: productId } }
      );
      const updatedCompare = await compareCollection.findOne({ AccountID });
      logger.info('Removed from compare list in MongoDB', { AccountID, compareList: updatedCompare ? updatedCompare.items : [], correlationId: req.correlationId });
      res.json({ message: 'Removed from compare list', compareList: updatedCompare ? updatedCompare.items : [] });
    } else {
      req.session.compareList = (req.session.compareList || []).filter(id => id !== productId);
      logger.info('Removed from compare list in session', { sessionId: req.sessionID, compareList: req.session.compareList, correlationId: req.correlationId });
      res.json({ message: 'Removed from compare list', compareList: req.session.compareList });
    }
  } catch (err) {
    logger.error('Error in DELETE /compare/:productId', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;