const express = require('express');
const router = express.Router();
const {
  processReceiptOCR,
  confirmReceiptTransaction,
  rejectReceiptProcessing,
  getReceiptHistory
} = require('../controllers/receiptController');
const { uploadMiddleware } = require('../middleware/upload');

// Receipt processing endpoints - Two-step process
router.post('/process-ocr', uploadMiddleware.single('receipt'), processReceiptOCR);
router.post('/confirm-transaction', confirmReceiptTransaction);
router.post('/reject-processing', rejectReceiptProcessing);
router.get('/history', getReceiptHistory);

module.exports = router;

