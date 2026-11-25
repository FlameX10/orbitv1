const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');

// Status-only progress for the public instant-call page (no lead data).
router.get('/leads/:id/call-status', leadController.publicCallStatus);

module.exports = router;
