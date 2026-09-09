const analyticsService = require('../services/analytics.service');

class AnalyticsController {
  async getActualCosting(req, res, next) {
    try {
      const costing = await analyticsService.getActualCosting();
      res.json({ success: true, data: costing });
    } catch (err) {
      next(err);
    }
  }

  async getOverview(req, res, next) {
    try {
      const overview = await analyticsService.getDashboardOverview();
      res.json({ success: true, data: overview });
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
