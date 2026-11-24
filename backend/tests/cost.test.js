import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

// Use CommonJS require so spies hit the same module instances the services use.
const require = createRequire(import.meta.url);
const axios = require('axios');
const prisma = require('../src/config/prisma');
const env = require('../src/config/env');
const plivoService = require('../src/integrations/plivo/plivo.service');
const costService = require('../src/services/cost.service');

const baseAttempt = {
  id: 'attempt-1',
  status: 'COMPLETED',
  plivoCallUuid: 'call-uuid-1',
  plivoRegion: 'IN',
  answeredAt: new Date(),
  costStatus: null
};

function mockAttempt(overrides = {}) {
  vi.spyOn(prisma.callAttempt, 'findUnique').mockResolvedValue({ ...baseAttempt, ...overrides });
  return vi.spyOn(prisma.callAttempt, 'update').mockResolvedValue({});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Plivo CDR cost fetch', () => {
  it('parses total_amount, total_rate and billed_duration from the CDR', async () => {
    env.plivo.in.authId = 'AUTH_IN';
    env.plivo.in.authToken = 'TOKEN_IN';
    const get = vi.spyOn(axios, 'get').mockResolvedValue({
      data: { total_amount: '0.01700', total_rate: '0.00850', billed_duration: 120, bill_duration: 95 }
    });

    const result = await plivoService.getCallCost({ callUuid: 'call-uuid-1', region: 'IN' });

    expect(get).toHaveBeenCalledWith(
      'https://api.plivo.com/v1/Account/AUTH_IN/Call/call-uuid-1/',
      expect.objectContaining({ auth: { username: 'AUTH_IN', password: 'TOKEN_IN' } })
    );
    expect(result).toMatchObject({ found: true, totalAmount: 0.017, totalRate: 0.0085, billedDuration: 120 });
  });

  it('returns found=false when Plivo has no CDR (404)', async () => {
    env.plivo.in.authId = 'AUTH_IN';
    env.plivo.in.authToken = 'TOKEN_IN';
    vi.spyOn(axios, 'get').mockRejectedValue({ response: { status: 404, data: {} } });

    const result = await plivoService.getCallCost({ callUuid: 'missing', region: 'IN' });
    expect(result.found).toBe(false);
  });
});

describe('Cost service', () => {
  it('stores the real cost for an answered call', async () => {
    const update = mockAttempt();
    vi.spyOn(plivoService, 'getCallCost').mockResolvedValue({
      found: true, totalAmount: 0.017, totalRate: 0.0085, billedDuration: 120
    });

    const result = await costService.fetchAndStoreCallCost('attempt-1');

    expect(result).toEqual({ status: 'FETCHED', retry: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        costStatus: 'FETCHED', plivoTotalAmount: 0.017, plivoTotalRate: 0.0085, plivoBilledDuration: 120
      })
    }));
  });

  it('marks unanswered calls as not billed without calling Plivo', async () => {
    const update = mockAttempt({ status: 'NO_ANSWER', answeredAt: null });
    const getCallCost = vi.spyOn(plivoService, 'getCallCost');

    const result = await costService.fetchAndStoreCallCost('attempt-1');

    expect(result.status).toBe('NOT_BILLED');
    expect(getCallCost).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ costStatus: 'NOT_BILLED', plivoTotalAmount: 0 })
    }));
  });

  it('asks for a retry while the CDR is not ready, and gives up on the last attempt', async () => {
    const update = mockAttempt();
    vi.spyOn(plivoService, 'getCallCost').mockResolvedValue({ found: false });

    const early = await costService.fetchAndStoreCallCost('attempt-1', { fetchAttempt: 1 });
    expect(early).toEqual({ status: 'PENDING', retry: true });
    expect(update).not.toHaveBeenCalled();

    const last = await costService.fetchAndStoreCallCost('attempt-1', { finalAttempt: true });
    expect(last).toEqual({ status: 'UNAVAILABLE', retry: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ costStatus: 'UNAVAILABLE' })
    }));
  });

  it('retries on Plivo API errors instead of throwing', async () => {
    mockAttempt();
    vi.spyOn(plivoService, 'getCallCost').mockRejectedValue(new Error('timeout'));

    const result = await costService.fetchAndStoreCallCost('attempt-1', { fetchAttempt: 2 });
    expect(result).toEqual({ status: 'PENDING', retry: true });
  });

  it('does not refetch a call that already has a cost', async () => {
    mockAttempt({ costStatus: 'FETCHED' });
    const getCallCost = vi.spyOn(plivoService, 'getCallCost');

    const result = await costService.fetchAndStoreCallCost('attempt-1');
    expect(result).toEqual({ status: 'FETCHED', retry: false });
    expect(getCallCost).not.toHaveBeenCalled();
  });

  it('summarises telephony, AI estimate and per-region totals', async () => {
    env.aiCostPerMin.in = 0.05;
    env.aiCostPerMin.us = 0;
    const asha = { firstName: 'Asha', lastName: 'Rao', phone: '+919800000001', company: null };
    const john = { firstName: 'John', lastName: null, phone: '+14155550000', company: 'Acme' };
    vi.spyOn(prisma.callAttempt, 'findMany').mockResolvedValue([
      { createdAt: new Date('2026-11-20T06:00:00Z'), plivoRegion: 'IN', duration: 95, costStatus: 'FETCHED', plivoTotalAmount: 0.02, plivoBilledDuration: 120, leadId: 'lead-a', lead: asha },
      { createdAt: new Date('2026-11-20T07:00:00Z'), plivoRegion: 'IN', duration: 0, costStatus: 'NOT_BILLED', plivoTotalAmount: 0, plivoBilledDuration: 0, leadId: 'lead-a', lead: asha },
      { createdAt: new Date('2026-11-21T07:00:00Z'), plivoRegion: 'US', duration: 45, costStatus: 'FETCHED', plivoTotalAmount: 0.0115, plivoBilledDuration: 60, leadId: 'lead-b', lead: john },
      { createdAt: new Date('2026-11-21T08:00:00Z'), plivoRegion: 'US', duration: null, costStatus: null, plivoTotalAmount: null, plivoBilledDuration: null, leadId: 'lead-b', lead: john }
    ]);

    try {
      const summary = await costService.getCostSummary({});

      expect(summary.totals.calls).toBe(4);
      expect(summary.totals.billedCalls).toBe(2);
      expect(summary.totals.billedMinutes).toBe(3);
      expect(summary.totals.telephonyCost).toBeCloseTo(0.0315, 4);
      expect(summary.totals.aiCost).toBeCloseTo(0.1, 4);
      expect(summary.totals.totalCost).toBeCloseTo(0.1315, 4);
      expect(summary.totals.costPending).toBe(1);
      expect(summary.byRegion.IN.totalCost).toBeCloseTo(0.12, 4);
      expect(summary.byRegion.US.totalCost).toBeCloseTo(0.0115, 4);
      expect(summary.daily.map(d => d.date)).toEqual(['2026-11-20', '2026-11-21']);
      expect(summary.totals.callMinutes).toBeCloseTo(140 / 60, 2);
      expect(summary.totals.callsWithBilling).toBe(3);
      expect(summary.totals.billingCoverage).toBe(75);

      expect(summary.byLead.map(l => l.name)).toEqual(['Asha Rao', 'John']);
      expect(summary.byLead[0]).toMatchObject({ leadId: 'lead-a', calls: 2, phone: '+919800000001', region: 'IN' });
      expect(summary.byLead[0].totalCost).toBeCloseTo(0.12, 4);
      expect(summary.byLead[1]).toMatchObject({ calls: 2, company: 'Acme', region: 'US' });
    } finally {
      env.aiCostPerMin.in = 0;
      env.aiCostPerMin.us = 0;
    }
  });
});
