const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

router.get('/overview', analyticsController.getOverview);
router.get('/charts', analyticsController.getCharts);
router.get('/costs', analyticsController.getCosts);

module.exports = router;
