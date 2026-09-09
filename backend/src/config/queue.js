const PgBoss = require('pg-boss');
const env = require('./env');
const logger = require('./logger');

let bossInstance = null;

const JOB_QUEUES = {
  CALL_LEAD: 'call-lead-queue',
  CALLBACK_LEAD: 'callback-lead-queue',
  POST_CALL_PROCESSING: 'post-call-processing-queue'
};

async function initQueue() {
  if (bossInstance) return bossInstance;

  try {
    const isSupabase = env.databaseUrl.includes('supabase.co') || env.databaseUrl.includes('supabase.com');
    const cleanConnectionString = isSupabase
      ? env.databaseUrl.replace(/([?&])sslmode=[^&]+(&|$)/, '$1').replace(/[?&]$/, '')
      : env.databaseUrl;
    const boss = new PgBoss({
      connectionString: cleanConnectionString,
      ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
      max: 10,
      application_name: 'ai-voice-agent-worker'
    });

    boss.on('error', (err) => logger.error('pg-boss error:', { error: err.message }));

    await boss.start();
    logger.info('pg-boss queue initialized successfully on PostgreSQL');

    // Create required queues
    await boss.createQueue(JOB_QUEUES.CALL_LEAD);
    await boss.createQueue(JOB_QUEUES.CALLBACK_LEAD);
    await boss.createQueue(JOB_QUEUES.POST_CALL_PROCESSING);

    bossInstance = boss;
    return bossInstance;
  } catch (err) {
    logger.warn('Failed to start pg-boss directly. Using fallback DB queue runner mode.', { error: err.message });
    return null;
  }
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
  
  if (boss) {
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
  } else {
    throw new Error(`Queue is unavailable; ${queueName} was not scheduled. Check PostgreSQL and pg-boss worker startup.`);
  }
}

module.exports = {
  initQueue,
  getQueue,
  scheduleJob,
  JOB_QUEUES
};
