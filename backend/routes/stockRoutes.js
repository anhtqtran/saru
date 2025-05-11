const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/:productId', async (req, res) => {
  const { productId } = req.params;
  if (!productId || !ObjectId.isValid(productId)) {
    logger.warn('Invalid productId for stock', { productId, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Invalid productId' });
  }

  try {
    const product = await collections.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      logger.info('Product not found for stock', { productId, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Product not found' });
    }

    const stock = await collections.productstockCollection.findOne({ ProductID: product.ProductID });
    logger.info('Fetched stock for product', { productId, stockQuantity: stock?.StockQuantity || 0, correlationId: req.correlationId });
    res.json({ productId: product.ProductID, stockQuantity: stock?.StockQuantity || 0 });
  } catch (err) {
    logger.error('Error in GET /productstocks/:productId', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:productId', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized stock update attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { productId } = req.params;
  const { stockQuantity } = req.body;
  if (!productId || !ObjectId.isValid(productId) || stockQuantity === undefined || stockQuantity < 0) {
    logger.warn('Invalid data for stock update', { productId, stockQuantity, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Invalid productId or stockQuantity' });
  }

  try {
    const product = await collections.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      logger.info('Product not found for stock update', { productId, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Product not found' });
    }

    await collections.productstockCollection.updateOne(
      { ProductID: product.ProductID },
      { $set: { StockQuantity: stockQuantity } },
      { upsert: true }
    );
    logger.info('Updated stock for product', { productId, stockQuantity, correlationId: req.correlationId });
    res.json({ message: 'Stock updated successfully' });
  } catch (err) {
    logger.error('Error in PUT /productstocks/:productId', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;