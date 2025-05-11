const express = require('express');
const router = express.Router();
const { collections } = require('../utils/db');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const faqs = await collections.faqCollection.find().toArray();
    logger.info('Fetched FAQs', { count: faqs.length, correlationId: req.correlationId });
    res.json(faqs);
  } catch (err) {
    logger.error('Error in GET /faqs', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized FAQ creation attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { question, answer } = req.body;
  if (!question || !answer) {
    logger.warn('Missing required fields for FAQ creation', { body: req.body, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Question and answer are required' });
  }

  try {
    const newFAQ = {
      FAQID: `faq_${Date.now()}`,
      Question: question,
      Answer: answer,
      DatePosted: new Date()
    };
    await collections.faqCollection.insertOne(newFAQ);
    logger.info('FAQ created', { faqId: newFAQ.FAQID, correlationId: req.correlationId });
    res.status(201).json({ message: 'FAQ created', faq: newFAQ });
  } catch (err) {
    logger.error('Error in POST /faqs', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;