const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/error.middleware');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');

const authRoutes = require('./routes/auth.routes');
const leadRoutes = require('./routes/lead.routes');
const callRoutes = require('./routes/call.routes');
const callbackRoutes = require('./routes/callback.routes');
const agentRoutes = require('./routes/agent.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const webhookRoutes = require('./routes/webhook.routes');
const healthRoutes = require('./routes/health.routes');
const webhookController = require('./controllers/webhook.controller');

const app = express();

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/webhooks')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
    }
  });
  next();
});

// Security and CORS middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));

// Body parsers
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API endpoints
app.use('/api/', apiLimiter);

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/callbacks', callbackRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/health', healthRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'AI Lead Qualification & Autonomous Voice Calling Platform API',
    version: '1.0.0',
    status: 'ONLINE',
    docs: '/api/health'
  });
});

// Compatibility route for ElevenLabs tools configured with the tunnel root URL.
// The canonical endpoint remains /api/webhooks/elevenlabs/callback.
app.post('/', webhookController.handleElevenLabsCallback);

// Centralized error middleware
app.use(errorHandler);

module.exports = app;
