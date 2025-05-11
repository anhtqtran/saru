const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

function correlationIdMiddleware(req, res, next) {
  const correlationId = uuidv4();
  req.correlationId = correlationId;
  logger.debug('Generated correlation ID', { correlationId });
  next();
}

module.exports = { correlationIdMiddleware };