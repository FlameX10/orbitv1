const { formatInTimeZone } = require('date-fns-tz');
const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const plivoService = require('../integrations/plivo/plivo.service');

// Delay (seconds) before each retry when Plivo has not produced the CDR yet.
const RETRY_DELAYS_SECONDS = [300, 900, 3600, 6 * 3600];
const MAX_FETCH_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

// Plivo does not bill calls that were never answered.
const UNANSWERED_STATUSES = ['NO_ANSWER', 'BUSY'];
const ACTIVE_STATUSES = ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'];

class CostService {
  getRetryDelaySeconds(fetchAttempt) {
    return RETRY_DELAYS_SECONDS[fetchAttempt - 1] || null;
  }

  async _saveCost(attemptId, data) {
    return prisma.callAttempt.update({
      where: { id: attemptId },
      data: { ...data, costFetchedAt: new Date() }
    });
  }

  /**
   * Fetch the Plivo CDR for one call attempt and store its billed cost.
   * Returns { status, retry } — retry=true means the caller should try again later.
   * When finalAttempt is true, a missing CDR is recorded instead of retried.
   */
  async fetchAndStoreCallCost(callAttemptId, { fetchAttempt = 1, finalAttempt = false } = {}) {
    const attempt = await prisma.callAttempt.findUnique({ where: { id: callAttemptId } });
    if (!attempt) {
      logger.warn(`Cost fetch skipped: CallAttempt [${callAttemptId}] not found.`);
      return { status: 'SKIPPED', retry: false };
    }

    if (attempt.costStatus === 'FETCHED' || attempt.costStatus === 'NOT_BILLED') {
      return { status: attempt.costStatus, retry: false };
    }

    const isLastTry = finalAttempt || fetchAttempt >= MAX_FETCH_ATTEMPTS;

    if (ACTIVE_STATUSES.includes(attempt.status)) {
      if (isLastTry) {
        await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
        return { status: 'UNAVAILABLE', retry: false };
      }
      return { status: 'PENDING', retry: true };
    }

    const callUuid = attempt.plivoCallUuid;
    const isMockCall = !callUuid || callUuid.startsWith('PLIVO_MOCK_');

    if (UNANSWERED_STATUSES.includes(attempt.status) || (isMockCall && !attempt.answeredAt)) {
      await this._saveCost(attempt.id, {
        costStatus: 'NOT_BILLED',
        plivoTotalAmount: 0,
        plivoBilledDuration: 0
      });
      return { status: 'NOT_BILLED', retry: false };
    }

    if (isMockCall) {
      await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
      return { status: 'UNAVAILABLE', retry: false };
    }

    let cdr;
    try {
      cdr = await plivoService.getCallCost({ callUuid, region: attempt.plivoRegion || 'US' });
    } catch (err) {
      logger.warn(`Cost fetch failed for CallAttempt [${attempt.id}]`, { error: err.message, fetchAttempt });
      if (isLastTry) {
        await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
        return { status: 'UNAVAILABLE', retry: false };
      }
      return { status: 'PENDING', retry: true };
    }

    if (!cdr.found || cdr.totalAmount === null) {
      if (!isLastTry) {
        return { status: 'PENDING', retry: true };
      }
      await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
      return { status: 'UNAVAILABLE', retry: false };
    }

    const billedDuration = cdr.billedDuration ?? cdr.billDuration ?? null;
    const status = cdr.totalAmount === 0 && !billedDuration ? 'NOT_BILLED' : 'FETCHED';
    await this._saveCost(attempt.id, {
      costStatus: status,
      plivoTotalAmount: cdr.totalAmount,
      plivoTotalRate: cdr.totalRate,
      plivoBilledDuration: billedDuration
    });

    logger.info(`Stored Plivo call cost for CallAttempt [${attempt.id}]`, {
      totalAmount: cdr.totalAmount,
      totalRate: cdr.totalRate,
      billedDuration
    });
    return { status, retry: false };
  }

  _aiRateForRegion(region) {
    return String(region || '').toUpperCase() === 'IN' ? env.aiCostPerMin.in : env.aiCostPerMin.us;
  }

  /**
   * Aggregate real call costs for a date range.
   * Telephony cost is the actual Plivo charge; AI cost is billed minutes x configured rate.
   */
  async getCostSummary({ from, to } = {}) {
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    const attempts = await prisma.callAttempt.findMany({
      where,
      select: {
        createdAt: true,
        status: true,
        plivoRegion: true,
        answeredAt: true,
        plivoTotalAmount: true,
        plivoBilledDuration: true,
        costStatus: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const emptyBucket = () => ({
      calls: 0,
      billedCalls: 0,
      billedMinutes: 0,
      telephonyCost: 0,
      aiCost: 0,
      totalCost: 0
    });

    const totals = { ...emptyBucket(), costPending: 0, costUnavailable: 0 };
    const byRegion = { IN: emptyBucket(), US: emptyBucket() };
    const daily = new Map();

    for (const a of attempts) {
      const region = String(a.plivoRegion || '').toUpperCase() === 'IN' ? 'IN' : 'US';
      const day = formatInTimeZone(a.createdAt, env.defaultTimezone, 'yyyy-MM-dd');
      if (!daily.has(day)) daily.set(day, { date: day, ...emptyBucket() });
      const buckets = [totals, byRegion[region], daily.get(day)];

      buckets.forEach(b => { b.calls += 1; });

      if (a.costStatus === 'FETCHED' || a.costStatus === 'NOT_BILLED') {
        const telephony = a.plivoTotalAmount || 0;
        const minutes = (a.plivoBilledDuration || 0) / 60;
        const ai = minutes * this._aiRateForRegion(region);
        buckets.forEach(b => {
          if (telephony > 0 || minutes > 0) b.billedCalls += 1;
          b.billedMinutes += minutes;
          b.telephonyCost += telephony;
          b.aiCost += ai;
          b.totalCost += telephony + ai;
        });
      } else if (a.costStatus === 'UNAVAILABLE') {
        totals.costUnavailable += 1;
      } else {
        totals.costPending += 1;
      }
    }

    const round = (value, digits = 4) => Number(value.toFixed(digits));
    const finish = (b) => ({
      ...b,
      billedMinutes: round(b.billedMinutes, 2),
      telephonyCost: round(b.telephonyCost),
      aiCost: round(b.aiCost),
      totalCost: round(b.totalCost),
      avgCostPerBilledCall: b.billedCalls > 0 ? round(b.totalCost / b.billedCalls) : 0,
      avgCostPerMinute: b.billedMinutes > 0 ? round(b.totalCost / b.billedMinutes) : 0
    });

    return {
      currency: 'USD',
      range: { from: from || null, to: to || null },
      aiCostPerMin: { IN: env.aiCostPerMin.in, US: env.aiCostPerMin.us },
      totals: finish(totals),
      byRegion: { IN: finish(byRegion.IN), US: finish(byRegion.US) },
      daily: Array.from(daily.values()).map(finish)
    };
  }
}

module.exports = new CostService();
module.exports.MAX_FETCH_ATTEMPTS = MAX_FETCH_ATTEMPTS;
