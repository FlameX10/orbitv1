const twilio = require('twilio');
const env = require('../../config/env');
const logger = require('../../config/logger');
const elevenLabsService = require('../elevenlabs/elevenlabs.service');

class TwilioService {
  constructor() {
    this.accountSid = env.twilio.accountSid;
    this.authToken = env.twilio.authToken;
    this.phoneNumber = env.twilio.phoneNumber;
    this.webhookBaseUrl = env.twilio.webhookBaseUrl;

    const isRealTwilio =
      this.accountSid &&
      !this.accountSid.startsWith('AC_MOCK') &&
      !this.accountSid.includes('XXXX') &&
      this.authToken &&
      !this.authToken.startsWith('MOCK') &&
      !this.authToken.includes('your_') &&
      !this.authToken.includes('placeholder');

    if (isRealTwilio) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      this.client = null;
      logger.info('Twilio Service running in mock/demo mode (placeholder or mock credentials detected)');
    }
  }

  /**
   * Initiates an outbound voice call via Twilio
   */
  async createOutboundCall({ to, leadId, callAttemptId, customWebhookUrl }) {
    const webhookUrl = customWebhookUrl || `${this.webhookBaseUrl}/api/webhooks/twilio/voice?callAttemptId=${callAttemptId}&leadId=${leadId}`;
    const statusCallbackUrl = `${this.webhookBaseUrl}/api/webhooks/twilio/status?callAttemptId=${callAttemptId}&leadId=${leadId}`;

    logger.info(`Initiating Twilio Outbound Call to [${to}] for Lead ID [${leadId}]`, { callAttemptId, webhookUrl });

    try {
      const call = await elevenLabsService.createOutboundCall({ to, leadId });

      return {
        sid: call.callSid,
        status: 'queued',
        to,
        from: this.phoneNumber,
        conversationId: call.conversation_id
      };
    } catch (err) {
      logger.error('Twilio outbound call initiation failed', { error: err.message, to, leadId });

      throw err;
    }
  }

  /**
   * Generates initial TwiML XML response for Twilio when call connects
   */
  generateTwiML({ openingMessage, elevenLabsWsUrl }) {
    const twiml = new twilio.twiml.VoiceResponse();

    if (elevenLabsWsUrl) {
      // Stream audio directly to ElevenLabs WebSocket / Media stream handler
      const connect = twiml.connect();
      connect.stream({ url: elevenLabsWsUrl });
    } else {
      // Fallback TwiML text-to-speech for testing
      twiml.say({ voice: 'Polly.Amy' }, openingMessage || 'Hello! Thank you for contacting Vedron Dev Co. How can I help you today?');
      twiml.gather({
        input: ['speech'],
        action: `${this.webhookBaseUrl}/api/webhooks/twilio/speech`,
        speechTimeout: 'auto',
        timeout: 4
      });
    }

    return twiml.toString();
  }

  /**
   * Hang up an active call
   */
  async hangupCall(callSid) {
    if (!this.client || callSid.startsWith('CA_MOCK')) {
      logger.info(`Mock hangup triggered for SID: [${callSid}]`);
      return true;
    }

    try {
      await this.client.calls(callSid).update({ status: 'completed' });
      return true;
    } catch (err) {
      logger.error('Failed to hangup Twilio call', { callSid, error: err.message });
      return false;
    }
  }

  async getCallStatus(callSid) {
    if (!this.client || callSid.startsWith('CA_MOCK')) return null;

    const call = await this.client.calls(callSid).fetch();
    return {
      sid: call.sid,
      status: call.status,
      duration: call.duration
    };
  }

  /**
   * Validate Twilio Webhook Signature
   */
  validateWebhookSignature(req) {
    if (!this.client || env.nodeEnv === 'development' || !req.headers['x-twilio-signature']) {
      return true; // bypass in dev/mock mode
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body;

    return twilio.validateRequest(this.authToken, twilioSignature, url, params);
  }
}

module.exports = new TwilioService();
