const express = require('express');
const router = express.Router();
const callbackController = require('../controllers/callback.controller');

router.get('/', callbackController.list);
router.post('/', callbackController.create);
router.patch('/:id/cancel', callbackController.cancel);

module.exports = router;
