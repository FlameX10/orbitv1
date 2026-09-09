import { describe, it, expect } from 'vitest';
const crypto = require('crypto');

const elevenLabsService = require('../src/integrations/elevenlabs/elevenlabs.service');
const webhookController = require('../src/controllers/webhook.controller');

describe('ElevenLabs outbound call initialization', () => {
  it('builds the outbound request with the exact leadId dynamic variable', () => {
    const payload = elevenLabsService.buildOutboundCallPayload({
      to: '+14247992350',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007'
    });

    expect(payload).toEqual(expect.objectContaining({
      user_id: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      conversation_initiation_client_data: {
        dynamic_variables: {
          leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007'
        }
      }
    }));
  });

  it('does not initialize a call without a backend leadId', () => {
    expect(() => elevenLabsService.buildOutboundCallPayload({
      to: '+14247992350',
      leadId: 'None'
    })).toThrow('backend leadId is required');

    expect(() => elevenLabsService.buildOutboundCallPayload({
      to: '+14247992350'
    })).toThrow('backend leadId is required');
  });
});

describe('ElevenLabs callback payloads', () => {
  it('accepts a valid native ElevenLabs HMAC signature', () => {
    const rawBody = JSON.stringify({ type: 'post_call_transcription' });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const req = {
      rawBody,
      get: (header) => header === 'elevenlabs-signature'
        ? `t=${timestamp},v0=${signature}`
        : undefined
    };

    expect(webhookController.isValidElevenLabsSignature(req)).toBe(true);
  });

  it('keeps the callback handler bound when registered with Express', async () => {
    const handler = webhookController.handleElevenLabsCallback;
    const req = {
      body: {
        leadId: 'lead_123',
        timeText: 'in 15 minutes',
        timezone: 'Asia/Kolkata'
      },
      get: (header) => header === 'x-elevenlabs-webhook-secret'
        ? process.env.ELEVENLABS_WEBHOOK_SECRET
        : undefined
    };
    let responseBody;
    const response = {
      json: (body) => { responseBody = body; },
      status: () => response
    };

    const schedulingService = require('../src/services/scheduling.service');
    const originalScheduleCallback = schedulingService.scheduleCallback;
    schedulingService.scheduleCallback = async ({ leadId, scheduledFor, timezone }) => ({
      scheduledFor,
      timezone,
      leadId
    });

    try {
      await handler(req, response);
      expect(responseBody.success).toBe(true);
    } finally {
      schedulingService.scheduleCallback = originalScheduleCallback;
    }
  });

  it('accepts callback arguments wrapped in data', async () => {
    const schedulingService = require('../src/services/scheduling.service');
    const originalScheduleCallback = schedulingService.scheduleCallback;
    schedulingService.scheduleCallback = async ({ leadId, scheduledFor, timezone }) => ({
      scheduledFor,
      timezone,
      leadId
    });

    const req = {
      body: {
        data: {
          lead_id: 'lead_123',
          time_text: 'in 15 minutes',
          timezone: 'Asia/Kolkata'
        }
      },
      get: (header) => header === 'x-elevenlabs-webhook-secret'
        ? process.env.ELEVENLABS_WEBHOOK_SECRET
        : undefined
    };
    let responseBody;
    const response = {
      json: (body) => { responseBody = body; },
      status: () => response
    };

    try {
      await webhookController.handleElevenLabsCallback(req, response);
      expect(responseBody.success).toBe(true);
      expect(responseBody.scheduledFor).toBeInstanceOf(Date);
    } finally {
      schedulingService.scheduleCallback = originalScheduleCallback;
    }
  });
});