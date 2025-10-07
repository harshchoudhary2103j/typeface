const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { expenseSubclasses } = require('../constants/transactionSubclasses');

// Helper function to run Python OCR script
const runOCRScript = (imagePath) => {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, '../utils/ocr_util/gemini_ocr.py');
    const pythonProcess = spawn('python', [pythonScriptPath, imagePath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python OCR script failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Parse JSON output from Python script
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        reject(new Error(`Failed to parse OCR output: ${parseError.message}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python OCR process: ${error.message}`));
    });
  });
};

// Helper function to convert OCR data to transaction format
const convertOCRToTransaction = (ocrData, userId) => {
  const transaction = {
    userId: new mongoose.Types.ObjectId(userId),
    type: 'expense', // Receipts are always expenses
    amount: parseFloat(ocrData.amount_paid || ocrData.total || 0),
    description: `Receipt from ${ocrData.merchant || 'Unknown Merchant'}`,
    date: new Date(ocrData.date || Date.now()),
    paymentMethod: 'other' // Default payment method for receipts
  };

  // Set subclass from OCR category or default to other_expenses
  if (ocrData.category && expenseSubclasses.includes(ocrData.category)) {
    transaction.subclass = ocrData.category;
  } else {
    transaction.subclass = 'other_expenses';
  }

  // Add receipt-specific metadata
  transaction.receiptData = {
    merchant: ocrData.merchant,
    items: ocrData.items || [],
    ocrConfidence: ocrData.category_source || 'unknown',
    extractedAt: new Date()
  };

  return transaction;
};

// Process receipt and create transaction (main endpoint)
const processReceiptAndCreateTransaction = async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No receipt file uploaded'
      });
    }

    const imagePath = req.file.path;
    
    console.log(`Processing receipt for transaction creation: ${req.file.filename}`);
    
    // Run OCR processing
    const ocrResult = await runOCRScript(imagePath);
    
    console.log('OCR Result:', JSON.stringify(ocrResult, null, 2));

    // Validate OCR result has required fields
    if (!ocrResult.amount_paid && !ocrResult.total) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract amount from receipt',
        data: { ocrResult }
      });
    }

    // Convert OCR result to transaction format
    const transactionData = convertOCRToTransaction(ocrResult, userId);

    // Add additional metadata for receipt-based transactions
    transactionData.receiptData = {
      ...transactionData.receiptData,
      originalFilename: req.file.originalname,
      uploadedFilename: req.file.filename,
      fileSize: req.file.size,
      filePath: req.file.path,
      processedAt: new Date()
    };

    // Create transaction in database
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();

    console.log('Receipt-based transaction created:', savedTransaction._id);

    res.status(201).json({
      success: true,
      message: 'Receipt successfully processed and expense transaction created',
      data: {
        transaction: savedTransaction,
        extractedData: {
          merchant: ocrResult.merchant,
          amount: savedTransaction.amount,
          date: savedTransaction.date,
          category: savedTransaction.subclass,
          items: ocrResult.items || [],
          confidence: ocrResult.category_source || 'unknown'
        },
        receiptFile: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          saved: true
        }
      }
    });

  } catch (error) {
    console.error('Error processing receipt and creating transaction:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }

    if (error.message.includes('Python script failed')) {
      return res.status(500).json({
        success: false,
        message: 'Receipt OCR processing failed',
        error: error.message
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Failed to create transaction from receipt data',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while processing receipt',
      error: error.message
    });
  }
};

// Get receipt processing history
const getReceiptHistory = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Find transactions that have receipt data
    const [transactions, totalCount] = await Promise.all([
      Transaction.find({
        userId: new mongoose.Types.ObjectId(userId),
        receiptData: { $exists: true }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        receiptData: { $exists: true }
      })
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Receipt history retrieved successfully',
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching receipt history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  processReceiptAndCreateTransaction,
  getReceiptHistory
};
     


 
