const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agent.controller');

router.get('/', agentController.get);
router.patch('/:id', agentController.update);

module.exports = router;
