const { initQueue, JOB_QUEUES } = require('../config/queue');
const logger = require('../config/logger');
const callService = require('../services/call.service');
const qualificationService = require('../services/qualification.service');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { broadcastEvent } = require('../websocket/socket.server');

async function startWorkers() {
  logger.info('Initializing PostgreSQL Queue Workers (pg-boss)...');
  const boss = await initQueue();

  if (!boss) {
    logger.warn('pg-boss not active. Skipping standalone pg-boss worker subscriptions.');
    return;
  }

  // 1. Worker for CALL_LEAD jobs. Match worker capacity to the existing
  // application-wide call limit; the reservation lock remains authoritative.
  await boss.work(JOB_QUEUES.CALL_LEAD, { teamSize: env.maxConcurrentCalls }, async (jobs) => {
    await Promise.all(jobs.map(async (job) => {
      const { leadId, reason } = job.data;
      logger.info(`[Worker] Processing CALL_LEAD job for Lead ID [${leadId}]`, { jobId: job.id, reason });

      try {
        // Check DNC status before calling (Rule 1)
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead || lead.status === 'DO_NOT_CALL') {
          logger.warn(`[Worker] Lead [${leadId}] is missing or marked DO_NOT_CALL. Canceling job.`);
          return;
        }

        await callService.initiateCallForLead(leadId, reason || 'new_lead_job');
        logger.info(`[Worker] CALL_LEAD job executed successfully for Lead [${leadId}]`);
      } catch (err) {
        logger.error(`[Worker] CALL_LEAD job failed for Lead [${leadId}]`, { error: err.message });
        throw err; // Trigger pg-boss retry policy for the failed batch
      }
    }));
  });

  // 2. Worker for CALLBACK_LEAD jobs
  await boss.work(JOB_QUEUES.CALLBACK_LEAD, { teamSize: 3 }, async (jobs) => {
    for (const job of jobs) {
      const { callbackId, leadId } = job.data;
      logger.info(`[Worker] Processing CALLBACK_LEAD job for Callback ID [${callbackId}]`, { jobId: job.id });

      try {
      const callback = await prisma.callback.findUnique({
        where: { id: callbackId },
        include: { lead: true }
      });

      if (!callback || callback.status !== 'SCHEDULED' || callback.lead.status === 'DO_NOT_CALL') {
        logger.warn(`[Worker] Callback [${callbackId}] is no longer scheduled or lead is DO_NOT_CALL. Skipping.`);
        return;
      }

      // An older pg-boss job can remain after a callback is rescheduled.
      // Never execute it before the callback currently stored in Postgres.
      const remainingDelaySeconds = Math.ceil((callback.scheduledFor.getTime() - Date.now()) / 1000);
      if (remainingDelaySeconds > 0) {
        await boss.send(JOB_QUEUES.CALLBACK_LEAD, {
          callbackId,
          leadId,
          reason: 'scheduled_callback'
        }, { startAfter: remainingDelaySeconds, retryLimit: 3, retryBackoff: true });
        logger.info(`[Worker] Callback [${callbackId}] is not due yet. Re-queued for ${remainingDelaySeconds}s.`);
        return;
      }

      // Mark callback PROCESSING
      await prisma.callback.update({
        where: { id: callbackId },
        data: { status: 'PROCESSING' }
      });

      // Initiate outbound call for callback
      await callService.initiateCallForLead(leadId, `callback_${callbackId}`);

      // Mark callback COMPLETED
      await prisma.callback.update({
        where: { id: callbackId },
        data: { status: 'COMPLETED', executedAt: new Date() }
      });

      logger.info(`[Worker] Scheduled Callback [${callbackId}] executed successfully.`);
      } catch (err) {
        logger.error(`[Worker] CALLBACK_LEAD job failed for Callback [${callbackId}]`, { error: err.message });
        await prisma.callback.update({
          where: { id: callbackId },
          data: { status: 'FAILED' }
        });
        throw err;
      }
    }
  });

  // 3. Worker for POST_CALL_PROCESSING jobs
  await boss.work(JOB_QUEUES.POST_CALL_PROCESSING, { teamSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { callAttemptId } = job.data;
      logger.info(`[Worker] Processing POST_CALL_PROCESSING job for CallAttempt ID [${callAttemptId}]`);

      try {
        const attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
        if (!attempt) {
          logger.warn(`[Worker] CallAttempt ID [${callAttemptId}] not found in database. Skipping stale POST_CALL_PROCESSING job.`);
          return;
        }

        await qualificationService.processPostCallQualification(callAttemptId);
        logger.info(`[Worker] Post-call evaluation completed for CallAttempt ID [${callAttemptId}]`);
      } catch (err) {
        logger.error(`[Worker] Post-call processing failed for [${callAttemptId}]`, { error: err.message });
      }
    }
  });

  const reapStaleCalls = async () => {
    const cutoff = new Date(Date.now() - env.staleCallSeconds * 1000);
    const staleAttempts = await prisma.callAttempt.findMany({
      where: {
        status: { in: ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] },
        startedAt: { lt: cutoff }
      },
      select: { id: true, leadId: true, startedAt: true }
    });
    for (const attempt of staleAttempts) {
      const updated = await prisma.callAttempt.updateMany({
        where: {
          id: attempt.id,
          status: { in: ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
        },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          duration: Math.max(1, Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000)),
          failureReason: `STALE_REAPED: no provider hangup callback within ${env.staleCallSeconds}s`
        }
      });
      if (updated.count) {
        await prisma.lead.updateMany({
          where: { id: attempt.leadId, status: { in: ['CALLING', 'CONNECTED', 'QUALIFYING'] } },
          data: { status: 'FAILED' }
        });
        broadcastEvent('call_status_change', {
          callAttemptId: attempt.id,
          leadId: attempt.leadId,
          status: 'FAILED',
          reason: 'stale_call_reaped'
        });
      }
    }
    if (staleAttempts.length) {
      logger.warn('Reaped stale Plivo call attempts', { count: staleAttempts.length });
    }
  };

  const staleCallTimer = setInterval(() => {
    reapStaleCalls().catch(err => logger.error('Stale call reaper failed', { error: err.message }));
  }, Math.max(60, env.staleCallSeconds) * 1000);
  staleCallTimer.unref?.();
  await reapStaleCalls();

  logger.info('PostgreSQL Workers active and listening for queued jobs.');
}

module.exports = { startWorkers };
