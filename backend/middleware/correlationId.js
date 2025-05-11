const { v4: uuidv4 } = require('uuid');

function correlationIdMiddleware(req, res, next) {
  req.correlationId = uuidv4();
  next();
}

module.exports = { correlationIdMiddleware };