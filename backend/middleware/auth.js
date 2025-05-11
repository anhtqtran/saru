const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.isAuthenticated = false;
    logger.debug('No token provided', { path: req.path, correlationId: req.correlationId });
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.account = decoded;
    req.isAuthenticated = true;
    next();
  } catch (err) {
    logger.warn('Invalid token', { error: err.message, path: req.path, correlationId: req.correlationId });
    res.status(403).json({ message: 'Token không hợp lệ.' });
  }
}

module.exports = { authenticateToken };