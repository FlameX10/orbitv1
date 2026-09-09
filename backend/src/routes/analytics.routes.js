const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

router.get('/overview', analyticsController.getOverview);
router.get('/costing/actual', analyticsController.getActualCosting);
router.get('/charts', analyticsController.getCharts);

module.exports = router;
