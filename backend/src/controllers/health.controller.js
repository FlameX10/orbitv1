const prisma = require('../config/prisma');
const env = require('../config/env');
const { getQueue } = require('../config/queue');

class HealthController {
  async check(req, res) {
    const status = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      environment: env.nodeEnv,
      services: {
        database: { status: 'UNKNOWN' },
        queue: { status: 'UNKNOWN', provider: 'PostgreSQL pg-boss' },
        twilio: { status: 'CONFIGURED', isMock: env.twilio.accountSid.startsWith('AC_MOCK') },
        elevenlabs: { status: 'CONFIGURED', isMock: env.elevenlabs.apiKey.startsWith('MOCK') },
        llm: { status: 'CONFIGURED', provider: env.llm.provider, isMock: env.llm.apiKey.startsWith('MOCK') }
      }
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      status.services.database.status = 'HEALTHY';
    } catch (err) {
      status.services.database.status = 'UNHEALTHY';
      status.services.database.error = err.message;
      status.status = 'DEGRADED';
    }

    try {
      const boss = await getQueue();
      status.services.queue.status = boss ? 'HEALTHY' : 'FALLBACK_MODE';
    } catch (err) {
      status.services.queue.status = 'UNHEALTHY';
      status.status = 'DEGRADED';
    }

    const httpCode = status.status === 'UP' ? 200 : 200; // Return 200 with degraded state for easy dashboard reporting
    res.status(httpCode).json(status);
  }
}

module.exports = new HealthController();
