const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const { authenticatePlivoWebhook } = require('../middleware/plivoAuth.middleware');

router.post('/twilio/voice', webhookController.handleTwilioVoice);
router.post('/twilio/status', webhookController.handleTwilioStatus);
router.post('/twilio/speech', webhookController.handleTwilioSpeech);
router.post('/elevenlabs/callback', webhookController.handleElevenLabsCallback);
router.post('/elevenlabs/transcript', webhookController.handleElevenLabsTranscript);

// Plivo Webhooks & Custom Tools (Protected by authenticatePlivoWebhook middleware)
router.post('/plivo/hangup', authenticatePlivoWebhook, webhookController.handlePlivoHangup);
router.post('/plivo/transcript', authenticatePlivoWebhook, webhookController.handlePlivoTranscript);
router.post('/plivo/callback', authenticatePlivoWebhook, webhookController.handlePlivoCallback);
router.post('/plivo/qualification', authenticatePlivoWebhook, webhookController.handlePlivoQualification);

module.exports = router;
