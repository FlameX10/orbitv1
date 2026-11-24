const analyticsService = require('../services/analytics.service');
const costService = require('../services/cost.service');

class AnalyticsController {
  async getOverview(req, res, next) {
    try {
      const overview = await analyticsService.getDashboardOverview();
      res.json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  }

  async getCosts(req, res, next) {
    try {
      const parseDate = (value, endOfDay = false) => {
        if (!value) return undefined;
        const text = String(value);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
          ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
          : new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to, true);
      if (from === null || to === null) {
        return res.status(400).json({ success: false, error: 'from and to must be valid dates (YYYY-MM-DD)' });
      }
      const summary = await costService.getCostSummary({ from, to });
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }

  async getCharts(req, res, next) {
    try {
      const charts = await analyticsService.getAnalyticsCharts();
      res.json({ success: true, data: charts });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnalyticsController();
