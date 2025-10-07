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

// Step 1: Process receipt with OCR and return for user review
const processReceiptOCR = async (req, res) => {
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

    const tempFilePath = req.file.path; // File is already in temp folder
    console.log(`Processing OCR for receipt: ${req.file.filename}`);

    // Run OCR processing
    const ocrResult = await runOCRScript(tempFilePath);
    console.log('OCR Result:', JSON.stringify(ocrResult, null, 2));

    // Format response data for user review
    const extractedData = {
      merchant: ocrResult.merchant || '',
      date: ocrResult.date || new Date().toISOString().split('T')[0],
      amount: parseFloat(ocrResult.amount_paid || ocrResult.total || 0),
      description: `Receipt from ${ocrResult.merchant || 'Unknown Merchant'}`,
      subclass: (ocrResult.category && expenseSubclasses.includes(ocrResult.category)) 
        ? ocrResult.category 
        : 'other_expenses',
      items: ocrResult.items || [],
      confidence: ocrResult.category_source || 'unknown',
      tempFilePath: tempFilePath, // Include temp file path for next steps
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size
    };

    res.status(200).json({
      success: true,
      message: 'Receipt processed successfully. Please review the extracted data.',
      data: {
        extractedData,
        availableSubclasses: expenseSubclasses,
        instructions: {
          next_steps: [
            'Review the extracted data above',
            'Edit any incorrect information',
            'Call /confirm-transaction to create the transaction',
            'Call /reject-processing if you want to cancel'
          ]
        }
      }
    });

  } catch (error) {
    console.error('Error processing receipt OCR:', error);

    // Clean up temp file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }

    if (error.message.includes('Python script failed')) {
      return res.status(500).json({
        success: false,
        message: 'OCR processing failed',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during OCR processing',
      error: error.message
    });
  }
};

// Step 2: Confirm and create transaction with user-reviewed data
const confirmReceiptTransaction = async (req, res) => {
  try {
    const { 
      userId,
      merchant,
      date,
      amount,
      description,
      subclass,
      paymentMethod = 'other',
      tempFilePath,
      fileName,
      originalName,
      fileSize
    } = req.body;

    // Validate required fields
    if (!userId || !tempFilePath) {
      return res.status(400).json({
        success: false,
        message: 'User ID and temp file path are required'
      });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Normalize the temp file path - handle both absolute and relative paths
    let normalizedTempPath = tempFilePath;
    
    // If it's a Windows absolute path, use it as is
    if (path.isAbsolute(tempFilePath)) {
      normalizedTempPath = tempFilePath;
    } else {
      // If it's a relative path, resolve it from project root
      normalizedTempPath = path.resolve(__dirname, '../../', tempFilePath);
    }

    console.log('Looking for temp file at:', normalizedTempPath);

    // Check if temp file exists
    if (!fs.existsSync(normalizedTempPath)) {
      // Try alternative path construction if first attempt fails
      const alternativePath = path.join(__dirname, '../../uploads/temp', fileName);
      console.log('First path failed, trying alternative:', alternativePath);
      
      if (!fs.existsSync(alternativePath)) {
        return res.status(404).json({
          success: false,
          message: 'Temp file not found. Please upload the receipt again.',
          debug: {
            searchedPaths: [normalizedTempPath, alternativePath],
            receivedPath: tempFilePath,
            fileName: fileName
          }
        });
      }
      normalizedTempPath = alternativePath;
    }

    // Validate subclass
    if (!expenseSubclasses.includes(subclass)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subclass. Allowed values: ${expenseSubclasses.join(', ')}`
      });
    }

    // Move file from temp to permanent uploads folder
    const uploadsDir = path.join(__dirname, '../../uploads/receipts');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const permanentFilePath = path.join(uploadsDir, fileName);
    
    try {
      fs.renameSync(normalizedTempPath, permanentFilePath);
      console.log('File moved successfully from temp to permanent location');
    } catch (moveError) {
      console.error('Error moving file:', moveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to move file to permanent location',
        error: moveError.message
      });
    }

    // Create transaction with user-confirmed data
    const transactionData = {
      userId: new mongoose.Types.ObjectId(userId),
      type: 'expense',
      subclass,
      amount: parseFloat(amount),
      description: description || `Receipt from ${merchant || 'Unknown Merchant'}`,
      date: new Date(date),
      paymentMethod,
      receiptData: {
        merchant: merchant || 'Unknown Merchant',
        originalFilename: originalName,
        uploadedFilename: fileName,
        fileSize: fileSize,
        filePath: permanentFilePath,
        processedAt: new Date(),
        userReviewed: true,
        extractedAt: new Date()
      }
    };

    // Create transaction in database
    const transaction = new Transaction(transactionData);
    const savedTransaction = await transaction.save();

    console.log('Receipt-based transaction confirmed and created:', savedTransaction._id);

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully from receipt data',
      data: {
        transaction: savedTransaction,
        receiptFile: {
          saved: true,
          path: permanentFilePath,
          fileName: fileName
        }
      }
    });

  } catch (error) {
    console.error('Error confirming receipt transaction:', error);

    // Clean up temp file on error (try multiple possible paths)
    if (req.body.tempFilePath) {
      const pathsToTry = [
        req.body.tempFilePath,
        path.resolve(__dirname, '../../', req.body.tempFilePath),
        path.join(__dirname, '../../uploads/temp', req.body.fileName)
      ];

      for (const pathToTry of pathsToTry) {
        if (fs.existsSync(pathToTry)) {
          try {
            fs.unlinkSync(pathToTry);
            console.log('Cleaned up temp file:', pathToTry);
            break;
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
        }
      }
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Transaction validation error',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while creating transaction',
      error: error.message
    });
  }
};

// Step 3: Reject processing and clean up temp file
const rejectReceiptProcessing = async (req, res) => {
  try {
    const { tempFilePath, fileName, reason } = req.body;

    // Validate required fields
    if (!tempFilePath) {
      return res.status(400).json({
        success: false,
        message: 'Temp file path is required'
      });
    }

    // Try multiple possible paths for the temp file
    const pathsToTry = [
      tempFilePath,
      path.resolve(__dirname, '../../', tempFilePath),
      path.join(__dirname, '../../uploads/temp', fileName)
    ];

    let fileDeleted = false;
    let deletedPath = '';

    for (const pathToTry of pathsToTry) {
      if (fs.existsSync(pathToTry)) {
        try {
          fs.unlinkSync(pathToTry);
          fileDeleted = true;
          deletedPath = pathToTry;
          console.log(`Temp file deleted: ${pathToTry}`);
          break;
        } catch (deleteError) {
          console.error(`Error deleting file at ${pathToTry}:`, deleteError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Receipt processing rejected successfully. Temp file has been removed.',
      data: {
        status: 'rejected',
        reason: reason || 'User rejected the extracted data',
        fileRemoved: fileDeleted,
        deletedPath: deletedPath || 'File not found',
        searchedPaths: pathsToTry
      }
    });

  } catch (error) {
    console.error('Error rejecting receipt processing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while rejecting processing',
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
  processReceiptOCR,
  confirmReceiptTransaction,
  rejectReceiptProcessing,
  getReceiptHistory
};
