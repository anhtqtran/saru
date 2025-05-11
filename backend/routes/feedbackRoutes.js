const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized review submission attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { productId, rating, content } = req.body;
  if (!productId || !ObjectId.isValid(productId) || !rating || rating < 1 || rating > 5 || !content) {
    logger.warn('Invalid review data provided', { body: req.body, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Invalid review data' });
  }

  try {
    const product = await collections.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      logger.warn('Product not found for review', { productId, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Product not found' });
    }

    const newReview = {
      ReviewID: `review_${Date.now()}`,
      ProductID: product.ProductID,
      CustomerID: req.account.CustomerID,
      Rating: rating,
      Content: content,
      DatePosted: new Date()
    };
    await collections.reviewCollection.insertOne(newReview);
    logger.info('Review submitted', { reviewId: newReview.ReviewID, productId, correlationId: req.correlationId });
    res.status(201).json({ message: 'Review submitted successfully', review: newReview });
  } catch (err) {
    logger.error('Error in POST /feedbacks', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/product/:productId', async (req, res) => {
  const { productId } = req.params;
  if (!productId || !ObjectId.isValid(productId)) {
    logger.warn('Invalid productId for reviews', { productId, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Invalid productId' });
  }

  try {
    const product = await collections.productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      logger.info('Product not found for reviews', { productId, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Product not found' });
    }

    const reviews = await collections.reviewCollection
      .find({ ProductID: product.ProductID })
      .sort({ DatePosted: -1 })
      .toArray();

    const reviewsWithDetails = reviews.map(review => ({
      ...review,
      _id: review._id.toHexString(),
      DatePosted: review.DatePosted.toISOString()
    }));

    logger.info('Fetched reviews for product', { productId, count: reviews.length, correlationId: req.correlationId });
    res.json(reviewsWithDetails);
  } catch (err) {
    logger.error('Error in GET /feedbacks/product/:productId', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;