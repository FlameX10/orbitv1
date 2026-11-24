/**
 * Clears all lead and call data so the dashboard starts fresh from new calls.
 * KEEPS: dashboard login users and the agent configuration.
 * DELETES: leads, call attempts, transcripts, qualification results, callbacks,
 *          webhook event log, and pending/queued app jobs (calls, callbacks,
 *          post-call processing, cost fetches).
 *
 * Usage: npm run db:clear-calls -- --yes
 */
const prisma = require('../config/prisma');

const APP_QUEUES = [
  'call-lead-queue',
  'callback-lead-queue',
  'post-call-processing-queue',
  'fetch-call-cost-queue'
];

async function run() {
  if (!process.argv.includes('--yes')) {
    console.log('This permanently deletes ALL leads, calls, transcripts, callbacks and results.');
    console.log('Login users and agent configuration are kept.');
    console.log('Re-run with --yes to confirm:  npm run db:clear-calls -- --yes');
    return;
  }

  const counts = await prisma.$transaction(async (tx) => ({
    messages: (await tx.conversationMessage.deleteMany({})).count,
    qualificationResults: (await tx.qualificationResult.deleteMany({})).count,
    callbacks: (await tx.callback.deleteMany({})).count,
    callAttempts: (await tx.callAttempt.deleteMany({})).count,
    webhookEvents: (await tx.webhookEvent.deleteMany({})).count,
    leads: (await tx.lead.deleteMany({})).count
  }));
  console.log('Deleted:', counts);

  // Remove queued jobs so no old call, callback or cost job runs against deleted data.
  const list = APP_QUEUES.map(q => `'${q}'`).join(', ');
  for (const table of ['pgboss.job', 'pgboss.archive']) {
    try {
      const n = await prisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE name IN (${list})`);
      console.log(`Cleared ${n} job(s) from ${table}.`);
    } catch (err) {
      console.log(`Skipped ${table}: ${err.message}`);
    }
  }

  console.log('Done. Users and agent configuration were kept.');
}

run()
  .catch(err => {
    console.error('Failed to clear call data:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
