const express = require('express');
const router = express.Router();
const { logger } = require('../middleware/logger');
const { transporter } = require('../utils/mailer');

router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    logger.warn('Missing required fields for contact email', { body: req.body, correlationId: req.correlationId });
    return res.status(400).json({ message: 'Name, email, and message are required' });
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_USER,
      subject: `Contact Form Submission from ${name}`,
      text: `From: ${name}\nEmail: ${email}\nMessage: ${message}`
    };

    await transporter.sendMail(mailOptions);
    logger.info('Contact email sent', { email, correlationId: req.correlationId });
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (err) {
    logger.error('Error in POST /email/contact', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;