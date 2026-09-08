const { addMinutes, addHours, addDays, setHours, setMinutes, parseISO, isBefore } = require('date-fns');
const { toZonedTime, fromZonedTime } = require('date-fns-tz');
const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const { scheduleJob, JOB_QUEUES } = require('../config/queue');

class SchedulingService {
  normalizeLeadId(leadId) {
    if (leadId === undefined || leadId === null) return null;

    const value = String(leadId).trim();
    if (!value || ['none', 'null', 'undefined', 'nan'].includes(value.toLowerCase())) {
      return null;
    }

    return value;
  }

  resolveLeadId(...candidates) {
    for (const candidate of candidates) {
      const leadId = this.normalizeLeadId(candidate);
      if (leadId) return leadId;
    }

    return null;
  }

  _resolveNumberWord(value) {
    const wordMap = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
      ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
      seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
      sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
    };

    const normalized = (value || '').toLowerCase().trim();
    return wordMap[normalized] ?? null;
  }

  /**
   * Resolves relative or absolute natural text expressions into UTC Date object
   * Default timezone: Asia/Kolkata (configurable via env)
   */
  resolveCallbackTime(rawText, userTimezone = env.defaultTimezone) {
    const text = (rawText || '').toLowerCase().trim();
    const nowUtc = new Date();
    
    // Convert current UTC time into target timezone local time representation
    let localNow = toZonedTime(nowUtc, userTimezone);

    // 1. Minute relative offset ("in 10 minutes", "after two minutes", "in 30 mins")
    const minutesMatch = text.match(/(?:in|after)\s+(?:an?\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\s*(?:min|mins|minute|minutes)/i);
    if (minutesMatch) {
      const minuteValue = parseInt(minutesMatch[1], 10);
      const mins = Number.isNaN(minuteValue) ? this._resolveNumberWord(minutesMatch[1]) : minuteValue;
      if (mins !== null) {
        const targetLocal = addMinutes(localNow, mins);
        return fromZonedTime(targetLocal, userTimezone);
      }
    }

    // 2. Hour relative offset ("in 2 hours", "after one hour", "in 1 hr")
    const hoursMatch = text.match(/(?:in|after)\s+(?:an?\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:hr|hrs|hour|hours)/i);
    if (hoursMatch) {
      const hourValue = parseInt(hoursMatch[1], 10);
      const hrs = Number.isNaN(hourValue) ? this._resolveNumberWord(hoursMatch[1]) : hourValue;
      if (hrs !== null) {
        const targetLocal = addHours(localNow, hrs);
        return fromZonedTime(targetLocal, userTimezone);
      }
    }

    // 3. Time of day parsing ("at 3 pm", "at 15:00", "5 pm", "3 o'clock")
    let targetHour = 15; // default 3 PM if not specified
    let targetMinute = 0;

    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10);
      const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      if (meridiem === 'pm' && hr < 12) hr += 12;
      if (meridiem === 'am' && hr === 12) hr = 0;
      if (!meridiem && hr < 8) hr += 12; // e.g. "at 3" -> 15:00

      targetHour = hr;
      targetMinute = min;
    } else if (text.includes('morning')) {
      targetHour = 10;
    } else if (text.includes('afternoon')) {
      targetHour = 14;
    } else if (text.includes('evening') || text.includes('after 5')) {
      targetHour = 17;
    }

    // 4. Date relative offset ("tomorrow", "today", "monday")
    let targetLocal = localNow;
    if (text.includes('day after tomorrow')) {
      targetLocal = addDays(localNow, 2);
    } else if (text.includes('tomorrow')) {
      targetLocal = addDays(localNow, 1);
    }

    // Apply target hour and minute
    targetLocal = setHours(targetLocal, targetHour);
    targetLocal = setMinutes(targetLocal, targetMinute);

    // If the target local time is earlier than current time today, shift to tomorrow
    if (isBefore(targetLocal, localNow) && !text.includes('tomorrow')) {
      targetLocal = addDays(targetLocal, 1);
    }

    const utcResult = fromZonedTime(targetLocal, userTimezone);
    logger.info(`Resolved Callback Time for phrase "${rawText}": Local [${targetLocal.toISOString()}] TZ [${userTimezone}] -> UTC [${utcResult.toISOString()}]`);
    return utcResult;
  }

  /**
   * Schedule a callback in database & pg-boss queue
   */
  async scheduleCallback({ leadId, callAttemptId, scheduledFor, timezone = env.defaultTimezone, reason = 'Customer requested callback' }) {
    const normalizedLeadId = this.normalizeLeadId(leadId);
    if (!normalizedLeadId) {
      throw new Error('Invalid leadId for callback scheduling. Lead context is missing or unresolved.');
    }

    const lead = await prisma.lead.findUnique({ where: { id: normalizedLeadId } });
    if (!lead) {
      throw new Error(`Lead [${normalizedLeadId}] not found. Callback cannot be scheduled for an unknown lead.`);
    }

    // Check for existing pending callback to enforce Rule 3
    const existingCallback = await prisma.callback.findFirst({
      where: {
        leadId: normalizedLeadId,
        status: 'SCHEDULED'
      }
    });

    if (existingCallback) {
      logger.info(`Rule 3 Enforced: Updating existing pending callback [${existingCallback.id}] instead of creating duplicate.`);
      const updated = await prisma.callback.update({
        where: { id: existingCallback.id },
        data: {
          scheduledFor,
          timezone,
          reason,
          callAttemptId
        }
      });

      // Update lead status
      await prisma.lead.update({
        where: { id: normalizedLeadId },
        data: { status: 'CALLBACK_SCHEDULED' }
      });

      // Calculate delay seconds
      const delaySeconds = Math.max(1, Math.floor((scheduledFor.getTime() - Date.now()) / 1000));
      
      await scheduleJob(JOB_QUEUES.CALLBACK_LEAD, {
        callbackId: updated.id,
        leadId: normalizedLeadId,
        reason: 'scheduled_callback'
      }, { startAfter: delaySeconds });

      return updated;
    }

    // Create Callback record in Postgres transaction
    const callback = await prisma.$transaction(async (tx) => {
      const cb = await tx.callback.create({
        data: {
          leadId: normalizedLeadId,
          callAttemptId,
          scheduledFor,
          timezone,
          reason,
          status: 'SCHEDULED'
        }
      });

      await tx.lead.update({
        where: { id: normalizedLeadId },
        data: { status: 'CALLBACK_SCHEDULED' }
      });

      return cb;
    });

    const delaySeconds = Math.max(1, Math.floor((scheduledFor.getTime() - Date.now()) / 1000));
    await scheduleJob(JOB_QUEUES.CALLBACK_LEAD, {
      callbackId: callback.id,
      leadId: normalizedLeadId,
      reason: 'scheduled_callback'
    }, { startAfter: delaySeconds });

    logger.info(`Callback successfully scheduled for Lead [${normalizedLeadId}] at [${scheduledFor.toISOString()}] (in ${delaySeconds}s)`);
    return callback;
  }

  async listCallbacks({ page = 1, limit = 20, status }) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [callbacks, total] = await Promise.all([
      prisma.callback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledFor: 'asc' },
        include: {
          lead: true,
          callAttempt: true
        }
      }),
      prisma.callback.count({ where })
    ]);

    return { callbacks, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async cancelCallback(id) {
    return await prisma.callback.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date()
      }
    });
  }
}

module.exports = new SchedulingService();
