const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const categories = await collections.blogCategoryCollection.find().toArray();
    logger.info('Fetched blog categories', { count: categories.length, correlationId: req.correlationId });
    res.json(categories);
  } catch (err) {
    logger.error('Error in GET /categories', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized blog category creation attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { BlogCategoryName } = req.body;
  if (!BlogCategoryName) {
    logger.warn('Missing BlogCategoryName for category creation', { correlationId: req.correlationId });
    return res.status(400).json({ message: 'BlogCategoryName is required' });
  }

  try {
    const newCategory = {
      BlogCategoryID: `cat_${Date.now()}`,
      BlogCategoryName
    };
    await collections.blogCategoryCollection.insertOne(newCategory);
    logger.info('Blog category created', { categoryId: newCategory.BlogCategoryID, correlationId: req.correlationId });
    res.status(201).json({ message: 'Blog category created', category: newCategory });
  } catch (err) {
    logger.error('Error in POST /categories', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;