const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');
const { leadIngestionLimiter } = require('../middleware/rateLimiter.middleware');

router.post('/', leadIngestionLimiter, leadController.create);
router.get('/', leadController.list);
router.get('/:id', leadController.getById);
router.patch('/:id', leadController.update);

module.exports = router;
