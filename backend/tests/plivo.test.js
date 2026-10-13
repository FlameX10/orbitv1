import { describe, it, expect, vi } from 'vitest';
import plivoService from '../src/integrations/plivo/plivo.service';
import webhookController from '../src/controllers/webhook.controller';
import schedulingService from '../src/services/scheduling.service';
import {
  authenticatePlivoWebhook,
  validatePlivoWebhookRequest,
  extractPlivoWebhookSecret,
  safeCompareSecrets
} from '../src/middleware/plivoAuth.middleware';

describe('Plivo Service Regional Routing & API Triggering', () => {
  it('1. Preservation of existing US and India routing behavior (+91 -> IN, +1 -> US)', () => {
    expect(plivoService.getRegionForPhone('+919876543210')).toBe('in');
    expect(plivoService.getRegionForPhone('+14155552671')).toBe('us');
    expect(plivoService.getRegionForPhone('')).toBe('us');
  });

  it('2. Regional configuration isolation', () => {
    const configIn = plivoService.getRegionalConfig('in');
    expect(configIn.region).toBe('IN');
    expect(configIn.callerNumber).toBe('+918065522583');

    const configUs = plivoService.getRegionalConfig('us');
    expect(configUs.region).toBe('US');
  });

  it('3. Trigger variable mapping preserves queued trigger IDs without mislabeling api_id as call UUID', async () => {
    const axios = require('axios');
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 200,
      data: {
        api_id: 'trigger-api-123',
        message: 'Phlo run queued',
        phlo_id: 'shared-flow-123'
      }
    });

    try {
      const res = await plivoService.triggerOutboundAgentCall({
        to: '+919876543210',
        leadId: 'test-lead-123',
        callAttemptId: 'test-attempt-456',
        leadData: { firstName: 'Test', lastName: 'User', company: 'Acme Corp' }
      });

      expect(res).toMatchObject({
        success: true,
        isMock: false,
        callUuid: undefined,
        triggerApiId: 'trigger-api-123',
        flowId: 'shared-flow-123'
      });
      expect(res.callUuid).not.toBe('trigger-api-123');
      expect(post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          leadId: 'test-lead-123',
          call_attempt_id: 'test-attempt-456'
        }),
        expect.objectContaining({ timeout: 10000 })
      );
    } finally {
      post.mockRestore();
    }
  });

  it('4. Correct call-attempt association & active call termination', async () => {
    const res = await plivoService.terminateCall({
      callUuid: 'PLIVO_MOCK_123456',
      region: 'IN'
    });

    expect(res.success).toBe(true);
    expect(res.isMock).toBe(true);
  });
});

describe('Plivo Security & Webhook Validation', () => {
  it('5. Unauthorized webhook or custom-tool request rejection when header is missing or invalid', async () => {
    const origSecret = process.env.PLIVO_WEBHOOK_SECRET;
    try {
      process.env.PLIVO_WEBHOOK_SECRET = 'secret_token_123';
      const mockReqUnauthorized = { get: () => null, query: {}, body: {} };
      const mockReqAuthorized = { get: (header) => (header.toLowerCase() === 'x-plivo-webhook-secret' ? 'secret_token_123' : null), query: {}, body: {} };

      expect(webhookController.isValidPlivoWebhook(mockReqUnauthorized)).toBe(false);
      expect(webhookController.isValidPlivoWebhook(mockReqAuthorized)).toBe(true);

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
      };
      await webhookController.handlePlivoCallback(mockReqUnauthorized, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized webhook request' });
    } finally {
      process.env.PLIVO_WEBHOOK_SECRET = origSecret;
    }
  });

  it('6. Lead resolution helper correctly normalizes lead_id and leadId candidates', () => {
    const leadId = schedulingService.resolveLeadId(null, undefined, 'c1f7a0b3-1234', 'fallback');
    expect(leadId).toBe('c1f7a0b3-1234');
  });

  it('7. Callback scheduling time parsing for valid natural language text and ISO string', () => {
    const resolvedNatural = schedulingService.resolveCallbackTime('tomorrow at 3 PM', 'Asia/Kolkata');
    expect(resolvedNatural).toBeInstanceOf(Date);
    expect(Number.isNaN(resolvedNatural.getTime())).toBe(false);

    const isoStr = '2026-10-12T10:00:00.000Z';
    const resolvedIso = schedulingService.resolveCallbackTime(isoStr, 'Asia/Kolkata');
    expect(resolvedIso).toBeInstanceOf(Date);
    expect(resolvedIso.toISOString()).toBe(isoStr);
  });

  it('8. Callback scheduling failure on missing lead or invalid arguments', async () => {
    let errorCaught = null;
    try {
      await schedulingService.scheduleCallback({
        leadId: null,
        scheduledFor: new Date(),
        timezone: 'Asia/Kolkata'
      });
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toContain('Invalid leadId');
  });

  it('9. Plivo callback custom tool handles time aliases (callback_time / time_text)', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const mockReqMissingTime = {
      get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
      query: {},
      body: { lead_id: 'non-existent-lead-999' }
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };

    await webhookController.handlePlivoCallback(mockReqMissingTime, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Valid lead_id and callback time (time_text / callback_time) are required.'
    });
  });

  it('10. Plivo hangup webhook handles unknown call identifiers gracefully', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const mockReqUnknown = {
      get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
      query: {},
      body: { CallUUID: 'non-existent-uuid-999', HangupCause: 'NORMAL_CLEARING', Duration: '45' }
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };

    await webhookController.handlePlivoHangup(mockReqUnknown, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith('OK');
  });

  it('11. Plivo transcript webhook handles stringified JSON transcript parsing gracefully', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const mockReqStringified = {
      get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
      query: {},
      body: {
        call_uuid: 'unknown-uuid-123',
        transcript: JSON.stringify([
          { speaker: 'Agent', message: 'Hello from Plivo Agent' },
          { speaker: 'User', message: 'Hi there!' }
        ])
      }
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };

    await webhookController.handlePlivoTranscript(mockReqStringified, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith('OK');
  });

  it('12. Express authentication middleware accepts x-plivo-webhook-secret header', () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'test_secret';
    const mockReq = {
      get: (h) => (h.toLowerCase() === 'x-plivo-webhook-secret' ? secret : null),
      originalUrl: '/api/webhooks/plivo/callback'
    };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();

    authenticatePlivoWebhook(mockReq, mockRes, next);
    expect(next).toHaveBeenCalled();
  });

  it('13. Express authentication middleware accepts Authorization: Bearer header', () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'test_secret';
    const mockReq = {
      get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
      originalUrl: '/api/webhooks/plivo/transcript'
    };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();

    authenticatePlivoWebhook(mockReq, mockRes, next);
    expect(next).toHaveBeenCalled();
  });

  it('14. Express authentication middleware accepts valid secret passed in query parameters for Event Callbacks', () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'test_secret';
    const mockReq = {
      get: () => null,
      query: { secret },
      originalUrl: `/api/webhooks/plivo/hangup?secret=${secret}`
    };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();

    authenticatePlivoWebhook(mockReq, mockRes, next);
    expect(next).toHaveBeenCalled();
  });

  it('15. Constant-time secret comparison prevents timing attacks', () => {
    expect(safeCompareSecrets('my_super_secret', 'my_super_secret')).toBe(true);
    expect(safeCompareSecrets('my_super_secret', 'wrong_secret')).toBe(false);
    expect(safeCompareSecrets('short', 'longer_secret')).toBe(false);
    expect(safeCompareSecrets(null, 'secret')).toBe(false);
  });

  it('17. Rejects request with HTTP 401 when token is missing or incorrect', () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'test_secret';
    const mockReqWrong = {
      get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer wrong_token_999' : null),
      originalUrl: '/api/webhooks/plivo/callback'
    };
    const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();

    authenticatePlivoWebhook(mockReqWrong, mockRes, next);
    expect(next).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized webhook request' });
  });

  it('18. Rejects request with HTTP 401 when PLIVO_WEBHOOK_SECRET environment configuration is missing', () => {
    const origSecret = process.env.PLIVO_WEBHOOK_SECRET;
    try {
      delete process.env.PLIVO_WEBHOOK_SECRET;
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer any_token' : null),
        originalUrl: '/api/webhooks/plivo/callback'
      };
      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
      const next = vi.fn();

      authenticatePlivoWebhook(mockReq, mockRes, next);
      expect(next).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized webhook request' });
    } finally {
      process.env.PLIVO_WEBHOOK_SECRET = origSecret;
    }
  });

  it('19. Callback time resolution parses relative phrases like "5 minutes later"', () => {
    const resolved5Mins = schedulingService.resolveCallbackTime('5 minutes later', 'Asia/Kolkata');
    expect(resolved5Mins).toBeInstanceOf(Date);
    expect(Number.isNaN(resolved5Mins.getTime())).toBe(false);

    const diffMinutes = Math.round((resolved5Mins.getTime() - Date.now()) / (1000 * 60));
    expect(diffMinutes).toBeGreaterThanOrEqual(4);
    expect(diffMinutes).toBeLessThanOrEqual(6);
  });

  it('20. Plivo hangup webhook handles nested data payload and aleg_uuid gracefully', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const mockReqNested = {
      get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
      query: {},
      body: {
        data: {
          aleg_uuid: 'd560700f-b7d6-48d0-8e6e-6e3ff26de0d7',
          hangup_cause: 'NORMAL_CLEARING',
          duration: '12'
        }
      }
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    };

    await webhookController.handlePlivoHangup(mockReqNested, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith('OK');
  });

  it('21. Regression fixture test: Transcript webhook with Call UUID 7deb4324-10b1-43fc-a8a6-30e7c334fac0', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockAttempt = {
      id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      plivoCallUuid: '7deb4324-10b1-43fc-a8a6-30e7c334fac0',
      status: 'IN_PROGRESS',
      summary: null,
      plivoRecordingUrl: null
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(mockAttempt);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(mockAttempt);
    const spyUpdate = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, summary: 'Call completed successfully' });
    const spyMessageFindFirst = vi.spyOn(prisma.conversationMessage, 'findFirst').mockResolvedValue(null);
    const spyMessageCreate = vi.spyOn(prisma.conversationMessage, 'create').mockResolvedValue({ id: 'msg-1' });

    try {
      const mockReq = {
        get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
        query: { callAttemptId: '82b75d2e-268a-41b4-b6f3-df13de822c34', leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007' },
        body: {
          call_uuid: '7deb4324-10b1-43fc-a8a6-30e7c334fac0',
          transcript: [
            { speaker: 'agent', message: 'Hello! Calling regarding your inquiry.' },
            { speaker: 'user', message: 'Yes, please call me 5 minutes later.' }
          ],
          summary: 'Customer requested a callback 5 minutes later.',
          recording_url: 'https://media.plivo.com/recordings/7deb4324.mp3'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoTranscript(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true, matched: true, storedMessages: 2 });
      expect(spyMessageCreate).toHaveBeenCalledTimes(2);
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyUpdate.mockRestore();
      spyMessageFindFirst.mockRestore();
      spyMessageCreate.mockRestore();
    }
  });

  it('22. Regression fixture test: Hangup webhook with Call UUID 7deb4324-10b1-43fc-a8a6-30e7c334fac0', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockAttempt = {
      id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      plivoCallUuid: '7deb4324-10b1-43fc-a8a6-30e7c334fac0',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30000),
      duration: null,
      failureReason: null
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(mockAttempt);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(mockAttempt);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, status: 'COMPLETED', duration: 30 });
    const spyUpdateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: mockAttempt.leadId, status: 'COMPLETED' });

    try {
      const mockReq = {
        get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
        query: { callAttemptId: '82b75d2e-268a-41b4-b6f3-df13de822c34', leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007' },
        body: {
          CallUUID: '7deb4324-10b1-43fc-a8a6-30e7c334fac0',
          HangupCause: 'NORMAL_CLEARING',
          Duration: '30'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      expect(spyUpdateAttempt).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: '82b75d2e-268a-41b4-b6f3-df13de822c34' },
        data: expect.objectContaining({ status: 'COMPLETED', duration: 30 })
      }));
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyUpdateAttempt.mockRestore();
      spyUpdateLead.mockRestore();
    }
  });

  it('23. Strict matching verification: Does NOT match historical non-active attempt for leadId', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(null);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(null);
    const spyFindMany = vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue([]);

    try {
      const mockReq = {
        get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
        query: {},
        body: {
          lead_id: 'c8b65e00-0004-4364-a64e-8f0d57786007',
          call_uuid: 'unknown-unmatched-uuid',
          HangupCause: 'NORMAL_CLEARING'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      // Ensure search for active attempt used status in filter
      expect(spyFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
          status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] }
        })
      }));
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyFindMany.mockRestore();
    }
  });

  it('24. Bearer token authorization header validation without query string secrets', () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'test_secret';
    const mockReqBearer = {
      get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
      originalUrl: '/api/webhooks/plivo/transcript',
      query: {},
      body: {}
    };

    expect(webhookController.isValidPlivoWebhook(mockReqBearer)).toBe(true);

    const mockReqInvalidBearer = {
      get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer invalid_secret_xyz' : null),
      originalUrl: '/api/webhooks/plivo/transcript',
      query: {},
      body: {}
    };

    expect(webhookController.isValidPlivoWebhook(mockReqInvalidBearer)).toBe(false);
  });

  it('25. Case-insensitive UUID matching & nested vars payload extraction', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockAttempt = {
      id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      plivoCallUuid: '7deb4324-10b1-43fc-a8a6-30e7c334fac0',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 45000),
      duration: null,
      failureReason: null
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(null);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(mockAttempt);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, status: 'COMPLETED', duration: 45 });
    const spyUpdateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: mockAttempt.leadId, status: 'COMPLETED' });

    try {
      // Upper case UUID in body payload, and call_attempt_id inside nested vars object
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
        query: {},
        body: {
          CallUUID: '7DEB4324-10B1-43FC-A8A6-30E7C334FAC0',
          data: {
            vars: {
              call_attempt_id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
              lead_id: 'c8b65e00-0004-4364-a64e-8f0d57786007'
            }
          },
          HangupCause: 'NORMAL_CLEARING',
          Duration: '45'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyUpdateAttempt.mockRestore();
      spyUpdateLead.mockRestore();
    }
  });

  it('26. Phone number correlation when trigger api_id (16b23579-da63-47d0-9cc5-989c33acd7b4) differs from webhook leg CallUUID', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    // Attempt stored in DB with trigger api_id '16b23579-da63-47d0-9cc5-989c33acd7b4'
    const mockAttempt = {
      id: 'attempt-call-45-id',
      leadId: 'lead-45-id',
      plivoCallUuid: '16b23579-da63-47d0-9cc5-989c33acd7b4',
      plivoTriggerApiId: '16b23579-da63-47d0-9cc5-989c33acd7b4',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 20000),
      duration: null,
      failureReason: null
    };

    const mockLead = {
      id: 'lead-45-id',
      phone: '+919876543210'
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(null);
    const spyFindManyLeads = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);
    const spyFindFirstAttempt = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(mockAttempt);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, status: 'COMPLETED', plivoCallUuid: 'different-leg-uuid-8888', duration: 20 });
    const spyUpdateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: mockLead.id, status: 'COMPLETED' });

    try {
      // Hangup webhook arrives with a different telephony leg CallUUID ('different-leg-uuid-8888') but destination To: '+919876543210'
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
        query: {},
        body: {
          CallUUID: 'different-leg-uuid-8888',
          To: '+919876543210',
          From: '+918065522583',
          HangupCause: 'NORMAL_CLEARING',
          Duration: '20'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');

      // Verify that attempt's plivoCallUuid was updated to the actual leg CallUUID ('different-leg-uuid-8888')
      expect(spyUpdateAttempt).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'attempt-call-45-id' },
        data: expect.objectContaining({ plivoCallUuid: 'different-leg-uuid-8888' })
      }));
    } finally {
      spyFindUnique.mockRestore();
      spyFindManyLeads.mockRestore();
      spyFindFirstAttempt.mockRestore();
      spyUpdateAttempt.mockRestore();
      spyUpdateLead.mockRestore();
    }
  });

  it('27. Ambiguity Safety: Phone number fallback refuses to match when multiple active calls exist for same lead', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockLead = {
      id: 'lead-multi-active-id',
      phone: '+919999988888'
    };

    const mockActiveAttempt1 = {
      id: 'attempt-active-1',
      leadId: 'lead-multi-active-id',
      plivoCallUuid: 'trigger-uuid-1111',
      status: 'IN_PROGRESS'
    };

    const mockActiveAttempt2 = {
      id: 'attempt-active-2',
      leadId: 'lead-multi-active-id',
      plivoCallUuid: 'trigger-uuid-2222',
      status: 'IN_PROGRESS'
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(null);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(null);
    const spyFindManyLeads = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([mockLead]);
    const spyFindManyAttempts = vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue([mockActiveAttempt1, mockActiveAttempt2]);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update');

    try {
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
        query: {},
        body: {
          CallUUID: 'ambiguous-unmatched-leg-uuid',
          To: '+919999988888',
          HangupCause: 'NORMAL_CLEARING',
          Duration: '30'
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');

      // Crucial assertion: no callAttempt update must be called because match was ambiguous!
      expect(spyUpdateAttempt).not.toHaveBeenCalled();
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyFindManyLeads.mockRestore();
      spyFindManyAttempts.mockRestore();
      spyUpdateAttempt.mockRestore();
    }
  });

  it('29. Rejects deterministic identifier conflicts instead of cross-attaching the webhook', async () => {
    const prisma = require('../src/config/prisma');
    const controller = require('../src/controllers/webhook.controller');
    const attempt = {
      id: 'attempt-correct',
      leadId: 'lead-correct',
      plivoCallUuid: 'call-correct',
      plivoConversationId: 'conversation-correct',
      plivoFlowRunUuid: 'run-correct',
      plivoFlowId: 'shared-flow',
      plivoTriggerApiId: 'trigger-correct',
      status: 'IN_PROGRESS'
    };
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(attempt);

    try {
      const result = await controller._findMatchingCallAttempt({
        candidateUuids: ['call-correct'],
        providerIdentifiers: {
          conversationId: 'conversation-other',
          flowRunUuid: 'run-other',
          flowId: 'shared-flow'
        }
      });
      expect(result).toEqual({
        attempt: null,
        matchedBy: 'conflict_plivoCallUuid'
      });
    } finally {
      spyFindFirst.mockRestore();
    }
  });

  it('30. Shared flow UUID with simultaneous attempts remains unmatched', async () => {
    const prisma = require('../src/config/prisma');
    const flowAttempts = [
      { id: 'attempt-a', leadId: 'lead-a', plivoFlowId: 'shared-flow', status: 'IN_PROGRESS' },
      { id: 'attempt-b', leadId: 'lead-b', plivoFlowId: 'shared-flow', status: 'IN_PROGRESS' }
    ];
    const findMany = vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue(flowAttempts);

    try {
      const result = await webhookController._findMatchingCallAttempt({
        providerIdentifiers: { flowId: 'shared-flow' }
      });
      expect(result).toEqual({ attempt: null, matchedBy: 'ambiguous_plivoFlowId' });
    } finally {
      findMany.mockRestore();
    }
  });

  it('31. Same-lead simultaneous attempts are not resolved by lead alone', async () => {
    const prisma = require('../src/config/prisma');
    const findMany = vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue([
      { id: 'attempt-old', leadId: 'same-lead', status: 'IN_PROGRESS' },
      { id: 'attempt-new', leadId: 'same-lead', status: 'IN_PROGRESS' }
    ]);

    try {
      const result = await webhookController._findMatchingCallAttempt({ leadId: 'same-lead' });
      expect(result).toEqual({ attempt: null, matchedBy: 'ambiguous_leadId' });
    } finally {
      findMany.mockRestore();
    }
  });

  it('32. A valid call UUID and conversation ID resolve the same attempt', async () => {
    const prisma = require('../src/config/prisma');
    const attempt = {
      id: 'attempt-new',
      plivoCallUuid: 'call-new',
      plivoConversationId: 'conversation-new',
      status: 'IN_PROGRESS'
    };
    const findFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(attempt);

    try {
      const result = await webhookController._findMatchingCallAttempt({
        candidateUuids: ['call-new'],
        providerIdentifiers: { conversationId: 'conversation-new' }
      });
      expect(result).toEqual({ attempt, matchedBy: 'plivoCallUuid' });
    } finally {
      findFirst.mockRestore();
    }
  });

  it('33. An older completed attempt cannot steal a newer active call webhook', async () => {
    const prisma = require('../src/config/prisma');
    const newer = {
      id: 'attempt-new',
      plivoCallUuid: 'call-new',
      status: 'IN_PROGRESS'
    };
    const findFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(newer);

    try {
      const result = await webhookController._findMatchingCallAttempt({
        candidateUuids: ['call-new']
      });
      expect(result.attempt.id).toBe('attempt-new');
      expect(result.matchedBy).toBe('plivoCallUuid');
    } finally {
      findFirst.mockRestore();
    }
  });

  it('34. A webhook without internal or provider trigger IDs remains unmatched', async () => {
    const prisma = require('../src/config/prisma');
    const findMany = vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue([]);

    try {
      const result = await webhookController._findMatchingCallAttempt({});
      expect(result).toEqual({ attempt: null, matchedBy: 'none' });
    } finally {
      findMany.mockRestore();
    }
  });

  it('28. Event API structure: Correctly extracts call_uuid, call_attempt_id and vars from data.object', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockAttempt = {
      id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      plivoCallUuid: 'call-leg-uuid-inside-object',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30000),
      duration: null,
      failureReason: null
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(mockAttempt);
    const spyFindFirst = vi.spyOn(prisma.callAttempt, 'findFirst').mockResolvedValue(mockAttempt);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, status: 'COMPLETED', duration: 30 });
    const spyUpdateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: mockAttempt.leadId, status: 'COMPLETED' });

    try {
      // Event structure with top-level notification ID '71151727-f0a2-47cb-9e32-5ad2f043e87a' and actual call data in data.object
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'authorization' ? `Bearer ${secret}` : null),
        query: {},
        body: {
          id: '71151727-f0a2-47cb-9e32-5ad2f043e87a',
          created_at: '2026-10-10T22:20:00Z',
          data: {
            event_type: 'call.hangup',
            object: {
              call_uuid: 'call-leg-uuid-inside-object',
              duration: 30,
              hangup_cause: 'NORMAL_CLEARING',
              vars: {
                call_attempt_id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
                lead_id: 'c8b65e00-0004-4364-a64e-8f0d57786007'
              }
            }
          }
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      expect(spyFindUnique).toHaveBeenCalledWith({ where: { id: '82b75d2e-268a-41b4-b6f3-df13de822c34' } });
    } finally {
      spyFindUnique.mockRestore();
      spyFindFirst.mockRestore();
      spyUpdateAttempt.mockRestore();
      spyUpdateLead.mockRestore();
    }
  });

  it('29. Event data JSON payloads are parsed for call_attempt_id, lead_id and call_uuid correlation', async () => {
    const secret = process.env.PLIVO_WEBHOOK_SECRET || 'secret';
    const prisma = require('../src/config/prisma');

    const mockAttempt = {
      id: '82b75d2e-268a-41b4-b6f3-df13de822c34',
      leadId: 'c8b65e00-0004-4364-a64e-8f0d57786007',
      plivoCallUuid: 'older-uuid',
      status: 'IN_PROGRESS',
      startedAt: new Date(Date.now() - 30000),
      duration: null,
      failureReason: null
    };

    const spyFindUnique = vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(mockAttempt);
    const spyUpdateAttempt = vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({ ...mockAttempt, status: 'COMPLETED', duration: 30 });
    const spyUpdateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: mockAttempt.leadId, status: 'COMPLETED' });

    try {
      const mockReq = {
        get: (h) => (h.toLowerCase() === 'x-plivo-webhook-secret' ? secret : null),
        query: {},
        body: {
          id: 'notification-uuid-delivery',
          created_at: '2026-10-10T22:31:41Z',
          data: {
            object: {
              call_uuid: '85aa245d-3435-4576-b446-300a249f0a0e',
              conversation_id: 'conversation-123',
              flow_run_uuid: 'flow-run-999',
              event_name: 'call.hangup',
              event_data: '{"call_attempt_id":"82b75d2e-268a-41b4-b6f3-df13de822c34","lead_id":"c8b65e00-0004-4364-a64e-8f0d57786007","duration":30,"hangup_cause":"NORMAL_CLEARING"}'
            }
          }
        }
      };

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      };

      await webhookController.handlePlivoHangup(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
      expect(spyFindUnique).toHaveBeenCalledWith({ where: { id: '82b75d2e-268a-41b4-b6f3-df13de822c34' } });
    } finally {
      spyFindUnique.mockRestore();
      spyUpdateAttempt.mockRestore();
      spyUpdateLead.mockRestore();
    }
  });
});
