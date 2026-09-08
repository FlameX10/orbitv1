const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/voiceagent_db?schema=public',
  
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || 'AC_MOCK_SID',
    authToken: process.env.TWILIO_AUTH_TOKEN || 'MOCK_TOKEN',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
    webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:5000'
  },
  
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || 'MOCK_ELEVENLABS_KEY',
    agentId: process.env.ELEVENLABS_AGENT_ID || 'MOCK_AGENT_ID',
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || '',
    callbackUrl: process.env.ELEVENLABS_CALLBACK_URL || '/api/webhooks/elevenlabs/callback',
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || ''
  },
  
  llm: {
    provider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(),
    apiKey: process.env.LLM_API_KEY || 'MOCK_LLM_KEY',
    model: process.env.LLM_MODEL || 'gpt-4o-mini'
  },
  
  maxConcurrentCalls: parseInt(process.env.MAX_CONCURRENT_CALLS || '10', 10),
  maxCallAttempts: parseInt(process.env.MAX_CALL_ATTEMPTS || '3', 10),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_development_key_123'
};
