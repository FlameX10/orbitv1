const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initSocketServer } = require('./websocket/socket.server');
const { startWorkers } = require('./workers/queueWorker');
const agentService = require('./services/agent.service');

const server = http.createServer(app);

// Initialize Socket.IO engine
initSocketServer(server);

// Handle socket client connection errors gracefully (prevent ECONNABORTED / ECONNRESET uncaught crashes)
server.on('clientError', (err, socket) => {
  if (['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT'].includes(err.code) || socket.destroyed) {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
    return;
  }
  logger.warn('HTTP server client connection error:', { error: err.message, code: err.code });
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.listen(env.port, async () => {
  logger.info(`=======================================================`);
  logger.info(` Vedron AI Voice Agent Server active on port [${env.port}]`);
  logger.info(` Environment: [${env.nodeEnv}]`);
  logger.info(` Default Timezone: [${env.defaultTimezone}]`);
  logger.info(` Max Concurrent Calls Limit: [${env.maxConcurrentCalls}]`);
  logger.info(`=======================================================`);

  try {
    // Ensure default agent persona exists in database
    await agentService.getOrCreateDefaultAgent();

    // Start PostgreSQL queue worker pool inside server process (or standalone process)
    await startWorkers();
  } catch (err) {
    logger.warn('Server initialized with warning:', { error: err.message });
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection at Promise', { reason: reason instanceof Error ? reason.message : reason });
});

process.on('uncaughtException', (err) => {
  if (['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(err.code)) {
    logger.warn(`Network socket connection aborted by client (${err.code}): ${err.message}`);
    return;
  }
  logger.error('Uncaught Exception thrown', { error: err.message, stack: err.stack });
});

