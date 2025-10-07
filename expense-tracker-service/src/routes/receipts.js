const express = require('express');
const router = express.Router();
const {
  processReceiptAndCreateTransaction,
  getReceiptHistory
} = require('../controllers/receiptController');
const { uploadMiddleware } = require('../middleware/upload');

// Receipt processing endpoints
router.post('/process', uploadMiddleware.single('receipt'), processReceiptAndCreateTransaction);
router.get('/history', getReceiptHistory);

module.exports = router;

