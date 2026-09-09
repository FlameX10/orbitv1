const twilioService = require('../integrations/twilio/twilio.service');
const callService = require('../services/call.service');
const qualificationService = require('../services/qualification.service');
const agentService = require('../services/agent.service');
const schedulingService = require('../services/scheduling.service');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { broadcastEvent } = require('../websocket/socket.server');
const { scheduleJob, JOB_QUEUES } = require('../config/queue');
const crypto = require('crypto');

class WebhookController {
  constructor() {
    this.handleElevenLabsCallback = this.handleElevenLabsCallback.bind(this);
    this.handleElevenLabsTranscript = this.handleElevenLabsTranscript.bind(this);
  }

  /**
   * Twilio Initial Voice Connect Webhook (Generates TwiML)
   */
  async handleTwilioVoice(req, res) {
    try {
      const { callAttemptId } = req.query;
      const agent = await agentService.getOrCreateDefaultAgent();

      logger.info(`Twilio Voice Webhook connected for callAttemptId: [${callAttemptId}]`);

      // Update attempt status to ANSWERED / IN_PROGRESS
      if (callAttemptId) {
        await prisma.callAttempt.update({
          where: { id: callAttemptId },
          data: { status: 'IN_PROGRESS', answeredAt: new Date() }
        });
        broadcastEvent('call_status_change', { callAttemptId, status: 'IN_PROGRESS' });
      }

      // Generate TwiML
      const twiml = twilioService.generateTwiML({
        openingMessage: agent.openingMessage
      });

      res.type('text/xml');
      res.send(twiml);
    } catch (err) {
      logger.error('Twilio Voice Webhook error', { error: err.message });
      res.type('text/xml');
      res.send('<Response><Say>An error occurred. Good bye.</Say><Hangup/></Response>');
    }
  }

  /**
   * Twilio Status Callback Webhook (Idempotent tracking)
   */
  async handleTwilioStatus(req, res) {
    try {
      const { CallSid, CallStatus, SequenceNumber } = req.body;
      const eventId = `twilio_${CallSid}_${CallStatus}_${SequenceNumber || Date.now()}`;

      // 1. Idempotency Check
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { eventId }
      });

      if (existingEvent) {
        logger.info(`Idempotent Webhook Guard: Event [${eventId}] already processed. Skipping.`);
        return res.status(200).send('OK');
      }

      // Store Webhook event
      await prisma.webhookEvent.create({
        data: {
          provider: 'twilio',
          eventId,
          eventType: CallStatus,
          payload: req.body,
          processed: true,
          processedAt: new Date()
        }
      });

      // Update Call attempt status in database
      const updatedAttempt = await callService.handleTwilioStatusCallback({
        callAttemptId: req.query.callAttemptId,
        CallSid,
        CallStatus,
        CallDuration: req.body.CallDuration
      });

      if (updatedAttempt) {
        broadcastEvent('call_status_change', {
          callAttemptId: updatedAttempt.id,
          status: updatedAttempt.status,
          leadId: updatedAttempt.leadId
        });

        // Trigger post-call processing job on call completion
        if (['COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY'].includes(updatedAttempt.status)) {
          await scheduleJob(JOB_QUEUES.POST_CALL_PROCESSING, {
            callAttemptId: updatedAttempt.id
          });
        }
      }

      res.status(200).send('OK');
    } catch (err) {
      logger.error('Twilio Status Webhook processing failed', { error: err.message });
      res.status(500).send('Error');
    }
  }

  /**
   * Twilio Speech Result Webhook (Handles Speech-to-Text input from user)
   */
  async handleTwilioSpeech(req, res) {
    try {
      const { SpeechResult, CallSid } = req.body;
      const callAttemptId = req.query.callAttemptId;

      logger.info(`Speech Webhook received for SID [${CallSid}]: "${SpeechResult}"`);

      let attempt = null;
      if (callAttemptId) {
        attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
      } else if (CallSid) {
        attempt = await prisma.callAttempt.findUnique({ where: { twilioCallSid: CallSid } });
      }

      if (!attempt || !SpeechResult) {
        res.type('text/xml');
        return res.send('<Response><Say>Thank you. Goodbye!</Say><Hangup/></Response>');
      }

      // Process Human Speech Turn with LLM Reasoning
      const result = await qualificationService.processHumanMessage({
        callAttemptId: attempt.id,
        humanMessage: SpeechResult
      });

      broadcastEvent('transcript_update', {
        callAttemptId: attempt.id,
        humanText: SpeechResult,
        aiText: result.aiResponse,
        action: result.action
      });

      // Build TwiML for AI response turn
      const twimlResponse = new (require('twilio')).twiml.VoiceResponse();
      twimlResponse.say({ voice: 'Polly.Amy' }, result.aiResponse);

      if (['END_CALL_DNC', 'SCHEDULE_CALLBACK', 'END_CALL'].includes(result.action)) {
        twimlResponse.hangup();
      } else {
        twimlResponse.gather({
          input: ['speech'],
          action: `${req.protocol}://${req.get('host')}/api/webhooks/twilio/speech?callAttemptId=${attempt.id}`,
          speechTimeout: 'auto',
          timeout: 4
        });
      }

      res.type('text/xml');
      res.send(twimlResponse.toString());
    } catch (err) {
      logger.error('Twilio speech webhook error', { error: err.message });
      res.type('text/xml');
      res.send('<Response><Say>Thank you for your time. Goodbye.</Say><Hangup/></Response>');
    }
  }

  /**
   * ElevenLabs agent tool webhook for customer-requested callbacks
   */
  async handleElevenLabsCallback(req, res) {
    const payload = req.body || {};

    try {
      if (!this.isValidElevenLabsSignature(req)) {
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }

      if (payload.type === 'post_call_transcription') {
        return this.handleElevenLabsTranscript(req, res);
      }

      const callbackData = payload.data || payload.parameters || payload.arguments || payload;
      const dynamicVariables = callbackData.dynamic_variables || payload.dynamic_variables || {};
      const callbackDetails = callbackData.callback || payload.callback || {};
      const leadId = schedulingService.resolveLeadId(
        callbackData.leadId,
        callbackData.lead_id,
        callbackData.user_id,
        dynamicVariables.leadId,
        dynamicVariables.lead_id,
        payload.leadId,
        payload.lead_id,
        payload.user_id,
        payload.dynamic_variables?.leadId
      );
      const timeText = callbackData.timeText || callbackData.time_text ||
        callbackDetails.timeText || callbackDetails.time_text ||
        payload.timeText || payload.time_text;
      const timezone = callbackData.timezone || payload.timezone;

      if (!leadId || !timeText) {
        return res.status(400).json({ success: false, error: 'Valid leadId and timeText are required' });
      }

      const scheduledFor = schedulingService.resolveCallbackTime(timeText, timezone);
      const callback = await schedulingService.scheduleCallback({
        leadId,
        scheduledFor,
        timezone,
        reason: callbackData.reason || payload.reason || `Requested callback during ElevenLabs call: ${timeText}`
      });

      res.json({
        success: true,
        scheduledFor: callback.scheduledFor,
        message: `Callback scheduled for ${callback.scheduledFor.toISOString()}`
      });
    } catch (err) {
      logger.error('ElevenLabs callback tool failed', { error: err.message, leadId: schedulingService.normalizeLeadId(payload.leadId ?? payload.user_id ?? payload.dynamic_variables?.leadId ?? payload.lead_id ?? payload.data?.leadId ?? payload.parameters?.leadId) });
      const status = err.message.includes('Lead [') && err.message.includes('not found') || err.message.includes('Invalid leadId') ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }

  /**
   * Store the completed ElevenLabs conversation transcript per call attempt.
   */
  async handleElevenLabsTranscript(req, res) {
    const payload = req.body || {};
    try {
      const data = payload.data || payload;
      const conversationId = data.conversation_id || data.conversationId;
      const transcript = data.transcript || data.transcript_entries || [];
      const providerMetadata = data.metadata || {};
      const providerAnalysis = data.analysis || {};

      logger.info('ElevenLabs transcript webhook received', {
        type: payload.type,
        conversationId,
        transcriptEntries: Array.isArray(transcript) ? transcript.length : null,
        hasSignature: Boolean(req.get('elevenlabs-signature')),
        hasSharedSecret: Boolean(req.get('x-elevenlabs-webhook-secret'))
      });

      if (!this.isValidElevenLabsSignature(req)) {
        logger.warn('ElevenLabs transcript webhook rejected: invalid signature', { conversationId });
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }

      const dynamicVariables = data.dynamic_variables ||
        data.conversation_initiation_client_data?.dynamic_variables ||
        payload.dynamic_variables || {};
      const leadId = schedulingService.resolveLeadId(
        data.leadId,
        data.lead_id,
        data.user_id,
        dynamicVariables.leadId,
        dynamicVariables.lead_id,
        payload.leadId,
        payload.lead_id,
        payload.user_id,
        payload.dynamic_variables?.leadId
      );

      if (!conversationId || !Array.isArray(transcript)) {
        return res.status(400).json({ success: false, error: 'conversation_id and transcript are required' });
      }

      let attempt = await prisma.callAttempt.findFirst({
        where: { elevenLabsSessionId: conversationId }
      });

      if (!attempt && leadId) {
        attempt = await prisma.callAttempt.findFirst({
          where: { leadId },
          orderBy: { createdAt: 'desc' }
        });

        if (attempt && !attempt.elevenLabsSessionId) {
          attempt = await prisma.callAttempt.update({
            where: { id: attempt.id },
            data: { elevenLabsSessionId: conversationId }
          });
        }
      }

      if (!attempt) {
        logger.warn(`No call attempt found for ElevenLabs conversation [${conversationId}]`, { leadId });
        return res.status(202).json({ success: true, matched: false });
      }

      logger.info('ElevenLabs transcript matched call attempt', {
        conversationId,
        callAttemptId: attempt.id,
        leadId: attempt.leadId,
        transcriptEntries: transcript.length
      });

      let stored = 0;
      for (const entry of transcript) {
        const content = entry.message || entry.content || entry.text;
        if (!content) continue;

        const role = String(entry.role || entry.speaker || '').toLowerCase();
        const messageRole = role === 'user' || role === 'human' ? 'HUMAN' : 'AI';
        const duplicate = await prisma.conversationMessage.findFirst({
          where: { callAttemptId: attempt.id, role: messageRole, content }
        });

        if (!duplicate) {
          await prisma.conversationMessage.create({
            data: {
              callAttemptId: attempt.id,
              role: messageRole,
              content,
              metadata: { source: 'elevenlabs', conversationId }
            }
          });
          stored += 1;
        }
      }

      const providerSummary = providerAnalysis.transcript_summary || providerAnalysis.summary;
      const providerDuration = Number(providerMetadata.call_duration_secs);
      const elevenLabsMetadata = {
        source: 'elevenlabs',
        eventTimestamp: payload.event_timestamp || null,
        agentId: data.agent_id || null,
        agentName: data.agent_name || null,
        status: data.status || null,
        metadata: providerMetadata,
        analysis: providerAnalysis,
        conversationInitiationClientData: data.conversation_initiation_client_data || null
      };

      await prisma.callAttempt.update({
        where: { id: attempt.id },
        data: {
          elevenLabsMetadata,
          summary: providerSummary || attempt.summary,
          status: 'COMPLETED',
          endedAt: attempt.endedAt || new Date(),
          duration: Number.isFinite(providerDuration) ? Math.round(providerDuration) : attempt.duration
        }
      });

      if (!['DO_NOT_CALL', 'QUALIFIED', 'NOT_QUALIFIED'].includes(attempt.status)) {
        await prisma.lead.update({
          where: { id: attempt.leadId },
          data: { status: 'COMPLETED' }
        });
      }

      broadcastEvent('transcript_update', {
        callAttemptId: attempt.id,
        leadId: attempt.leadId,
        storedMessages: stored
      });

      logger.info('ElevenLabs transcript stored', {
        conversationId,
        callAttemptId: attempt.id,
        storedMessages: stored
      });

      return res.json({ success: true, matched: true, storedMessages: stored });
    } catch (err) {
      logger.error('ElevenLabs transcript webhook failed', { error: err.message });
      return res.status(500).json({ success: false, error: 'Transcript processing failed' });
    }
  }

  isValidElevenLabsSignature(req) {
    const secret = String(process.env.ELEVENLABS_WEBHOOK_SECRET || '').trim();
    if (!secret) return true;
    if (req.get('x-elevenlabs-webhook-secret') === secret) return true;

    const signature = req.get('elevenlabs-signature') || '';
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : '';
    if (!signature || !rawBody) return false;

    const parts = Object.fromEntries(
      signature.split(',').map((part) => {
        const separator = part.indexOf('=');
        return separator === -1
          ? [part.trim(), '']
          : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
      })
    );
    if (!parts.t || !parts.v0) return false;

    const timestamp = Number(parts.t);
    const maxAgeSeconds = 5 * 60;
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > maxAgeSeconds) return false;

    const signedPayload = `${parts.t}.${req.rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    if (expected.length !== parts.v0.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v0));
  }
}

module.exports = new WebhookController();
