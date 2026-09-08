const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent || req.aborted) {
    logger.warn(`API Error occurred after connection aborted / headers sent: ${err.message}`);
    return next(err);
  }

  logger.error(`API Error: ${err.message}`, { stack: err.stack, path: req.path, method: req.method });

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
