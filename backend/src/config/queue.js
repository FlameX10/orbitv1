const PgBoss = require('pg-boss');
const env = require('./env');
const logger = require('./logger');

let bossInstance = null;
let queueInitialization = null;
let createBoss = (options) => new PgBoss(options);

const JOB_QUEUES = {
  CALL_LEAD: 'call-lead-queue',
  CALLBACK_LEAD: 'callback-lead-queue',
  POST_CALL_PROCESSING: 'post-call-processing-queue'
};

async function initQueue() {
  if (bossInstance) return bossInstance;
  if (queueInitialization) return queueInitialization;

  queueInitialization = (async () => {
    let boss = null;
    try {
      boss = createBoss({
        connectionString: env.databaseUrl,
        max: 10,
        application_name: 'ai-voice-agent-worker'
      });

      boss.on('error', (err) => logger.error('pg-boss error:', { error: err.message }));

      await boss.start();

      // Create required queues before making the instance available to callers.
      await boss.createQueue(JOB_QUEUES.CALL_LEAD);
      await boss.createQueue(JOB_QUEUES.CALLBACK_LEAD);
      await boss.createQueue(JOB_QUEUES.POST_CALL_PROCESSING);

      bossInstance = boss;
      logger.info('pg-boss queue initialized successfully on PostgreSQL');
      return bossInstance;
    } catch (err) {
      if (boss && typeof boss.stop === 'function') {
        try {
          await boss.stop();
        } catch (stopError) {
          logger.warn('Failed to clean up pg-boss after initialization error', { error: stopError.message });
        }
      }
      logger.error('pg-boss initialization failed; queue is unavailable', { error: err.message });
      throw new Error(`Queue initialization failed: ${err.message}`);
    } finally {
      queueInitialization = null;
    }
  })();

  return queueInitialization;
}

async function getQueue() {
  if (!bossInstance) {
    return await initQueue();
  }
  return bossInstance;
}

/**
 * Enqueue a job using pg-boss or fallback database record
 */
async function scheduleJob(queueName, data, options = {}) {
  const boss = await getQueue();
  
  if (!boss) {
    throw new Error(`Queue is unavailable; ${queueName} was not scheduled. Check PostgreSQL and pg-boss worker startup.`);
  }

  const sendOptions = {
    retryLimit: options.retryLimit || 3,
    retryDelay: options.retryDelay || 30, // 30 seconds
    retryBackoff: true
  };

  if (options.startAfter) {
    // delayed job (Date or seconds offset)
    if (typeof options.startAfter === 'number') {
      sendOptions.startAfter = options.startAfter; // seconds delay
    } else if (options.startAfter instanceof Date) {
      sendOptions.startAfter = options.startAfter;
    }
  }

  const jobId = await boss.send(queueName, data, sendOptions);
  logger.info(`Job enqueued to pg-boss [${queueName}]`, { jobId, data });
  return jobId;
}

module.exports = {
  initQueue,
  getQueue,
  scheduleJob,
  JOB_QUEUES,
  __setBossFactoryForTests(factory) {
    createBoss = factory;
  }
};
