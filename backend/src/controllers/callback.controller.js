const schedulingService = require('../services/scheduling.service');

class CallbackController {
  async list(req, res, next) {
    try {
      const { page, limit, status } = req.query;
      const result = await schedulingService.listCallbacks({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { leadId, timeText, timezone, reason } = req.body;
      if (!leadId || !timeText) {
        return res.status(400).json({ success: false, error: 'leadId and timeText are required' });
      }

      const scheduledFor = schedulingService.resolveCallbackTime(timeText, timezone);
      const callback = await schedulingService.scheduleCallback({
        leadId,
        scheduledFor,
        timezone,
        reason: reason || `Manual dashboard scheduling: ${timeText}`
      });

      res.status(201).json({ success: true, data: callback });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const callback = await schedulingService.cancelCallback(req.params.id);
      res.json({ success: true, data: callback });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CallbackController();
