const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const plivoWebhookSecret = (process.env.PLIVO_WEBHOOK_SECRET || '').trim();
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

if (nodeEnv === 'production') {
  if (!plivoWebhookSecret || plivoWebhookSecret === 'replace_with_a_strong_random_secret') {
    throw new Error('FATAL CONFIGURATION ERROR: PLIVO_WEBHOOK_SECRET environment variable is missing or set to default placeholder in production environment.');
  }
}

module.exports = {
  nodeEnv,
  port: parseInt(process.env.PORT || '5000', 10),
  publicBaseUrl,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/voiceagent_db?schema=public',
  
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || 'AC_MOCK_SID',
    authToken: process.env.TWILIO_AUTH_TOKEN || 'MOCK_TOKEN',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || publicBaseUrl || 'http://localhost:5000'
  },

  plivo: {
    in: {
      authId: process.env.PLIVO_IN_AUTH_ID || '',
      authToken: process.env.PLIVO_IN_AUTH_TOKEN || '',
      callerNumber: process.env.PLIVO_IN_CALLER_NUMBER || '+918065522583',
      agentTriggerUrl: process.env.PLIVO_IN_AGENT_TRIGGER_URL || ''
    },
    us: {
      authId: process.env.PLIVO_US_AUTH_ID || '',
      authToken: process.env.PLIVO_US_AUTH_TOKEN || '',
      callerNumber: process.env.PLIVO_US_CALLER_NUMBER || '',
      agentTriggerUrl: process.env.PLIVO_US_AGENT_TRIGGER_URL || ''
    },
    webhookSecret: plivoWebhookSecret
  },
  
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || 'MOCK_ELEVENLABS_KEY',
    agentId: process.env.ELEVENLABS_AGENT_ID || 'MOCK_AGENT_ID',
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || 'phnum_8101m4d7q0cpfn3tfwgtg53cndew',
    callbackUrl: process.env.ELEVENLABS_CALLBACK_URL ||
      (publicBaseUrl ? `${publicBaseUrl}/api/webhooks/elevenlabs/callback` : '/api/webhooks/elevenlabs/callback'),
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || ''
  },
  
  llm: {
    provider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(),
    apiKey: process.env.LLM_API_KEY || 'MOCK_LLM_KEY',
    model: process.env.LLM_MODEL || 'gpt-4o-mini'
  },
  
  maxConcurrentCalls: parseInt(process.env.MAX_CONCURRENT_CALLS || '10', 10),
  maxCallAttempts: parseInt(process.env.MAX_CALL_ATTEMPTS || '3', 10),
  staleCallSeconds: parseInt(process.env.STALE_CALL_SECONDS || '1800', 10),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_development_key_123'
};
