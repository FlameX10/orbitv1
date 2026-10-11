const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Constant-time comparison between two strings to prevent timing side-channel attacks
 */
function safeCompareSecrets(aStr, bStr) {
  if (typeof aStr !== 'string' || typeof bStr !== 'string' || !aStr || !bStr) {
    return false;
  }
  const a = Buffer.from(aStr);
  const b = Buffer.from(bStr);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extract candidate secret from request headers (x-plivo-webhook-secret, Authorization: Bearer)
 * or query parameters (secret, webhook_secret) for Plivo Event Callback URLs.
 */
function extractPlivoWebhookSecret(req) {
  const headerSecret = req.get('x-plivo-webhook-secret');
  if (headerSecret && typeof headerSecret === 'string' && headerSecret.trim()) {
    return headerSecret.trim();
  }

  const authHeader = req.get('authorization');
  if (authHeader && typeof authHeader === 'string' && authHeader.trim()) {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer' && parts[1].trim()) {
      return parts[1].trim();
    }
  }

  if (req.query) {
    const querySecret = req.query.secret || req.query.webhook_secret || req.query.x_plivo_webhook_secret;
    if (querySecret && typeof querySecret === 'string' && querySecret.trim()) {
      return querySecret.trim();
    }
  }

  return null;
}

/**
 * Validate incoming Plivo webhook request against configured PLIVO_WEBHOOK_SECRET
 */
function validatePlivoWebhookRequest(req) {
  const expectedSecret = String(process.env.PLIVO_WEBHOOK_SECRET || env.plivo?.webhookSecret || '').trim();
  if (!expectedSecret) {
    return { valid: false, reason: 'PLIVO_WEBHOOK_SECRET is not configured on server' };
  }

  const candidateSecret = extractPlivoWebhookSecret(req);
  if (!candidateSecret) {
    return { valid: false, reason: 'Missing authentication header (x-plivo-webhook-secret or Authorization: Bearer)' };
  }

  if (!safeCompareSecrets(candidateSecret, expectedSecret)) {
    return { valid: false, reason: 'Invalid or incorrect webhook secret' };
  }

  return { valid: true };
}

/**
 * Express middleware to authenticate all incoming Plivo webhook requests
 */
function authenticatePlivoWebhook(req, res, next) {
  const validation = validatePlivoWebhookRequest(req);

  if (!validation.valid) {
    logger.warn('Plivo webhook authentication rejected', {
      endpoint: req.originalUrl || req.path,
      status: 401,
      reason: validation.reason
    });
    return res.status(401).json({ success: false, error: 'Unauthorized webhook request' });
  }

  next();
}

module.exports = {
  authenticatePlivoWebhook,
  validatePlivoWebhookRequest,
  extractPlivoWebhookSecret,
  safeCompareSecrets
};
