import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const prisma = require('../src/config/prisma');
const schedulingService = require('../src/services/scheduling.service');
const webhookController = require('../src/controllers/webhook.controller');

afterEach(() => vi.restoreAllMocks());

describe('save_qualification webhook', () => {
  it('stores the preferred contact time without scheduling an AI callback', async () => {
    const secret = 'test-secret';
    process.env.PLIVO_WEBHOOK_SECRET = secret;
    const lead = { id: 'lead-1', status: 'QUALIFYING', metadata: {} };
    vi.spyOn(prisma.lead, 'findUnique').mockResolvedValue(lead);
    const leadUpdate = vi.spyOn(prisma.lead, 'update').mockResolvedValue(lead);
    vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue(null);
    const schedule = vi.spyOn(schedulingService, 'scheduleCallback');

    const req = {
      get: (h) => (h === 'x-plivo-webhook-secret' ? secret : null),
      query: {},
      body: {
        lead_id: 'lead-1',
        call_attempt_id: 'attempt-1',
        additional_notes: 'Needs app in Hindi',
        callback_day: 'Monday',
        callback_time: 'tomorrow 4 pm'
      }
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await webhookController.handlePlivoQualification(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(schedule).not.toHaveBeenCalled();
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { metadata: expect.objectContaining({ callback_day: 'Monday', callback_time: 'tomorrow 4 pm', additional_notes: 'Needs app in Hindi' }) }
    }));
  });
});
