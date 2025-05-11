const express = require('express');
const router = express.Router();
const { collections, ObjectId } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.category) filter.BlogCategoryID = req.query.category;

    const blogs = await collections.blogCollection
      .find(filter)
      .sort({ DatePosted: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await collections.blogCollection.countDocuments(filter);

    const blogCategoryIDs = [...new Set(blogs.map(blog => blog.BlogCategoryID))];
    const categories = await collections.blogCategoryCollection
      .find({ BlogCategoryID: { $in: blogCategoryIDs } })
      .toArray();
    const categoryMap = categories.reduce((acc, cat) => {
      acc[cat.BlogCategoryID] = cat.BlogCategoryName;
      return acc;
    }, {});

    const blogsWithDetails = blogs.map(blog => ({
      ...blog,
      BlogCategoryName: categoryMap[blog.BlogCategoryID] || 'Unknown',
      _id: blog._id.toHexString()
    }));

    logger.info('Fetched blogs', { count: blogs.length, page, limit, correlationId: req.correlationId });
    res.json({
      data: blogsWithDetails,
      pagination: { currentPage: page, totalPages: Math.ceil(total / limit), totalItems: total }
    });
  } catch (err) {
    logger.error('Error in GET /blogs', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      logger.warn('Invalid blog ID provided', { id: req.params.id, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Invalid blog ID' });
    }

    const blog = await collections.blogCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!blog) {
      logger.info('Blog not found', { id: req.params.id, correlationId: req.correlationId });
      return res.status(404).json({ message: 'Blog not found' });
    }

    const category = await collections.blogCategoryCollection.findOne({ BlogCategoryID: blog.BlogCategoryID });
    logger.info('Fetched blog detail', { blogId: req.params.id, correlationId: req.correlationId });
    res.json({
      ...blog,
      BlogCategoryName: category ? category.BlogCategoryName : 'Unknown',
      _id: blog._id.toHexString()
    });
  } catch (err) {
    logger.error('Error in GET /blogs/:id', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized blog creation attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { title, content, BlogCategoryID } = req.body;
  if (!title || !content || !BlogCategoryID) {
    logger.warn('Missing required fields for blog creation', { body: req.body, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const categoryExists = await collections.blogCategoryCollection.findOne({ BlogCategoryID });
    if (!categoryExists) {
      logger.warn('Invalid BlogCategoryID provided', { BlogCategoryID, correlationId: req.correlationId });
      return res.status(400).json({ message: 'Invalid BlogCategoryID' });
    }

    const newBlog = {
      BlogID: `blog_${Date.now()}`,
      BlogCategoryID,
      BlogTitle: title,
      BlogContent: content,
      DatePosted: new Date(),
      Author: req.account.AccountID
    };
    await collections.blogCollection.insertOne(newBlog);
    logger.info('Blog created', { blogId: newBlog.BlogID, correlationId: req.correlationId });
    res.status(201).json({ message: 'Blog created', blog: { ...newBlog, _id: newBlog._id.toHexString() } });
  } catch (err) {
    logger.error('Error in POST /blogs', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;