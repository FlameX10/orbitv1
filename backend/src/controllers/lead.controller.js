const leadService = require('../services/lead.service');
const { broadcastEvent } = require('../websocket/socket.server');

class LeadController {
  async create(req, res, next) {
    try {
      const { firstName, lastName, phone, email, company, source, delaySeconds } = req.body;
      
      if (!firstName || !phone) {
        return res.status(400).json({ success: false, error: 'firstName and phone are required parameters' });
      }

      const result = await leadService.createLead({
        firstName,
        lastName,
        phone,
        email,
        company,
        source: source || 'website'
      }, delaySeconds ? parseInt(delaySeconds, 10) : 0);

      // Broadcast real-time event to connected dashboard clients
      broadcastEvent('new_lead', { lead: result.lead, isDuplicate: result.isDuplicate });

      res.status(201).json({
        success: true,
        data: result.lead,
        isDuplicate: result.isDuplicate,
        message: result.isDuplicate ? 'Duplicate lead detected. Calling job updated.' : 'Lead created and queued for automated calling.'
      });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const { search, status, page, limit } = req.query;
      const result = await leadService.listLeads({
        search,
        status,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const lead = await leadService.getLeadById(req.params.id);
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }
      res.json({ success: true, data: lead });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { status } = req.body;
      const lead = await leadService.updateLeadStatus(req.params.id, status);
      broadcastEvent('lead_updated', { lead });
      res.json({ success: true, data: lead });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LeadController();
