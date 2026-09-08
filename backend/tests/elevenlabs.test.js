import { describe, it, expect } from 'vitest';

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