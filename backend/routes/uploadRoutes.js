const express = require('express');
const router = express.Router();
const multer = require('multer');
const { logger } = require('../middleware/logger');
const { authenticateToken } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

router.post('/image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.isAuthenticated) {
    logger.warn('Unauthorized image upload attempt', { correlationId: req.correlationId });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    if (!req.file) {
      logger.warn('No file uploaded', { correlationId: req.correlationId });
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    logger.info('Image uploaded', { filename: req.file.filename, correlationId: req.correlationId });
    res.json({ message: 'Image uploaded successfully', url: imageUrl });
  } catch (err) {
    logger.error('Error in POST /upload/image', { error: err.message, correlationId: req.correlationId });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;