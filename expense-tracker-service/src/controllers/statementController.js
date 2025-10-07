const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { incomeSubclasses, expenseSubclasses } = require('../constants/transactionSubclasses');

// Helper function to run Python PDF OCR script
const runStatementOCRScript = (pdfPath) => {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, '../utils/ocr_util/gemini_statement_ocr.py');
    const pythonProcess = spawn('python', [pythonScriptPath, pdfPath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log stderr for debugging but don't reject
      console.log('Python stderr:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python statement OCR script failed with code ${code}: ${stderr}`));
        return;
      }

      // Clean up stdout - remove any non-JSON content
      let cleanedOutput = stdout.trim();
      
      // Find the first { and last } to extract JSON
      const firstBrace = cleanedOutput.indexOf('{');
      const lastBrace = cleanedOutput.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedOutput = cleanedOutput.substring(firstBrace, lastBrace + 1);
      }

      try {
        const result = JSON.parse(cleanedOutput);
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse OCR output:', parseError);
        console.error('Raw output:', stdout);
        console.error('Cleaned output:', cleanedOutput);
        reject(new Error(`Failed to parse statement OCR output: ${parseError.message}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python statement OCR process: ${error.message}`));
    });
  });
};

// Helper function to format statement OCR data for user review
const formatStatementForReview = (ocrData, userId, fileInfo) => {
  const transactions = (ocrData.transactions || []).map((tx, index) => {
    // Determine transaction type based on amount or description
    let type = 'expense'; // Default to expense
    let subclass = 'other_expenses';

    // Check if it's income based on keywords or positive amount context
    const description = (tx.description || '').toLowerCase();
    const incomeKeywords = ['salary', 'deposit', 'credit', 'income', 'refund', 'bonus', 'dividend'];
    
    if (tx.credit && parseFloat(tx.credit) > 0) {
      type = 'income';
      subclass = 'other_income';
      
      // Try to categorize income
      if (description.includes('salary') || description.includes('payroll')) {
        subclass = 'salary';
      } else if (description.includes('dividend')) {
        subclass = 'dividends';
      } else if (description.includes('interest')) {
        subclass = 'interest';
      } else if (description.includes('bonus')) {
        subclass = 'bonus';
      }
    } else if (tx.debit && parseFloat(tx.debit) > 0) {
      type = 'expense';
      
      // Try to categorize expense based on OCR suggestion or description
      if (tx.category && expenseSubclasses.includes(tx.category)) {
        subclass = tx.category;
      } else {
        // Fallback categorization based on description
        if (description.includes('grocery') || description.includes('walmart') || description.includes('target')) {
          subclass = 'groceries';
        } else if (description.includes('restaurant') || description.includes('food')) {
          subclass = 'food_dining';
        } else if (description.includes('gas') || description.includes('fuel')) {
          subclass = 'fuel';
        } else if (description.includes('rent')) {
          subclass = 'rent';
        } else if (description.includes('utility') || description.includes('electric')) {
          subclass = 'utilities';
        }
      }
    }

    return {
      id: `tx_${index}`,
      date: tx.date || new Date().toISOString().split('T')[0],
      description: tx.description || 'Unknown Transaction',
      amount: parseFloat(tx.debit || tx.credit || tx.amount || 0),
      type: type,
      subclass: subclass,
      paymentMethod: type === 'expense' ? 'bank_transfer' : undefined,
      balance: parseFloat(tx.balance || 0),
      confidence: tx.confidence || 'medium',
      originalData: tx
    };
  });

  return {
    statementInfo: {
      accountNumber: ocrData.accountNumber || 'Unknown',
      period: ocrData.period || 'Unknown',
      openingBalance: parseFloat(ocrData.openingBalance || 0),
      closingBalance: parseFloat(ocrData.closingBalance || 0),
      totalTransactions: transactions.length
    },
    transactions: transactions,
    fileInfo: {
      filename: fileInfo.filename,
      originalName: fileInfo.originalname,
      size: fileInfo.size,
      path: fileInfo.path
    },
    processingResults: {
      successCount: transactions.length,
      incomeCount: transactions.filter(tx => tx.type === 'income').length,
      expenseCount: transactions.filter(tx => tx.type === 'expense').length
    }
  };
};

// Step 1: Process statement PDF with OCR and return for user review
const processStatementOCR = async (req, res) => {
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
        message: 'No statement file uploaded'
      });
    }

    const tempFilePath = req.file.path;
    console.log(`Processing statement OCR for: ${req.file.filename}`);

    // Run OCR processing
    const ocrResult = await runStatementOCRScript(tempFilePath);
    console.log('Statement OCR Result:', JSON.stringify(ocrResult, null, 2));

    // Format data for user review
    const reviewData = formatStatementForReview(ocrResult, userId, req.file);

    res.status(200).json({
      success: true,
      message: 'Statement processed successfully. Please review the extracted transactions.',
      data: {
        extractedData: reviewData,
        availableSubclasses: {
          income: incomeSubclasses,
          expense: expenseSubclasses
        },
        instructions: {
          next_steps: [
            'Review the extracted transactions above',
            'Edit transaction details, types, and categories as needed',
            'Call /confirm-transactions to create all transactions',
            'Call /reject-processing if you want to cancel'
          ]
        }
      }
    });

  } catch (error) {
    console.error('Error processing statement OCR:', error);

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
        message: 'Statement OCR processing failed',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during statement OCR processing',
      error: error.message
    });
  }
};

// Step 2: Confirm and create multiple transactions from statement
const confirmStatementTransactions = async (req, res) => {
  try {
    const {
      userId,
      transactions,
      statementInfo,
      tempFilePath,
      fileName,
      originalName,
      fileSize
    } = req.body;

    // Validate required fields
    if (!userId || !transactions || !Array.isArray(transactions) || !tempFilePath) {
      return res.status(400).json({
        success: false,
        message: 'User ID, transactions array, and temp file path are required'
      });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Normalize the temp file path
    let normalizedTempPath = tempFilePath;
    if (path.isAbsolute(tempFilePath)) {
      normalizedTempPath = tempFilePath;
    } else {
      normalizedTempPath = path.resolve(__dirname, '../../', tempFilePath);
    }

    // Check if temp file exists
    if (!fs.existsSync(normalizedTempPath)) {
      const alternativePath = path.join(__dirname, '../../uploads/temp', fileName);
      if (!fs.existsSync(alternativePath)) {
        return res.status(404).json({
          success: false,
          message: 'Temp file not found. Please upload the statement again.'
        });
      }
      normalizedTempPath = alternativePath;
    }

    // Move file from temp to permanent uploads folder
    const uploadsDir = path.join(__dirname, '../../uploads/statements');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const permanentFilePath = path.join(uploadsDir, fileName);
    fs.renameSync(normalizedTempPath, permanentFilePath);

    // Process and validate each transaction
    const validationErrors = [];
    const processedTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      // Validate transaction fields
      if (!tx.type || !['income', 'expense'].includes(tx.type)) {
        validationErrors.push(`Transaction ${i + 1}: Invalid type`);
        continue;
      }

      const allowedSubclasses = tx.type === 'income' ? incomeSubclasses : expenseSubclasses;
      if (!tx.subclass || !allowedSubclasses.includes(tx.subclass)) {
        validationErrors.push(`Transaction ${i + 1}: Invalid subclass for ${tx.type}`);
        continue;
      }

      if (!tx.amount || parseFloat(tx.amount) <= 0) {
        validationErrors.push(`Transaction ${i + 1}: Invalid amount`);
        continue;
      }

      // Create transaction data
      const transactionData = {
        userId: new mongoose.Types.ObjectId(userId),
        type: tx.type,
        subclass: tx.subclass,
        amount: parseFloat(tx.amount),
        description: tx.description || 'Statement transaction',
        date: new Date(tx.date),
        paymentMethod: tx.type === 'expense' ? (tx.paymentMethod || 'bank_transfer') : undefined,
        statementData: {
          statementInfo: statementInfo,
          balance: tx.balance,
          originalFilename: originalName,
          uploadedFilename: fileName,
          fileSize: fileSize,
          filePath: permanentFilePath,
          processedAt: new Date(),
          userReviewed: true,
          extractedAt: new Date(),
          transactionIndex: i
        }
      };

      processedTransactions.push(transactionData);
    }

    // Return validation errors if any
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Transaction validation errors',
        errors: validationErrors
      });
    }

    // Create all transactions in database
    const savedTransactions = await Transaction.insertMany(processedTransactions);

    console.log(`Statement-based transactions created: ${savedTransactions.length}`);

    res.status(201).json({
      success: true,
      message: `Successfully created ${savedTransactions.length} transactions from statement`,
      data: {
        transactions: savedTransactions,
        summary: {
          totalCreated: savedTransactions.length,
          incomeTransactions: savedTransactions.filter(tx => tx.type === 'income').length,
          expenseTransactions: savedTransactions.filter(tx => tx.type === 'expense').length,
          totalAmount: savedTransactions.reduce((sum, tx) => {
            return sum + (tx.type === 'income' ? tx.amount : -tx.amount);
          }, 0)
        },
        statementFile: {
          saved: true,
          path: permanentFilePath,
          fileName: fileName
        }
      }
    });

  } catch (error) {
    console.error('Error confirming statement transactions:', error);

    // Clean up temp file on error
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
            break;
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
        }
      }
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while creating transactions',
      error: error.message
    });
  }
};

// Step 3: Reject statement processing and clean up temp file
const rejectStatementProcessing = async (req, res) => {
  try {
    const { tempFilePath, fileName, reason } = req.body;

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
          console.log(`Statement temp file deleted: ${pathToTry}`);
          break;
        } catch (deleteError) {
          console.error(`Error deleting statement file at ${pathToTry}:`, deleteError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Statement processing rejected successfully. Temp file has been removed.',
      data: {
        status: 'rejected',
        reason: reason || 'User rejected the extracted statement data',
        fileRemoved: fileDeleted,
        deletedPath: deletedPath || 'File not found'
      }
    });

  } catch (error) {
    console.error('Error rejecting statement processing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while rejecting processing',
      error: error.message
    });
  }
};

// Get statement processing history
const getStatementHistory = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Find transactions that have statement data
    const [transactions, totalCount] = await Promise.all([
      Transaction.find({
        userId: new mongoose.Types.ObjectId(userId),
        statementData: { $exists: true }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        statementData: { $exists: true }
      })
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Statement history retrieved successfully',
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
    console.error('Error fetching statement history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  processStatementOCR,
  confirmStatementTransactions,
  rejectStatementProcessing,
  getStatementHistory
};
