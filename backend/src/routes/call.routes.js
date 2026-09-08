const express = require('express');
const router = express.Router();
const callController = require('../controllers/call.controller');

router.get('/', callController.list);
router.get('/active', callController.getActive);
router.get('/:id', callController.getById);
router.post('/trigger', callController.triggerOutboundCall);

module.exports = router;
