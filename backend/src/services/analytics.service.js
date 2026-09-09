const prisma = require('../config/prisma');
const elevenLabsService = require('../integrations/elevenlabs/elevenlabs.service');

class AnalyticsService {
  async getActualCosting() {
    const calls = await prisma.callAttempt.findMany({
      where: { duration: { not: null } },
      select: {
        id: true,
        duration: true,
        status: true,
        elevenLabsSessionId: true,
        elevenLabsMetadata: true,
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, company: true }
        }
      }
    });

    const enrichedCalls = await Promise.all(calls.map(async (call) => {
      const cachedProvider = call.elevenLabsMetadata || {};
      const cachedMetadata = cachedProvider.metadata || {};
      const hasProviderBilling = (cachedMetadata.cost !== undefined || cachedMetadata.cost_fiat !== undefined) &&
        (cachedProvider.charging?.llm_charge !== undefined || cachedProvider.charging?.llm_price !== undefined);

      if (call.elevenLabsSessionId && !hasProviderBilling) {
        const conversation = await elevenLabsService.getConversationDetails(call.elevenLabsSessionId);
        if (conversation) {
          call.elevenLabsMetadata = conversation;
          await prisma.callAttempt.update({
            where: { id: call.id },
            data: { elevenLabsMetadata: conversation }
          });
        }
      }

      return call;
    }));

    const totals = enrichedCalls.reduce((result, call) => {
      const provider = call.elevenLabsMetadata || {};
      const metadata = provider.metadata || {};
      const charging = provider.charging || metadata.charging || {};
      const duration = Number(call.duration) || 0;
      const elevenLabsCredits = Number(metadata.cost);
      const elevenLabsCost = Number(metadata.cost_fiat);
      const llmCredits = Number(charging.llm_charge ?? metadata.llm_charge);
      const llmCost = Number(charging.llm_price ?? metadata.llm_price);

      result.calls += 1;
      result.minutes += duration / 60;
      if (Number.isFinite(elevenLabsCredits)) result.elevenLabsCredits += elevenLabsCredits;
      if (Number.isFinite(elevenLabsCost)) result.elevenLabsCost += elevenLabsCost;
      if (Number.isFinite(llmCredits)) result.llmCredits += llmCredits;
      if (Number.isFinite(llmCost)) result.llmCost += llmCost;
      return result;
    }, {
      calls: 0,
      minutes: 0,
      elevenLabsCredits: 0,
      elevenLabsCost: 0,
      llmCredits: 0,
      llmCost: 0
    });

    const configuredCostCalls = enrichedCalls.filter((call) => {
      const metadata = call.elevenLabsMetadata?.metadata || {};
      return Number.isFinite(Number(metadata.cost_fiat));
    }).length;

    const users = Object.values(enrichedCalls.reduce((result, call) => {
      const key = call.lead.id;
      const current = result[key] || {
        id: call.lead.id,
        name: [call.lead.firstName, call.lead.lastName].filter(Boolean).join(' '),
        email: call.lead.email,
        company: call.lead.company,
        calls: 0,
        minutes: 0,
        elevenLabsCredits: 0,
        providerCost: 0,
        llmCost: 0
      };
      const provider = call.elevenLabsMetadata || {};
      const metadata = provider.metadata || {};
      const charging = provider.charging || metadata.charging || {};
      current.calls += 1;
      current.minutes += (Number(call.duration) || 0) / 60;
      current.elevenLabsCredits += Number(metadata.cost) || 0;
      current.providerCost += (Number(metadata.cost_fiat) || 0) + (Number(charging.llm_price) || 0);
      current.llmCost += Number(charging.llm_price) || 0;
      result[key] = current;
      return result;
    }, {})).map((user) => ({
      ...user,
      minutes: Number(user.minutes.toFixed(2)),
      elevenLabsCredits: Number(user.elevenLabsCredits.toFixed(2)),
      providerCost: Number(user.providerCost.toFixed(4)),
      llmCost: Number(user.llmCost.toFixed(4))
    })).sort((left, right) => right.providerCost - left.providerCost);

    return {
      ...totals,
      providerCost: Number((totals.elevenLabsCost + totals.llmCost).toFixed(4)),
      minutes: Number(totals.minutes.toFixed(2)),
      elevenLabsCredits: Number(totals.elevenLabsCredits.toFixed(2)),
      elevenLabsCost: Number(totals.elevenLabsCost.toFixed(4)),
      llmCredits: Number(totals.llmCredits.toFixed(2)),
      llmCost: Number(totals.llmCost.toFixed(4)),
      configuredCostCalls,
      dataCoverage: enrichedCalls.length > 0 ? Number(((configuredCostCalls / enrichedCalls.length) * 100).toFixed(1)) : 0,
      users
    };
  }

  async getDashboardOverview() {
    const [
      totalLeads,
      qualifiedLeads,
      notQualifiedLeads,
      callbacksCount,
      totalCalls,
      connectedCalls,
      failedCalls,
      activeCallsCount,
      avgDurationResult
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'QUALIFIED' } }),
      prisma.lead.count({ where: { status: 'NOT_QUALIFIED' } }),
      prisma.callback.count({ where: { status: 'SCHEDULED' } }),
      prisma.callAttempt.count(),
      prisma.callAttempt.count({ where: { status: 'COMPLETED' } }),
      prisma.callAttempt.count({ where: { status: { in: ['FAILED', 'NO_ANSWER', 'BUSY'] } } }),
      prisma.callAttempt.count({ where: { status: { in: ['INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] } } }),
      prisma.callAttempt.aggregate({
        _avg: { duration: true },
        where: { duration: { not: null } }
      })
    ]);

    const conversionRate = totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) : '0.0';
    const connectionRate = totalCalls > 0 ? ((connectedCalls / totalCalls) * 100).toFixed(1) : '0.0';
    const avgDuration = Math.round(avgDurationResult._avg.duration || 0);

    return {
      totalLeads,
      qualifiedLeads,
      notQualifiedLeads,
      callbacksCount,
      totalCalls,
      connectedCalls,
      failedCalls,
      activeCallsCount,
      conversionRate: parseFloat(conversionRate),
      connectionRate: parseFloat(connectionRate),
      avgDuration
    };
  }

  async getAnalyticsCharts() {
    const [statusDistribution, scoreDistribution, recentCalls] = await Promise.all([
      prisma.lead.groupBy({
        by: ['status'],
        _count: { id: true }
      }),
      prisma.qualificationResult.findMany({
        select: { score: true }
      }),
      prisma.callAttempt.findMany({
        take: 30,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true, duration: true }
      })
    ]);

    const statusChartData = statusDistribution.map(item => ({
      name: item.status.replace('_', ' '),
      value: item._count.id
    }));

    const scoreBuckets = { '0-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    scoreDistribution.forEach(r => {
      const s = r.score;
      if (s <= 40) scoreBuckets['0-40']++;
      else if (s <= 60) scoreBuckets['41-60']++;
      else if (s <= 80) scoreBuckets['61-80']++;
      else scoreBuckets['81-100']++;
    });

    const scoreChartData = Object.keys(scoreBuckets).map(key => ({
      range: key,
      count: scoreBuckets[key]
    }));

    return {
      statusChartData,
      scoreChartData,
      recentCalls
    };
  }
}

module.exports = new AnalyticsService();
