const { startWorkers } = require('./queueWorker');
const logger = require('../config/logger');

async function run() {
  logger.info('Starting Standalone Queue Worker Process...');
  try {
    await startWorkers();
  } catch (err) {
    logger.error('Failed to start worker runner', { error: err.message });
    process.exit(1);
  }
}

run();
