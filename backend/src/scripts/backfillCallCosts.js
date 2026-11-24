/**
 * One-time backfill:
 *  1. clears call durations that were estimated instead of reported by Plivo;
 *  2. fetches the exact duration and real charge from Plivo for past calls.
 * Plivo keeps CDRs for 90 days, so older calls are skipped (their unknown
 * durations stay empty rather than estimated).
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

  // Step 1: remove durations that were estimated (time since call start) rather
  // than reported by Plivo. Stale-reaped and dashboard-ended calls never received
  // a provider duration, so their stored values are not real call time.
  const cleared = await prisma.callAttempt.updateMany({
    where: {
      duration: { not: null },
      OR: [
        { failureReason: { startsWith: 'STALE_REAPED' } },
        { status: 'CANCELED' }
      ]
    },
    data: { duration: null }
  });
  logger.info(`Cleared ${cleared.count} estimated (non-provider) call duration(s).`);

  // Step 2: fetch exact duration and cost from Plivo.
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
