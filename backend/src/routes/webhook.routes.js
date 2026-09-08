const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

router.post('/twilio/voice', webhookController.handleTwilioVoice);
router.post('/twilio/status', webhookController.handleTwilioStatus);
router.post('/twilio/speech', webhookController.handleTwilioSpeech);
router.post('/elevenlabs/callback', webhookController.handleElevenLabsCallback);
router.post('/elevenlabs/transcript', webhookController.handleElevenLabsTranscript);

module.exports = router;
