const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const twilioService = require('../integrations/twilio/twilio.service');
const elevenLabsService = require('../integrations/elevenlabs/elevenlabs.service');
const plivoService = require('../integrations/plivo/plivo.service');
const agentService = require('./agent.service');
const { broadcastEvent } = require('../websocket/socket.server');

class CallService {
  /**
   * Check active calls count against MAX_CONCURRENT_CALLS limit
   */
  async canInitiateCall() {
    const activeCount = await prisma.callAttempt.count({
      where: {
        status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
      }
    });

    const allowed = activeCount < env.maxConcurrentCalls;
    logger.info(`Concurrency Check: Active Calls [${activeCount}] / Max Allowed [${env.maxConcurrentCalls}] -> Allowed: ${allowed}`);
    return { allowed, activeCount, max: env.maxConcurrentCalls };
  }

  /**
   * Reserve a call slot and create the initiating attempt atomically.
   *
   * The advisory lock prevents concurrent workers from passing the active-call
   * check against the same count before either worker has created its attempt.
   */
  async reserveCallAttempt({ lead, agent, attemptReason }) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('orbit:call-capacity'))`;

      const existingAttempt = await tx.callAttempt.findFirst({
        where: {
          leadId: lead.id,
          status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (existingAttempt) {
        return { attempt: existingAttempt, reused: true };
      }

      const activeCount = await tx.callAttempt.count({
        where: {
          status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
        }
      });

      const allowed = activeCount < env.maxConcurrentCalls;
      logger.info(`Concurrency Check: Active Calls [${activeCount}] / Max Allowed [${env.maxConcurrentCalls}] -> Allowed: ${allowed}`);

      if (!allowed) {
        logger.warn(`Concurrency limit reached (${activeCount}/${env.maxConcurrentCalls}). Re-queueing job.`);
        throw new Error(`Concurrency limit reached. Active calls: ${activeCount}`);
      }

      const previousAttemptsCount = await tx.callAttempt.count({
        where: { leadId: lead.id }
      });

      const callAttempt = await tx.callAttempt.create({
        data: {
          leadId: lead.id,
          agentId: agent.id,
          attemptNumber: previousAttemptsCount + 1,
          status: 'INITIATING',
          reason: attemptReason,
          startedAt: new Date()
        }
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'CALLING' }
      });

      return { attempt: callAttempt, reused: false };
    });
  }

  /**
   * Initiate call attempt for a lead
   */
  async initiateCallForLead(leadId, attemptReason = 'new_lead') {
    // 1. Fetch Lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      throw new Error(`Lead [${leadId}] not found.`);
    }

    if (lead.status === 'DO_NOT_CALL') {
      logger.warn(`Rule 1 violation prevented: Cannot call lead marked DO_NOT_CALL [${lead.id}]`);
      return null;
    }

    // A queue retry must reuse the existing active attempt instead of
    // triggering a second provider call for the same lead.
    const existingAttempt = await prisma.callAttempt.findFirst({
      where: {
        leadId: lead.id,
        status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (existingAttempt) {
      logger.warn(`Active call attempt already exists for Lead [${lead.id}]. Reusing attempt [${existingAttempt.id}].`);
      return existingAttempt;
    }

    // 2. Get Default Agent Config
    const agent = await agentService.getOrCreateDefaultAgent();

    // 3. Reserve capacity and create the attempt as one atomic operation.
    const reservation = await this.reserveCallAttempt({
      lead,
      agent,
      attemptReason
    });
    if (reservation.reused) {
      logger.warn(`Active call attempt already exists for Lead [${lead.id}]. Reusing attempt [${reservation.attempt.id}].`);
      return reservation.attempt;
    }
    const callAttempt = reservation.attempt;

    // 4. Trigger Plivo Native AI Agent Outbound Call
    let callResult = null;
    try {
      callResult = await plivoService.triggerOutboundAgentCall({
        to: lead.phone,
        leadId: lead.id,
        callAttemptId: callAttempt.id,
        leadData: lead
      });

      const callUuid = callResult.callUuid;

      // Update callAttempt with Plivo Call UUID and Region metadata
      const updatedAttempt = await prisma.callAttempt.update({
        where: { id: callAttempt.id },
        data: {
          plivoCallUuid: callUuid,
          plivoTriggerApiId: callResult.triggerApiId || null,
          plivoFlowId: callResult.flowId || null,
          plivoConversationId: callResult.conversationId || null,
          plivoFlowRunUuid: callResult.flowRunUuid || null,
          plivoRegion: callResult.region,
          status: 'IN_PROGRESS',
          answeredAt: new Date()
        }
      });

      // Insert initial system/opening conversation message
      await this.logConversationMessage({
        callAttemptId: callAttempt.id,
        role: 'AI',
        content: agent.openingMessage
      });

      return updatedAttempt;
    } catch (err) {
      logger.error('Failed to initiate Plivo call attempt', { callAttemptId: callAttempt.id, error: err.message });

      // Plivo may have accepted the call even if persisting the response failed.
      // Do not rethrow in that case: a queue retry would trigger a duplicate call.
      if (callResult && !callResult.isMock) {
        try {
          const recoveredAttempt = await prisma.callAttempt.update({
            where: { id: callAttempt.id },
            data: {
              plivoCallUuid: callResult.callUuid || undefined,
              plivoTriggerApiId: callResult.triggerApiId || undefined,
              plivoFlowId: callResult.flowId || undefined,
              plivoConversationId: callResult.conversationId || undefined,
              plivoFlowRunUuid: callResult.flowRunUuid || undefined,
              plivoRegion: callResult.region || undefined,
              status: 'IN_PROGRESS',
              answeredAt: new Date()
            }
          });
          logger.warn(`Recovered provider-accepted call attempt [${callAttempt.id}] without retrying the provider request.`);
          return recoveredAttempt;
        } catch (recoveryError) {
          logger.error('Could not persist provider-accepted call identifiers', {
            callAttemptId: callAttempt.id,
            error: recoveryError.message
          });
          return callAttempt;
        }
      }
      
      await prisma.callAttempt.update({
        where: { id: callAttempt.id },
        data: {
          status: 'FAILED',
          failureReason: err.message,
          endedAt: new Date()
        }
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'FAILED' }
      });

      throw err;
    }
  }

  async monitorProviderCall(callAttemptId, callSid, checks = 0) {
    if (!callSid || callSid.startsWith('CA_MOCK') || checks >= 24) return;

    setTimeout(async () => {
      try {
        const providerCall = await twilioService.getCallStatus(callSid);
        if (!providerCall) return;

        const terminalStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer'];
        await this.handleTwilioStatusCallback({
          callAttemptId,
          CallSid: callSid,
          CallStatus: providerCall.status,
          CallDuration: providerCall.duration
        });

        if (!terminalStatuses.includes(providerCall.status)) {
          this.monitorProviderCall(callAttemptId, callSid, checks + 1);
        }
      } catch (err) {
        logger.warn('Unable to reconcile provider call status', { callAttemptId, error: err.message });
        this.monitorProviderCall(callAttemptId, callSid, checks + 1);
      }
    }, 5000);
  }

  /**
   * Log an isolated conversation message for a call attempt
   */
  async logConversationMessage({ callAttemptId, role, content, metadata = {} }) {
    if (!callAttemptId || !content) return null;

    return await prisma.conversationMessage.create({
      data: {
        callAttemptId,
        role,
        content,
        metadata
      }
    });
  }

  /**
   * Update Call Attempt Status from Webhook events
   */
  async handleTwilioStatusCallback(data) {
    const { callAttemptId, CallSid, CallStatus, CallDuration } = data;

    logger.info(`Twilio Status Callback received: SID [${CallSid}] Status [${CallStatus}]`, { callAttemptId });

    let attempt = null;
    if (callAttemptId) {
      attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
    } else if (CallSid) {
      attempt = await prisma.callAttempt.findUnique({ where: { twilioCallSid: CallSid } });
    }

    if (!attempt) {
      logger.warn(`No call attempt found for Twilio SID: ${CallSid}`);
      return null;
    }

    let nextStatus = attempt.status;
    let leadStatus = null;

    switch (CallStatus.toLowerCase()) {
      case 'initiated':
        nextStatus = 'INITIATING';
        break;
      case 'ringing':
        nextStatus = 'RINGING';
        break;
      case 'in-progress':
      case 'answered':
        nextStatus = 'IN_PROGRESS';
        leadStatus = 'CONNECTED';
        break;
      case 'completed':
        nextStatus = 'COMPLETED';
        if (attempt.status !== 'QUALIFIED' && attempt.status !== 'NOT_QUALIFIED') {
          leadStatus = 'COMPLETED';
        }
        break;
      case 'no-answer':
        nextStatus = 'NO_ANSWER';
        leadStatus = 'NO_ANSWER';
        break;
      case 'busy':
        nextStatus = 'BUSY';
        leadStatus = 'NO_ANSWER';
        break;
      case 'failed':
      case 'canceled':
        nextStatus = 'FAILED';
        leadStatus = 'FAILED';
        break;
    }

    const durationSeconds = CallDuration ? parseInt(CallDuration, 10) : attempt.duration;

    const updatedAttempt = await prisma.callAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextStatus,
        answeredAt: (CallStatus.toLowerCase() === 'in-progress' || CallStatus.toLowerCase() === 'answered') ? (attempt.answeredAt || new Date()) : attempt.answeredAt,
        endedAt: ['completed', 'no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus.toLowerCase()) ? new Date() : attempt.endedAt,
        duration: durationSeconds
      }
    });

    if (leadStatus) {
      await prisma.lead.update({
        where: { id: attempt.leadId },
        data: { status: leadStatus }
      });
    }

    return updatedAttempt;
  }

  async getActiveCalls() {
    return await prisma.callAttempt.findMany({
      where: {
        status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
      },
      include: {
        lead: true,
        messages: { orderBy: { timestamp: 'desc' }, take: 2 }
      },
      orderBy: { startedAt: 'desc' }
    });
  }

  async getCallById(id) {
    return await prisma.callAttempt.findUnique({
      where: { id },
      include: {
        lead: true,
        agent: true,
        messages: { orderBy: { timestamp: 'asc' } },
        qualificationResult: true,
        callbacks: true
      }
    });
  }

  async listCalls({ page = 1, limit = 20, status }) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [calls, total] = await Promise.all([
      prisma.callAttempt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead: true,
          qualificationResult: true
        }
      }),
      prisma.callAttempt.count({ where })
    ]);

    return { calls, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Terminate an active call attempt
   */
  async endActiveCall(callAttemptId) {
    const attempt = await prisma.callAttempt.findUnique({
      where: { id: callAttemptId },
      include: { lead: true }
    });

    if (!attempt) {
      throw new Error(`Call attempt [${callAttemptId}] not found.`);
    }

    const activeStatuses = ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'];
    if (!activeStatuses.includes(attempt.status)) {
      logger.info(`Call [${callAttemptId}] is already in terminal state [${attempt.status}]. Skipping termination.`);
      return attempt;
    }

    let terminationError = null;
    if (attempt.plivoCallUuid) {
      try {
        await plivoService.terminateCall({
          callUuid: attempt.plivoCallUuid,
          region: attempt.plivoRegion || 'US'
        });
      } catch (err) {
        terminationError = err;
        logger.error(`Provider termination failed for call [${callAttemptId}]`, {
          error: err.message,
          callUuid: attempt.plivoCallUuid
        });
      }
    }

    const updatedAttempt = await prisma.callAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'CANCELED',
        endedAt: new Date(),
        duration: attempt.duration || (attempt.startedAt
          ? Math.max(1, Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000))
          : null),
        failureReason: terminationError
          ? `User terminated call, but provider termination failed: ${terminationError.message}`
          : 'User terminated call from dashboard controls.'
      }
    });

    if (attempt.leadId) {
      await prisma.lead.update({
        where: { id: attempt.leadId },
        data: { status: 'COMPLETED' }
      });
    }

    broadcastEvent('call_status_change', {
        callAttemptId: updatedAttempt.id,
        status: updatedAttempt.status,
        leadId: updatedAttempt.leadId
    });

    return updatedAttempt;
  }
}

module.exports = new CallService();
