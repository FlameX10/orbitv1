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
const DAY_MS = 24 * 60 * 60 * 1000;
// A Plivo call matches an attempt only if it started within 10 minutes of it.
const MATCH_WINDOW_MS = 10 * 60 * 1000;

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
   * Plivo CDR times may come with or without a UTC offset. Without one, the
   * zone is not documented, so return both UTC and IST readings.
   */
  _parsePlivoTime(value) {
    if (!value || typeof value !== 'string') return [];
    const text = value.trim().replace(' ', 'T');
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? [] : [date];
    }
    const asUtc = new Date(`${text}Z`);
    const asIst = new Date(`${text}+05:30`);
    return [asUtc, asIst].filter(d => !Number.isNaN(d.getTime()));
  }

  /**
   * Find the single Plivo call that belongs to an attempt with no linked UUID.
   * Returns { result: 'match', callUuid } | { result: 'none' } | { result: 'ambiguous' | 'unsupported' }.
   */
  async _findPlivoCallForAttempt(attempt) {
    const startedAt = attempt.startedAt || attempt.createdAt;
    const phone = attempt.lead?.phone;
    if (!startedAt || !phone) return { result: 'unsupported' };
    if (Date.now() - startedAt.getTime() > 89 * DAY_MS) return { result: 'unsupported' };

    const calls = await plivoService.listCallsToNumber({
      toNumber: phone,
      windowStart: new Date(startedAt.getTime() - DAY_MS),
      windowEnd: new Date(startedAt.getTime() + DAY_MS),
      region: attempt.plivoRegion || plivoService.getRegionForPhone(phone)
    });

    const matches = calls.filter(call => {
      if (!call.call_uuid) return false;
      const times = this._parsePlivoTime(call.initiation_time || call.answer_time || call.end_time);
      return times.some(t => Math.abs(t.getTime() - startedAt.getTime()) <= MATCH_WINDOW_MS);
    });
    const uniqueUuids = [...new Set(matches.map(call => call.call_uuid))];

    if (uniqueUuids.length === 0) return { result: 'none' };
    if (uniqueUuids.length > 1) return { result: 'ambiguous' };

    const takenBy = await prisma.callAttempt.findFirst({
      where: { plivoCallUuid: uniqueUuids[0], NOT: { id: attempt.id } },
      select: { id: true }
    });
    if (takenBy) return { result: 'ambiguous' };
    return { result: 'match', callUuid: uniqueUuids[0] };
  }

  /**
   * Fetch the Plivo CDR for one call attempt and store its billed cost.
   * Returns { status, retry } — retry=true means the caller should try again later.
   * When finalAttempt is true, a missing CDR is recorded instead of retried.
   */
  async fetchAndStoreCallCost(callAttemptId, { fetchAttempt = 1, finalAttempt = false } = {}) {
    const attempt = await prisma.callAttempt.findUnique({
      where: { id: callAttemptId },
      include: { lead: { select: { phone: true } } }
    });
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

    let callUuid = attempt.plivoCallUuid;

    if (UNANSWERED_STATUSES.includes(attempt.status) || (callUuid && callUuid.startsWith('PLIVO_MOCK_'))) {
      await this._saveCost(attempt.id, {
        costStatus: 'NOT_BILLED',
        plivoTotalAmount: 0,
        plivoBilledDuration: 0
      });
      return { status: 'NOT_BILLED', retry: false };
    }

    // No hangup webhook ever linked this attempt to a Plivo call: look the call
    // up in Plivo by destination number and start time.
    if (!callUuid) {
      let lookup;
      try {
        lookup = await this._findPlivoCallForAttempt(attempt);
      } catch (err) {
        logger.warn(`Plivo call lookup failed for CallAttempt [${attempt.id}]`, { error: err.message, fetchAttempt });
        if (isLastTry) {
          await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
          return { status: 'UNAVAILABLE', retry: false };
        }
        return { status: 'PENDING', retry: true };
      }

      if (lookup.result === 'none') {
        // Plivo has no call for this attempt, so nothing was connected or billed.
        await this._saveCost(attempt.id, {
          costStatus: 'NOT_BILLED',
          plivoTotalAmount: 0,
          plivoBilledDuration: 0,
          duration: null
        });
        return { status: 'NOT_BILLED', retry: false };
      }
      if (lookup.result !== 'match') {
        // Ambiguous or unsupported: never guess which call it was.
        await this._saveCost(attempt.id, { costStatus: 'UNAVAILABLE' });
        return { status: 'UNAVAILABLE', retry: false };
      }

      callUuid = lookup.callUuid;
      await prisma.callAttempt.update({ where: { id: attempt.id }, data: { plivoCallUuid: callUuid } });
      logger.info(`Linked CallAttempt [${attempt.id}] to Plivo call [${callUuid}] by number and time.`);
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
    // bill_duration is Plivo's exact connected time in seconds (not rounded).
    const exactDuration = cdr.billDuration ?? cdr.callDuration ?? null;
    const status = cdr.totalAmount === 0 && !billedDuration ? 'NOT_BILLED' : 'FETCHED';
    await this._saveCost(attempt.id, {
      costStatus: status,
      plivoTotalAmount: cdr.totalAmount,
      plivoTotalRate: cdr.totalRate,
      plivoBilledDuration: billedDuration,
      ...(exactDuration !== null ? { duration: exactDuration } : {})
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
        duration: true,
        plivoTotalAmount: true,
        plivoBilledDuration: true,
        costStatus: true,
        leadId: true,
        lead: { select: { firstName: true, lastName: true, phone: true, company: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    const emptyBucket = () => ({
      calls: 0,
      callsWithBilling: 0,
      callsWithDuration: 0,
      callMinutes: 0,
      billedCalls: 0,
      billedMinutes: 0,
      telephonyCost: 0,
      aiCost: 0,
      totalCost: 0
    });

    const totals = { ...emptyBucket(), costPending: 0, costUnavailable: 0 };
    const byRegion = { IN: emptyBucket(), US: emptyBucket() };
    const daily = new Map();
    const byLead = new Map();

    for (const a of attempts) {
      const region = String(a.plivoRegion || '').toUpperCase() === 'IN' ? 'IN' : 'US';
      const day = formatInTimeZone(a.createdAt, env.defaultTimezone, 'yyyy-MM-dd');
      if (!daily.has(day)) daily.set(day, { date: day, ...emptyBucket() });
      const leadKey = a.leadId || 'unknown';
      if (!byLead.has(leadKey)) {
        const name = [a.lead?.firstName, a.lead?.lastName].filter(Boolean).join(' ');
        byLead.set(leadKey, {
          leadId: a.leadId || null,
          name: name || 'Unknown lead',
          phone: a.lead?.phone || null,
          company: a.lead?.company || null,
          region,
          lastCallAt: a.createdAt,
          ...emptyBucket()
        });
      }
      const leadBucket = byLead.get(leadKey);
      if (a.createdAt > leadBucket.lastCallAt) leadBucket.lastCallAt = a.createdAt;
      const buckets = [totals, byRegion[region], daily.get(day), leadBucket];

      // Only real, provider-reported durations count; unknown stays out.
      const hasDuration = a.duration !== null && a.duration !== undefined;
      buckets.forEach(b => {
        b.calls += 1;
        if (hasDuration) {
          b.callsWithDuration += 1;
          b.callMinutes += a.duration / 60;
        }
      });

      if (a.costStatus === 'FETCHED' || a.costStatus === 'NOT_BILLED') {
        const telephony = a.plivoTotalAmount || 0;
        const minutes = (a.plivoBilledDuration || 0) / 60;
        const ai = minutes * this._aiRateForRegion(region);
        buckets.forEach(b => {
          b.callsWithBilling += 1;
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
      callMinutes: round(b.callMinutes, 2),
      avgMinutesPerCall: b.callsWithDuration > 0 ? round(b.callMinutes / b.callsWithDuration, 2) : 0,
      billingCoverage: b.calls > 0 ? round((b.callsWithBilling / b.calls) * 100, 1) : 0,
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
      daily: Array.from(daily.values()).map(finish),
      byLead: Array.from(byLead.values())
        .map(finish)
        .sort((x, y) => y.totalCost - x.totalCost || y.calls - x.calls)
    };
  }
}

module.exports = new CostService();
module.exports.MAX_FETCH_ATTEMPTS = MAX_FETCH_ATTEMPTS;
