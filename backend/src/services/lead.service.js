const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { scheduleJob, JOB_QUEUES } = require('../config/queue');

class LeadService {
  async expireStaleCallAttempts(leadId) {
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    const result = await prisma.callAttempt.updateMany({
      where: {
        leadId,
        status: { in: ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] },
        updatedAt: { lt: staleBefore }
      },
      data: {
        status: 'FAILED',
        failureReason: 'Call attempt expired after no provider status update.',
        endedAt: new Date()
      }
    });

    if (result.count > 0) {
      logger.warn(`Expired ${result.count} stale call attempt(s) for Lead [${leadId}]`);
    }
  }

  /**
   * Normalize phone number to E.164 format
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+')) {
      // Default to Indian +91 if 10 digits starting with 6-9, or default +1
      if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
        cleaned = `+91${cleaned}`;
      } else {
        cleaned = `+1${cleaned}`;
      }
    }
    return cleaned;
  }

  /**
   * Ingest new lead with duplicate protection
   */
  async createLead(leadData, scheduleDelaySeconds = 0) {
    const phone = this.normalizePhoneNumber(leadData.phone);
    if (!phone) {
      throw new Error('Valid phone number is required');
    }

    // 1. Expire orphaned provider states before duplicate protection.
    const existingLeadId = await prisma.lead.findUnique({
      where: { phone },
      select: { id: true }
    });

    if (existingLeadId) {
      await this.expireStaleCallAttempts(existingLeadId.id);
    }

    const existingLead = await prisma.lead.findUnique({
      where: { phone },
      include: {
        callAttempts: {
          where: {
            status: { in: ['QUEUED', 'INITIATING', 'RINGING', 'ANSWERED', 'IN_PROGRESS'] },
            NOT: { twilioCallSid: { startsWith: 'CA_MOCK_' } }
          }
        }
      }
    });

    if (existingLead) {
      // Check DNC status
      if (existingLead.status === 'DO_NOT_CALL') {
        logger.warn(`Lead ingestion blocked: Phone number [${phone}] is marked DO_NOT_CALL.`);
        return { lead: existingLead, isDuplicate: true, status: 'DO_NOT_CALL_BLOCKED' };
      }

      // If active call attempt already exists, don't trigger duplicate call
      if (existingLead.callAttempts && existingLead.callAttempts.length > 0) {
        logger.warn(`Lead ingestion duplicate call avoided: Active call exists for [${phone}].`);
        return { lead: existingLead, isDuplicate: true, status: 'ACTIVE_CALL_IN_PROGRESS' };
      }
    }

    // 2. Create or update Lead record inside a Prisma transaction
    const lead = await prisma.$transaction(async (tx) => {
      if (existingLead) {
        return await tx.lead.update({
          where: { id: existingLead.id },
          data: {
            firstName: leadData.firstName || existingLead.firstName,
            lastName: leadData.lastName || existingLead.lastName,
            email: leadData.email || existingLead.email,
            company: leadData.company || existingLead.company,
            source: leadData.source || existingLead.source,
            status: scheduleDelaySeconds > 0 ? 'CALLBACK_SCHEDULED' : 'QUEUED',
            metadata: leadData.metadata ? { ...existingLead.metadata, ...leadData.metadata } : existingLead.metadata
          }
        });
      } else {
        return await tx.lead.create({
          data: {
            firstName: leadData.firstName,
            lastName: leadData.lastName,
            phone,
            email: leadData.email,
            company: leadData.company,
            source: leadData.source || 'website',
            status: scheduleDelaySeconds > 0 ? 'CALLBACK_SCHEDULED' : 'QUEUED',
            metadata: leadData.metadata || {}
          }
        });
      }
    });

    // 3. Enqueue calling job asynchronously (returns HTTP response immediately)
    const options = {};
    if (scheduleDelaySeconds > 0) {
      options.startAfter = scheduleDelaySeconds;
    }

    await scheduleJob(JOB_QUEUES.CALL_LEAD, {
      leadId: lead.id,
      attemptNumber: 1,
      reason: scheduleDelaySeconds > 0 ? 'scheduled_lead_call' : 'new_website_lead'
    }, options);

    logger.info(`Lead successfully ingested [${lead.id}] - Phone [${phone}] - Scheduled delay [${scheduleDelaySeconds}s]`);
    return { lead, isDuplicate: false, status: 'QUEUED' };
  }

  async getLeadById(id) {
    return await prisma.lead.findUnique({
      where: { id },
      include: {
        callAttempts: {
          orderBy: { createdAt: 'desc' },
          include: { messages: true }
        },
        callbacks: { orderBy: { createdAt: 'desc' } },
        qualificationResult: true
      }
    });
  }

  async listLeads({ search, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          qualificationResult: true,
          callbacks: { where: { status: 'SCHEDULED' }, take: 1 }
        }
      }),
      prisma.lead.count({ where })
    ]);

    return {
      leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async updateLeadStatus(id, newStatus) {
    return await prisma.lead.update({
      where: { id },
      data: { status: newStatus }
    });
  }
}

module.exports = new LeadService();
