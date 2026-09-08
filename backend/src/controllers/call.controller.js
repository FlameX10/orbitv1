const callService = require('../services/call.service');

class CallController {
  async list(req, res, next) {
    try {
      const { page, limit, status } = req.query;
      const result = await callService.listCalls({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async getActive(req, res, next) {
    try {
      const activeCalls = await callService.getActiveCalls();
      res.json({ success: true, data: activeCalls });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const call = await callService.getCallById(req.params.id);
      if (!call) {
        return res.status(404).json({ success: false, error: 'Call attempt not found' });
      }
      res.json({ success: true, data: call });
    } catch (err) {
      next(err);
    }
  }

  async triggerOutboundCall(req, res, next) {
    try {
      const { leadId } = req.body;
      if (!leadId) {
        return res.status(400).json({ success: false, error: 'leadId is required' });
      }
      const attempt = await callService.initiateCallForLead(leadId, 'manual_dashboard_trigger');
      res.json({ success: true, message: 'Outbound call initiated', data: attempt });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CallController();
