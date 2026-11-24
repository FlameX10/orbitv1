/**
 * One-time backfill: fetch the real Plivo charge for past calls that have no cost yet.
 * Plivo keeps CDRs for 90 days, so older calls are skipped.
 *
 * Usage (Render shell or locally with production env):
 *   npm run costs:backfill            -> process calls from the last 90 days
 *   npm run costs:backfill -- 30      -> only the last 30 days
 */
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const costService = require('../services/cost.service');

async function run() {
  const days = Math.min(Math.max(parseInt(process.argv[2] || '90', 10) || 90, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const attempts = await prisma.callAttempt.findMany({
    where: {
      createdAt: { gte: since },
      status: { notIn: ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] },
      OR: [{ costStatus: null }, { costStatus: 'PENDING' }, { costStatus: 'UNAVAILABLE' }]
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' }
  });

  logger.info(`Backfilling call costs for ${attempts.length} call attempt(s) from the last ${days} day(s).`);
  const counts = {};
  for (const { id } of attempts) {
    try {
      const result = await costService.fetchAndStoreCallCost(id, { finalAttempt: true });
      counts[result.status] = (counts[result.status] || 0) + 1;
    } catch (err) {
      counts.ERROR = (counts.ERROR || 0) + 1;
      logger.warn(`Backfill failed for CallAttempt [${id}]`, { error: err.message });
    }
    // Stay well under Plivo API rate limits.
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  logger.info('Call cost backfill finished', counts);
}

run()
  .catch(err => {
    logger.error('Call cost backfill crashed', { error: err.message });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
