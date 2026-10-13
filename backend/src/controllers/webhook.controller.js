const twilioService = require('../integrations/twilio/twilio.service');
const callService = require('../services/call.service');
const qualificationService = require('../services/qualification.service');
const agentService = require('../services/agent.service');
const schedulingService = require('../services/scheduling.service');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const env = require('../config/env');
const { broadcastEvent } = require('../websocket/socket.server');
const queue = require('../config/queue');
const { JOB_QUEUES } = queue;
const { validatePlivoWebhookRequest } = require('../middleware/plivoAuth.middleware');
const crypto = require('crypto');

class WebhookController {
  constructor() {
    this.handleElevenLabsCallback = this.handleElevenLabsCallback.bind(this);
    this.handleElevenLabsTranscript = this.handleElevenLabsTranscript.bind(this);
    this.handlePlivoHangup = this.handlePlivoHangup.bind(this);
    this.handlePlivoTranscript = this.handlePlivoTranscript.bind(this);
    this.handlePlivoCallback = this.handlePlivoCallback.bind(this);
    this.handlePlivoQualification = this.handlePlivoQualification.bind(this);
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
          await queue.scheduleJob(JOB_QUEUES.POST_CALL_PROCESSING, {
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

  /**
   * Helper to validate Plivo webhook security against PLIVO_WEBHOOK_SECRET
   */
  isValidPlivoWebhook(req) {
    const result = validatePlivoWebhookRequest(req);
    return result.valid;
  }

  _tryParseJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      return value;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  _flattenNestedObjects(value, seen = new Set()) {
    const results = [];

    const visit = (node) => {
      if (!node) return;

      if (typeof node === 'string') {
        const parsed = this._tryParseJson(node);
        if (parsed && typeof parsed === 'object') {
          return visit(parsed);
        }
        return;
      }

      if (typeof node !== 'object') return;
      if (seen.has(node)) return;

      seen.add(node);
      results.push(node);

      if (Array.isArray(node)) {
        node.forEach(visit);
      } else {
        Object.values(node).forEach(visit);
      }
    };

    visit(value);
    return results;
  }

  /**
   * Helper to extract candidate payload sources (query, body, nested objects including payload.data.object and JSON-encoded event_data)
   */
  _extractPayloadSources(req) {
    const payload = req.body || {};
    const query = req.query || {};
    const parsedBody = this._tryParseJson(payload);
    const rootSources = this._flattenNestedObjects(parsedBody && typeof parsedBody === 'object' ? parsedBody : payload);
    const querySources = this._flattenNestedObjects(query);

    return [...querySources, ...rootSources].filter(src => src && typeof src === 'object');
  }

  /**
   * Helper to extract candidate UUIDs from all payload sources
   */
  _extractCandidateUuids(sources) {
    const uuidKeys = [
      'call_uuid', 'callUuid', 'CallUUID', 'calluuid',
      'aleg_uuid', 'alegUuid', 'ALegUUID', 'aleguuid',
      'ALegUUID'
    ];

    const candidates = [];
    const seen = new Set();

    for (const src of sources) {
      for (const key of uuidKeys) {
        const val = src[key];
        if (val && typeof val === 'string' && val.trim()) {
          const normalized = val.trim();
          if (!seen.has(normalized)) {
            seen.add(normalized);
            candidates.push(normalized);
          }
        }
      }

    }
    return candidates;
  }

  _extractProviderIdentifiers(sources) {
    return {
      triggerApiId: this._extractFromSources(sources, [
        'api_id', 'apiId', 'trigger_api_id', 'triggerApiId'
      ]),
      conversationId: this._extractFromSources(sources, [
        'conversation_id', 'conversationId', 'ConversationID'
      ]),
      flowId: this._extractFromSources(sources, [
        'flow_uuid', 'flowUuid', 'flow_id', 'flowId', 'phlo_id', 'phloId'
      ]),
      flowRunUuid: this._extractFromSources(sources, [
        'flow_run_uuid', 'flowRunUuid', 'flow_run_id', 'flowRunId'
      ])
    };
  }

  /**
   * Helper to extract callAttemptId from all payload sources
   */
  _extractCallAttemptId(sources) {
    const keys = ['call_attempt_id', 'callAttemptId', 'CallAttemptID', 'callattemptid', 'attempt_id', 'attemptId'];
    for (const src of sources) {
      for (const key of keys) {
        const val = src[key];
        if (val) {
          const normalized = schedulingService.normalizeLeadId(val);
          if (normalized) return normalized;
        }
      }
    }
    return null;
  }

  /**
   * Helper to extract leadId from all payload sources
   */
  _extractLeadId(sources) {
    const keys = ['lead_id', 'leadId', 'LeadID', 'leadid', 'user_id', 'userId'];
    for (const src of sources) {
      for (const key of keys) {
        const val = src[key];
        if (val) {
          const resolved = schedulingService.normalizeLeadId(val);
          if (resolved) return resolved;
        }
      }
    }
    return null;
  }

  /**
   * Helper to extract candidate phone numbers from payload sources
   */
  _extractPhoneNumbers(sources) {
    const keys = [
      'To', 'to', 'to_number', 'ToNumber', 'destination', 'recipient', 'Number', 'number',
      'From', 'from', 'from_number', 'FromNumber', 'caller', 'caller_number'
    ];
    const phones = new Set();
    for (const src of sources) {
      for (const key of keys) {
        const val = src[key];
        if (val && typeof val === 'string' && val.trim()) {
          const cleaned = val.trim();
          if (cleaned.length >= 7) {
            phones.add(cleaned);
          }
        }
      }
    }
    return Array.from(phones);
  }

  /**
   * Helper to extract a scalar field value from sources
   */
  _extractFromSources(sources, keys) {
    for (const src of sources) {
      for (const key of keys) {
        const val = src[key];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
    }
    return null;
  }

  _hasMislabeledCallUuid(attempt) {
    return Boolean(attempt.plivoCallUuid && attempt.plivoTriggerApiId &&
      attempt.plivoCallUuid === attempt.plivoTriggerApiId);
  }

  _identifiersConflict(attempt, { callUuid, triggerApiId, conversationId, flowId, flowRunUuid }) {
    const differs = (stored, incoming) =>
      Boolean(stored && incoming && String(stored).toLowerCase() !== String(incoming).toLowerCase());
    return (!this._hasMislabeledCallUuid(attempt) && differs(attempt.plivoCallUuid, callUuid)) ||
      differs(attempt.plivoTriggerApiId, triggerApiId) ||
      differs(attempt.plivoConversationId, conversationId) ||
      differs(attempt.plivoFlowId, flowId) ||
      differs(attempt.plivoFlowRunUuid, flowRunUuid);
  }

  async _findMatchingCallAttempt({
    callAttemptId,
    candidateUuids = [],
    leadId,
    candidatePhones = [],
    providerIdentifiers = {}
  }) {
    const incoming = {
      callUuid: candidateUuids[0] || null,
      triggerApiId: providerIdentifiers.triggerApiId || null,
      conversationId: providerIdentifiers.conversationId || null,
      flowId: providerIdentifiers.flowId || null,
      flowRunUuid: providerIdentifiers.flowRunUuid || null
    };
    const activeStatuses = ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'];
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    if (callAttemptId) {
      const attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
      if (attempt && !this._identifiersConflict(attempt, incoming)) {
        return { attempt, matchedBy: 'callAttemptId' };
      }
      if (attempt) return { attempt: null, matchedBy: 'conflict_attempt_identifiers' };
    }

    for (const uuid of candidateUuids) {
      const attempt = await prisma.callAttempt.findFirst({
          where: { plivoCallUuid: { equals: uuid, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' }
        });
      if (attempt) {
        if (this._identifiersConflict(attempt, incoming)) {
          return { attempt: null, matchedBy: 'conflict_plivoCallUuid' };
        }
        return { attempt, matchedBy: 'plivoCallUuid' };
      }
    }
    if (incoming.triggerApiId) {
      const attempt = await prisma.callAttempt.findFirst({
        where: { plivoTriggerApiId: incoming.triggerApiId }
      });
      if (attempt && !this._identifiersConflict(attempt, incoming)) {
        return { attempt, matchedBy: 'plivoTriggerApiId' };
      }
    }
    if (incoming.conversationId) {
      const attempt = await prisma.callAttempt.findFirst({
        where: { plivoConversationId: incoming.conversationId }
      });
      if (attempt) {
        if (this._identifiersConflict(attempt, incoming)) {
          return { attempt: null, matchedBy: 'conflict_plivoConversationId' };
        }
        return { attempt, matchedBy: 'plivoConversationId' };
      }
    }
    if (incoming.flowRunUuid) {
      const attempt = await prisma.callAttempt.findFirst({
        where: { plivoFlowRunUuid: incoming.flowRunUuid }
      });
      if (attempt) {
        if (this._identifiersConflict(attempt, incoming)) {
          return { attempt: null, matchedBy: 'conflict_plivoFlowRunUuid' };
        }
        return { attempt, matchedBy: 'plivoFlowRunUuid' };
      }
    }
    let ambiguousFlowMatch = false;
    if (incoming.flowId) {
      const flowAttempts = await prisma.callAttempt.findMany({
        where: {
          plivoFlowId: incoming.flowId,
          status: { in: activeStatuses },
          createdAt: { gte: cutoff }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (flowAttempts.length === 1 && !this._identifiersConflict(flowAttempts[0], incoming)) {
        return { attempt: flowAttempts[0], matchedBy: 'plivoFlowId_active' };
      }
      if (flowAttempts.length > 1) {
        // A flow ID identifies the shared Agent Studio flow, not one call.
        // Keep looking for a deterministic lead/phone match below.
        ambiguousFlowMatch = true;
      }
    }

    const findSingleActive = async (leadIds, matchedBy) => {
      const activeAttempts = await prisma.callAttempt.findMany({
        where: { leadId: Array.isArray(leadIds) ? { in: leadIds } : leadIds,
          status: { in: activeStatuses }, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' }
      });
      if (activeAttempts.length > 1) {
        logger.warn('Ambiguous active CallAttempt webhook match; refusing to guess', {
          activeAttemptIds: activeAttempts.map(a => a.id)
        });
        return { attempt: null, matchedBy: `ambiguous_${matchedBy}` };
      }
      if (activeAttempts.length === 1) {
        if (this._identifiersConflict(activeAttempts[0], incoming)) {
          return { attempt: null, matchedBy: `conflict_${matchedBy}` };
        }
        return { attempt: activeAttempts[0], matchedBy: `${matchedBy}_active` };
      }
      return null;
    };

    if (leadId) {
      const result = await findSingleActive(leadId, 'leadId');
      if (result) return result;
    }

    for (const phone of candidatePhones) {
      const digitsOnly = phone.replace(/\D/g, '');
      const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
      const leads = await prisma.lead.findMany({
        where: { OR: [{ phone }, { phone: { endsWith: last10 } }] }
      });
      if (leads.length > 1) return { attempt: null, matchedBy: 'ambiguous_phone_leads' };
      if (leads.length === 1) {
        const result = await findSingleActive(leads[0].id, 'phone');
        if (result) return result;
      }
    }

    return { attempt: null, matchedBy: ambiguousFlowMatch ? 'ambiguous_plivoFlowId' : 'none' };
  }

  async _linkProviderIdentifiers(attempt, { callUuid, triggerApiId, conversationId, flowId, flowRunUuid }) {
    const data = {};
    if (callUuid && (!attempt.plivoCallUuid || this._hasMislabeledCallUuid(attempt))) {
      data.plivoCallUuid = callUuid;
    }
    if (triggerApiId && !attempt.plivoTriggerApiId) data.plivoTriggerApiId = triggerApiId;
    if (conversationId && !attempt.plivoConversationId) data.plivoConversationId = conversationId;
    if (flowId && !attempt.plivoFlowId) data.plivoFlowId = flowId;
    if (flowRunUuid && !attempt.plivoFlowRunUuid) data.plivoFlowRunUuid = flowRunUuid;
    if (!Object.keys(data).length) return attempt;
    try {
      return await prisma.callAttempt.update({ where: { id: attempt.id }, data });
    } catch (err) {
      logger.warn('Could not link Plivo identifiers to call attempt', {
        callAttemptId: attempt.id,
        error: err.message
      });
      return attempt;
    }
  }

  async _beginWebhookEvent(kind, payload) {
    if (process.env.NODE_ENV === 'test') return { skip: false, eventId: null };
    const envelopeId = payload && typeof payload.id === 'string' ? payload.id : null;
    if (!envelopeId) return { skip: false, eventId: null };
    const eventId = `plivo:${kind}:${envelopeId}`;
    const eventType = payload.data?.object?.event_name || payload.data?.event_type ||
      payload.event_type || kind;
    try {
      await prisma.webhookEvent.create({
        data: { provider: 'plivo', eventId, eventType: String(eventType), payload }
      });
      return { skip: false, eventId };
    } catch (err) {
      if (err.code === 'P2002') {
        const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
        return { skip: Boolean(existing?.processed), eventId };
      }
      logger.warn('Could not persist Plivo webhook event', { error: err.message });
      return { skip: false, eventId: null };
    }
  }

  async _finishWebhookEvent(eventId) {
    if (!eventId) return;
    try {
      await prisma.webhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date() }
      });
    } catch (err) {
      logger.warn('Could not mark Plivo webhook event processed', { error: err.message });
    }
  }

  /**
   * Helper to normalize raw transcript input into an array of speaker/content entries
   */
  _normalizeTranscriptEntries(rawTranscript) {
    if (!rawTranscript) return [];

    let parsed = rawTranscript;
    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return trimmed.split('\n').filter(Boolean).map(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const speaker = line.substring(0, colonIdx).trim();
              const message = line.substring(colonIdx + 1).trim();
              return { speaker, message };
            }
            return { speaker: 'user', message: line.trim() };
          });
        }
      } else {
        return trimmed.split('\n').filter(Boolean).map(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const speaker = line.substring(0, colonIdx).trim();
            const message = line.substring(colonIdx + 1).trim();
            return { speaker, message };
          }
          return { speaker: 'user', message: line.trim() };
        });
      }
    }

    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
      const candidateArray = parsed.entries || parsed.sentences || parsed.utterances ||
        parsed.messages || parsed.transcript || parsed.transcripts || parsed.items ||
        parsed.history || parsed.turns || parsed.conversation_history ||
        parsed.conversationHistory || parsed.transcript_entries || parsed.transcriptEntries;
      if (Array.isArray(candidateArray)) {
        parsed = candidateArray;
      } else if (typeof parsed.content === 'string' || typeof parsed.text === 'string') {
        return [{
          speaker: parsed.role || parsed.speaker || parsed.sender || 'user',
          message: parsed.content || parsed.text
        }];
      } else {
        return [];
      }
    }

    if (Array.isArray(parsed)) {
      return parsed.map(entry => {
        if (typeof entry === 'string') {
          return { speaker: 'user', message: entry };
        }
        return entry;
      }).filter(Boolean);
    }

    return [];
  }

  /**
   * Handle Plivo Hangup URL event callback
   */
  async handlePlivoHangup(req, res) {
    if (!this.isValidPlivoWebhook(req)) {
      logger.warn('Plivo hangup webhook rejected: Unauthorized', { endpoint: '/api/webhooks/plivo/hangup', status: 401 });
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
    }

    const payload = req.body || {};
    let webhookEvent = { skip: false, eventId: null };
    try {
      webhookEvent = await this._beginWebhookEvent('hangup', payload);
      if (webhookEvent.skip) return res.status(200).send('OK');
      const sources = this._extractPayloadSources(req);
      const candidateUuids = this._extractCandidateUuids(sources);
      const callUuid = candidateUuids[0] || null;
      const callAttemptId = this._extractCallAttemptId(sources);
      const leadId = this._extractLeadId(sources);
      const candidatePhones = this._extractPhoneNumbers(sources);
      const providerIdentifiers = this._extractProviderIdentifiers(sources);

      const rawDuration = this._extractFromSources(sources, [
        'duration', 'Duration', 'bill_duration', 'BillDuration',
        'call_duration', 'CallDuration', 'billed_duration', 'BilledDuration', 'length', 'Length'
      ]);
      const duration = rawDuration !== null && rawDuration !== undefined && rawDuration !== '' ? parseInt(rawDuration, 10) : null;

      const hangupCause = this._extractFromSources(sources, [
        'hangup_cause', 'hangupCause', 'HangupCause', 'cause', 'disposition', 'hangup_reason', 'reason'
      ]);

      const optOutVal = this._extractFromSources(sources, ['opt_out', 'do_not_call']);
      const dispositionVal = this._extractFromSources(sources, ['disposition']);
      const optOut = Boolean(optOutVal || dispositionVal === 'DO_NOT_CALL');

      const wrongNumberVal = this._extractFromSources(sources, ['wrong_number']);
      const wrongNumber = Boolean(wrongNumberVal || dispositionVal === 'WRONG_NUMBER');

      const { attempt, matchedBy } = await this._findMatchingCallAttempt({ callAttemptId, candidateUuids, leadId, candidatePhones, providerIdentifiers });

      const dataObj = payload.data?.object || null;
      const eventType = payload.data?.event_type || payload.event_type || payload.event ||
        this._extractFromSources(sources, ['event_name', 'eventName']);

      // Sanitized diagnostic logging of payload keys and extracted identifiers
      logger.info('Plivo Hangup Webhook Payload Keys Diagnostic', {
        endpoint: '/api/webhooks/plivo/hangup',
        eventId: payload.id || null,
        eventType,
        payloadTopKeys: Object.keys(payload),
        dataKeys: payload.data ? Object.keys(payload.data) : [],
        objectKeys: dataObj ? Object.keys(dataObj) : [],
        queryKeys: Object.keys(req.query),
        extractedCallUuid: callUuid,
        candidateUuids,
        extractedCallAttemptId: callAttemptId,
        extractedLeadId: leadId,
        candidatePhonesCount: candidatePhones.length,
        matchedBy,
        matchedAttemptId: attempt ? attempt.id : null,
        hangupCause,
        duration,
        optOut,
        wrongNumber
      });

      if (!attempt) {
        logger.warn('No matching call attempt found for Plivo Hangup Event', {
          endpoint: '/api/webhooks/plivo/hangup',
          status: 200,
          candidateUuids,
          callAttemptId,
          leadId,
          candidatePhones
        });
        await this._finishWebhookEvent(webhookEvent.eventId);
        return res.status(200).send('OK');
      }

      await this._linkProviderIdentifiers(attempt, { callUuid, ...providerIdentifiers });

      // Idempotency check: if attempt is already in terminal state, avoid duplicate state corruption
      const terminalStates = ['COMPLETED', 'FAILED', 'CANCELED', 'NO_ANSWER', 'BUSY'];
      if (terminalStates.includes(attempt.status)) {
        logger.info(`Idempotent Plivo Hangup Guard: Call [${attempt.id}] is already in terminal state [${attempt.status}]. Skipping overwrite.`);
        await this._finishWebhookEvent(webhookEvent.eventId);
        return res.status(200).send('OK');
      }

      // Handle Opt-Out / DO_NOT_CALL immediately
      if (optOut) {
        await prisma.lead.update({
          where: { id: attempt.leadId },
          data: { status: 'DO_NOT_CALL' }
        });
        await schedulingService.cancelPendingCallbacksForLead(attempt.leadId);
        logger.info(`Lead [${attempt.leadId}] marked DO_NOT_CALL via Plivo Hangup payload.`);
      } else if (wrongNumber) {
        await prisma.lead.update({
          where: { id: attempt.leadId },
          data: { status: 'NOT_QUALIFIED' }
        });
        await prisma.qualificationResult.upsert({
          where: { leadId: attempt.leadId },
          update: { callAttemptId: attempt.id, result: 'NOT_QUALIFIED', summary: 'Wrong number outcome' },
          create: { leadId: attempt.leadId, callAttemptId: attempt.id, result: 'NOT_QUALIFIED', summary: 'Wrong number outcome' }
        });
      }

      let nextStatus = 'COMPLETED';
      if (hangupCause) {
        const causeUpper = String(hangupCause).toUpperCase();
        if (['NO_ANSWER', 'ORIGINATOR_CANCEL'].includes(causeUpper)) {
          nextStatus = 'NO_ANSWER';
        } else if (['USER_BUSY', 'BUSY'].includes(causeUpper)) {
          nextStatus = 'BUSY';
        } else if (['CALL_REJECTED', 'FAILED'].includes(causeUpper)) {
          nextStatus = 'FAILED';
        }
      }

      // Calculate fallback duration if payload duration is null
      let finalDuration = (duration !== null && !isNaN(duration) && duration > 0) ? duration : attempt.duration;
      if ((finalDuration === null || finalDuration === 0) && attempt.startedAt) {
        finalDuration = Math.max(1, Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000));
      }

      const updatedAttempt = await prisma.callAttempt.update({
        where: { id: attempt.id },
        data: {
          status: nextStatus,
          endedAt: new Date(),
          duration: finalDuration,
          failureReason: hangupCause && hangupCause !== 'NORMAL_CLEARING' ? `Hangup Cause: ${hangupCause}` : attempt.failureReason
        }
      });

      if (updatedAttempt.leadId && !optOut && !wrongNumber) {
        const leadNextStatus = nextStatus === 'COMPLETED' ? 'COMPLETED' : (nextStatus === 'NO_ANSWER' || nextStatus === 'BUSY' ? 'NO_ANSWER' : 'FAILED');
        await prisma.lead.updateMany({
          where: { id: updatedAttempt.leadId, status: { in: ['CALLING', 'CONNECTED', 'QUALIFYING'] } },
          data: { status: leadNextStatus }
        });
      }

      broadcastEvent('call_status_change', {
        callAttemptId: updatedAttempt.id,
        status: updatedAttempt.status,
        leadId: updatedAttempt.leadId
      });

      // Trigger post call processing job
      await queue.scheduleJob(JOB_QUEUES.POST_CALL_PROCESSING, {
        callAttemptId: updatedAttempt.id
      }, { startAfter: 60 });

      logger.info('Plivo Hangup Webhook processed successfully', { endpoint: '/api/webhooks/plivo/hangup', status: 200, callAttemptId: updatedAttempt.id, nextStatus: updatedAttempt.status, duration: finalDuration });
      await this._finishWebhookEvent(webhookEvent.eventId);
      return res.status(200).send('OK');
    } catch (err) {
      logger.error('Plivo Hangup Webhook processing failed', { endpoint: '/api/webhooks/plivo/hangup', status: 500, error: err.message });
      return res.status(500).send('Error');
    }
  }

  /**
   * Handle Plivo Recording & Transcript event callback
   */
  async handlePlivoTranscript(req, res) {
    if (!this.isValidPlivoWebhook(req)) {
      logger.warn('Plivo transcript webhook rejected: Unauthorized', { endpoint: '/api/webhooks/plivo/transcript', status: 401 });
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
    }

    const payload = req.body || {};
    let webhookEvent = { skip: false, eventId: null };
    try {
      webhookEvent = await this._beginWebhookEvent('transcript', payload);
      if (webhookEvent.skip) return res.json({ success: true, duplicate: true });
      const sources = this._extractPayloadSources(req);
      const candidateUuids = this._extractCandidateUuids(sources);
      const callUuid = candidateUuids[0] || null;
      const callAttemptId = this._extractCallAttemptId(sources);
      const leadId = this._extractLeadId(sources);
      const candidatePhones = this._extractPhoneNumbers(sources);
      const providerIdentifiers = this._extractProviderIdentifiers(sources);

      const rawTranscript = this._extractFromSources(sources, [
        'transcript', 'transcripts', 'messages', 'conversation',
        'chat_history', 'dialog', 'transcript_text', 'transcription', 'transcriptions'
      ]);
      const normalizedEntries = this._normalizeTranscriptEntries(rawTranscript);

      const summary = this._extractFromSources(sources, ['summary', 'conversation_summary', 'ai_summary']);
      const recordingUrl = this._extractFromSources(sources, ['recording_url', 'recordingUrl', 'recording']);

      const { attempt, matchedBy } = await this._findMatchingCallAttempt({ callAttemptId, candidateUuids, leadId, candidatePhones, providerIdentifiers });

      const dataObj = payload.data?.object || null;
      const eventType = payload.data?.event_type || payload.event_type || payload.event ||
        this._extractFromSources(sources, ['event_name', 'eventName']);

      // Sanitized diagnostic logging of payload keys and extracted identifiers
      logger.info('Plivo Transcript Webhook Payload Keys Diagnostic', {
        endpoint: '/api/webhooks/plivo/transcript',
        eventId: payload.id || null,
        eventType,
        payloadTopKeys: Object.keys(payload),
        dataKeys: payload.data ? Object.keys(payload.data) : [],
        objectKeys: dataObj ? Object.keys(dataObj) : [],
        queryKeys: Object.keys(req.query),
        extractedCallUuid: callUuid,
        candidateUuids,
        extractedCallAttemptId: callAttemptId,
        extractedLeadId: leadId,
        candidatePhonesCount: candidatePhones.length,
        matchedBy,
        matchedAttemptId: attempt ? attempt.id : null,
        transcriptEntries: normalizedEntries.length,
        hasSummary: Boolean(summary),
        hasRecording: Boolean(recordingUrl)
      });

      if (!attempt) {
        logger.warn('No matching call attempt found for Plivo Transcript Event', {
          endpoint: '/api/webhooks/plivo/transcript',
          status: 200,
          candidateUuids,
          callAttemptId,
          leadId
        });
        await this._finishWebhookEvent(webhookEvent.eventId);
        return res.status(200).send('OK');
      }

      await this._linkProviderIdentifiers(attempt, { callUuid, ...providerIdentifiers });

      let storedCount = 0;
      for (const entry of normalizedEntries) {
        const content = entry.content || entry.message || entry.text || entry.statement || entry.sentence || entry.transcript || (typeof entry === 'string' ? entry : null);
        if (!content || typeof content !== 'string' || !content.trim()) continue;

        const role = String(entry.role || entry.speaker || entry.sender || entry.source || entry.author || entry.type || '').toLowerCase();
        const messageRole = ['agent', 'ai', 'assistant', 'bot', 'system'].includes(role) ? 'AI' : 'HUMAN';

        const duplicate = await prisma.conversationMessage.findFirst({
          where: { callAttemptId: attempt.id, role: messageRole, content: content.trim() }
        });

        if (!duplicate) {
          await prisma.conversationMessage.create({
            data: {
              callAttemptId: attempt.id,
              role: messageRole,
              content: content.trim(),
              metadata: { source: 'plivo', callUuid }
            }
          });
          storedCount++;
        }
      }

      // Update attempt summary & recording URL
      await prisma.callAttempt.update({
        where: { id: attempt.id },
        data: {
          summary: summary || attempt.summary,
          plivoRecordingUrl: recordingUrl || attempt.plivoRecordingUrl
        }
      });

      broadcastEvent('transcript_update', {
        callAttemptId: attempt.id,
        leadId: attempt.leadId,
        storedMessages: storedCount,
        summary: summary || attempt.summary,
        recordingUrl: recordingUrl || attempt.plivoRecordingUrl
      });

      logger.info('Plivo Transcript Webhook processed successfully', { endpoint: '/api/webhooks/plivo/transcript', status: 200, callAttemptId: attempt.id, storedMessages: storedCount });
      await this._finishWebhookEvent(webhookEvent.eventId);
      return res.json({ success: true, matched: true, storedMessages: storedCount });
    } catch (err) {
      logger.error('Plivo Transcript Webhook processing failed', { endpoint: '/api/webhooks/plivo/transcript', status: 500, error: err.message });
      return res.status(500).json({ success: false, error: 'Transcript processing failed' });
    }
  }

  /**
   * Handle Plivo Callback scheduling event / custom tool call
   */
  async handlePlivoCallback(req, res) {
    if (!this.isValidPlivoWebhook(req)) {
      logger.warn('Plivo callback custom tool rejected: Unauthorized', { endpoint: '/api/webhooks/plivo/callback', status: 401 });
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
    }

    const payload = req.body || {};
    try {
      const parsedPayload = this._tryParseJson(payload);
      const sources = [
        ...this._flattenNestedObjects(parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : payload),
        ...this._flattenNestedObjects(req.query || {})
      ];
      const value = (keys) => this._extractFromSources(sources, keys);
      let leadId = schedulingService.resolveLeadId(
        value(['lead_id', 'leadId', 'user_id', 'userId', 'customer_id', 'customerId'])
      );
      const callAttemptId = schedulingService.normalizeLeadId(
        value(['call_attempt_id', 'callAttemptId', 'attempt_id', 'attemptId'])
      );
      const callUuid = schedulingService.normalizeLeadId(
        value(['call_uuid', 'callUuid', 'CallUUID'])
      );
      const conversationId = schedulingService.normalizeLeadId(
        value(['conversation_id', 'conversationId', 'ConversationID'])
      );
      const flowRunUuid = schedulingService.normalizeLeadId(
        value(['flow_run_uuid', 'flowRunUuid', 'flow_run_id', 'flowRunId'])
      );

      // Fallback: If leadId is missing or was a literal placeholder, resolve via callAttemptId or callUuid context
      if (!leadId && (callAttemptId || callUuid)) {
        let attempt = null;
        if (callAttemptId) {
          attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
        }
        if (!attempt && callUuid) {
          attempt = await prisma.callAttempt.findFirst({ where: { plivoCallUuid: callUuid } });
        }
        if (!attempt && conversationId) {
          attempt = await prisma.callAttempt.findFirst({ where: { plivoConversationId: conversationId } });
        }
        if (!attempt && flowRunUuid) {
          attempt = await prisma.callAttempt.findFirst({ where: { plivoFlowRunUuid: flowRunUuid } });
        }
        if (attempt) {
          leadId = attempt.leadId;
        }
      }

      let timeText = value([
        'time_text', 'timeText', 'callback_time', 'callbackTime',
        'preferred_time', 'preferredTime', 'callback_day', 'callbackDay', 'time'
      ]);
      if (schedulingService.normalizeLeadId(timeText) === null) {
        timeText = value(['callback_time', 'callbackTime', 'preferred_time', 'preferredTime', 'callback_day', 'callbackDay']);
      }
      if (schedulingService.normalizeLeadId(timeText) === null) timeText = null;
      const timezone = value(['timezone', 'time_zone', 'timeZone']) || 'Asia/Kolkata';

      if (!leadId || !timeText) {
        logger.warn('Plivo callback request rejected: Unresolved lead_id or missing time_text', {
          endpoint: '/api/webhooks/plivo/callback',
          status: 400,
          leadId,
          callAttemptId,
          hasTimeText: Boolean(timeText)
        });
        return res.status(400).json({ success: false, error: 'Valid lead_id and callback time (time_text / callback_time) are required.' });
      }

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) {
        logger.warn(`Plivo callback request rejected: Lead [${leadId}] not found`, { endpoint: '/api/webhooks/plivo/callback', status: 400, leadId });
        return res.status(400).json({ success: false, error: `Lead [${leadId}] not found.` });
      }

      if (lead.status === 'DO_NOT_CALL') {
        logger.warn(`Rule 1 Enforced: Rejected callback scheduling for DO_NOT_CALL Lead [${leadId}]`, { endpoint: '/api/webhooks/plivo/callback', status: 400, leadId });
        return res.status(400).json({ success: false, error: 'Lead is marked DO_NOT_CALL. Callback cannot be scheduled.' });
      }

      const scheduledFor = schedulingService.resolveCallbackTime(timeText, timezone);
      const callback = await schedulingService.scheduleCallback({
        leadId: lead.id,
        callAttemptId,
        scheduledFor,
        timezone,
        reason: value(['reason', 'callback_reason', 'callbackReason']) ||
          `Requested callback during Plivo call: ${timeText}`
      });

      logger.info(`Plivo callback scheduled successfully for Lead [${lead.id}]`, {
        endpoint: '/api/webhooks/plivo/callback',
        status: 200,
        leadId: lead.id,
        callAttemptId,
        callbackId: callback.id,
        scheduledFor: callback.scheduledFor
      });

      return res.json({
        success: true,
        callback_id: callback.id,
        lead_id: lead.id,
        scheduledFor: callback.scheduledFor,
        message: `Callback scheduled for ${callback.scheduledFor.toISOString()}`
      });
    } catch (err) {
      logger.error('Plivo callback scheduling failed', { endpoint: '/api/webhooks/plivo/callback', status: 500, error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Handle Plivo Custom Tool for persisting qualification answers
   */
  async handlePlivoQualification(req, res) {
    if (!this.isValidPlivoWebhook(req)) {
      logger.warn('Plivo qualification custom tool rejected: Unauthorized', { endpoint: '/api/webhooks/plivo/qualification', status: 401 });
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
    }

    const payload = req.body || {};
    try {
      const data = payload.data || payload.parameters || payload.arguments || payload.body || payload;
      let leadId = schedulingService.resolveLeadId(
        data.lead_id,
        data.leadId,
        payload.lead_id,
        payload.leadId,
        req.query.lead_id,
        req.query.leadId
      );
      const callAttemptId = data.call_attempt_id || data.callAttemptId || payload.call_attempt_id || payload.callAttemptId || req.query.call_attempt_id || req.query.callAttemptId || null;
      const callUuid = data.call_uuid || data.callUuid || payload.call_uuid || payload.callUuid || req.query.callUuid || req.query.call_uuid;

      // Fallback: If leadId is missing or was a literal placeholder, resolve via callAttemptId or callUuid context
      if (!leadId && (callAttemptId || callUuid)) {
        let attempt = null;
        if (callAttemptId) {
          attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
        }
        if (!attempt && callUuid) {
          attempt = await prisma.callAttempt.findFirst({ where: { plivoCallUuid: callUuid } });
        }
        if (attempt) {
          leadId = attempt.leadId;
        }
      }

      if (!leadId) {
        logger.warn('Plivo qualification request rejected: Unresolved lead_id', { endpoint: '/api/webhooks/plivo/qualification', status: 400 });
        return res.status(400).json({ success: false, error: 'Unresolved lead_id context is required' });
      }

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) {
        logger.warn(`Plivo qualification request rejected: Lead [${leadId}] not found`, { endpoint: '/api/webhooks/plivo/qualification', status: 400, leadId });
        return res.status(400).json({ success: false, error: `Lead [${leadId}] not found` });
      }

      if (lead.status === 'DO_NOT_CALL') {
        return res.status(400).json({ success: false, error: 'Lead is marked DO_NOT_CALL' });
      }

      const {
        business_status,
        current_platform,
        products_services,
        target_market,
        launch_timeline,
        compensation_plan,
        additional_notes,
        callback_day,
        callback_time,
        time_text,
        timeText,
        disposition,
        opt_out
      } = data;

      // Check opt out in qualification payload
      if (opt_out || disposition === 'DO_NOT_CALL') {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'DO_NOT_CALL' }
        });
        await schedulingService.cancelPendingCallbacksForLead(lead.id);
        logger.info(`Lead [${lead.id}] marked DO_NOT_CALL via Plivo qualification tool`);
        return res.json({ success: true, message: 'Lead marked DO_NOT_CALL successfully' });
      }

      // Filter non-null/non-undefined qualification fields
      const newMetadataFields = {};
      if (business_status !== undefined) newMetadataFields.business_status = business_status;
      if (current_platform !== undefined) newMetadataFields.current_platform = current_platform;
      if (products_services !== undefined) newMetadataFields.products_services = products_services;
      if (target_market !== undefined) newMetadataFields.target_market = target_market;
      if (launch_timeline !== undefined) newMetadataFields.launch_timeline = launch_timeline;
      if (compensation_plan !== undefined) newMetadataFields.compensation_plan = compensation_plan;
      if (additional_notes !== undefined) newMetadataFields.additional_notes = additional_notes;
      if (callback_day !== undefined) newMetadataFields.callback_day = callback_day;
      if (callback_time !== undefined) newMetadataFields.callback_time = callback_time;

      const existingMetadata = lead.metadata || {};
      const updatedMetadata = { ...existingMetadata, ...newMetadataFields };

      await prisma.lead.update({
        where: { id: lead.id },
        data: { metadata: updatedMetadata }
      });

      // Upsert QualificationResult if callAttemptId provided
      if (callAttemptId) {
        const attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
        if (attempt) {
          await prisma.qualificationResult.upsert({
            where: { leadId: lead.id },
            update: {
              callAttemptId: attempt.id,
              need: products_services || undefined,
              timeline: launch_timeline || undefined,
              summary: additional_notes || undefined,
              rawOutput: updatedMetadata
            },
            create: {
              leadId: lead.id,
              callAttemptId: attempt.id,
              need: products_services || null,
              timeline: launch_timeline || null,
              summary: additional_notes || null,
              rawOutput: updatedMetadata
            }
          });
        }
      }

      // Schedule callback if callback_time, callback_day, or time_text passed
      const combinedTimeText = callback_time || callback_day || time_text || timeText;
      if (combinedTimeText && lead.status !== 'DO_NOT_CALL') {
        const scheduledFor = schedulingService.resolveCallbackTime(combinedTimeText);
        await schedulingService.scheduleCallback({
          leadId: lead.id,
          callAttemptId: callAttemptId || null,
          scheduledFor,
          reason: `Requested callback during AI qualification turn: ${combinedTimeText}`
        });
      }

      logger.info('Plivo qualification persisted successfully', { endpoint: '/api/webhooks/plivo/qualification', status: 200, leadId: lead.id, callAttemptId });
      return res.json({
        success: true,
        message: 'Qualification data persisted successfully',
        data: { leadId: lead.id, callAttemptId }
      });
    } catch (err) {
      logger.error('Plivo qualification persistence failed', { endpoint: '/api/webhooks/plivo/qualification', status: 500, error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new WebhookController();
