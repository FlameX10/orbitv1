const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const twilioService = require('../integrations/twilio/twilio.service');
const agentService = require('./agent.service');

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

    // 2. Concurrency guard
    const concurrency = await this.canInitiateCall();
    if (!concurrency.allowed) {
      logger.warn(`Concurrency limit reached (${concurrency.activeCount}/${concurrency.max}). Re-queueing job.`);
      throw new Error(`Concurrency limit reached. Active calls: ${concurrency.activeCount}`);
    }

    // 3. Get Default Agent Config
    const agent = await agentService.getOrCreateDefaultAgent();

    // 4. Calculate attempt number
    const previousAttemptsCount = await prisma.callAttempt.count({
      where: { leadId }
    });
    const attemptNumber = previousAttemptsCount + 1;

    // 5. Create CallAttempt record
    const callAttempt = await prisma.callAttempt.create({
      data: {
        leadId: lead.id,
        agentId: agent.id,
        attemptNumber,
        status: 'INITIATING',
        reason: attemptReason,
        startedAt: new Date()
      }
    });

    // 6. Update Lead status to CALLING
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'CALLING' }
    });

    // 7. Trigger Twilio Call
    try {
      const twilioResult = await twilioService.createOutboundCall({
        to: lead.phone,
        leadId: lead.id,
        callAttemptId: callAttempt.id
      });

      // Update callAttempt with Twilio Call SID
      const updatedAttempt = await prisma.callAttempt.update({
        where: { id: callAttempt.id },
        data: {
          twilioCallSid: twilioResult.sid,
          elevenLabsSessionId: twilioResult.conversationId || null,
          status: 'RINGING'
        }
      });

      this.monitorProviderCall(callAttempt.id, twilioResult.sid);

      // Insert initial system/opening conversation message
      await this.logConversationMessage({
        callAttemptId: callAttempt.id,
        role: 'AI',
        content: agent.openingMessage
      });

      return updatedAttempt;
    } catch (err) {
      logger.error('Failed to initiate Twilio call attempt', { callAttemptId: callAttempt.id, error: err.message });
      
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
}

module.exports = new CallService();
