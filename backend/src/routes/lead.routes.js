const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { leadIngestionLimiter } = require('../middleware/rateLimiter.middleware');
const { authenticate } = require('../middleware/auth.middleware');

// Public: website / instant-call lead submission.
router.post('/', leadIngestionLimiter, leadController.create);

// Signed-in dashboard users only.
router.get('/', authenticate, leadController.list);
router.get('/:id', authenticate, leadController.getById);
router.patch('/:id', authenticate, leadController.update);

module.exports = router;
