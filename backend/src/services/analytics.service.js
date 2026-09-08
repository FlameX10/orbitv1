const prisma = require('../config/prisma');

class AnalyticsService {
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
