const agentService = require('../services/agent.service');

class AgentController {
  async get(req, res, next) {
    try {
      const agent = await agentService.getOrCreateDefaultAgent();
      res.json({ success: true, data: agent });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const agent = await agentService.updateAgent(id, req.body);
      res.json({ success: true, data: agent });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AgentController();
