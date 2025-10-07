const express = require('express');
const router = express.Router();
const {
  getCategoryAnalytics,
  getTimelineAnalytics,
  getBalanceOverview,
  getSubclassOptions
} = require('../controllers/analyticsController');

// Analytics endpoints
router.get('/category', getCategoryAnalytics);
router.get('/timeline', getTimelineAnalytics);
router.get('/balance', getBalanceOverview);
router.get('/subclasses', getSubclassOptions);

module.exports = router;