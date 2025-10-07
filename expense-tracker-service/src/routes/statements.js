const express = require('express');
const router = express.Router();
const {
  processStatementOCR,
  confirmStatementTransactions,
  rejectStatementProcessing,
  getStatementHistory
} = require('../controllers/statementController');
const { uploadMiddleware } = require('../middleware/upload');

// Statement processing endpoints - Two-step process
router.post('/process-ocr', uploadMiddleware.single('statement'), processStatementOCR);
router.post('/confirm-transactions', confirmStatementTransactions);
router.post('/reject-processing', rejectStatementProcessing);
router.get('/history', getStatementHistory);

module.exports = router;
