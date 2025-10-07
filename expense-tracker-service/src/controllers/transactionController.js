const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const { getAllSubclasses } = require('../constants/transactionSubclasses');

// Helper function to build query filters
const buildQueryFilters = (userId, filters = {}) => {
  const query = { userId };
  
  if (filters.type) query.type = filters.type;
  if (filters.subclass) query.subclass = filters.subclass;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  
  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = new Date(filters.startDate);
    if (filters.endDate) query.date.$lte = new Date(filters.endDate);
  }
  
  return query;
};

// Create a new transaction (income/expense entry)
const createTransaction = async (req, res) => {
  try {
    // Handle payment method logic based on transaction type
    if (req.body.type === 'income') {
      // For income transactions, remove paymentMethod if provided
      delete req.body.paymentMethod;
    } else if (req.body.type === 'expense') {
      // For expense transactions, set default payment method if not provided
      if (!req.body.paymentMethod) {
        req.body.paymentMethod = 'other';
      }
    }

    const transaction = new Transaction(req.body);
    const savedTransaction = await transaction.save();
    
    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: savedTransaction
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all transactions with filtering and pagination (list income/expenses in time range)
const getTransactions = async (req, res) => {
  try {
    const { 
      userId, 
      type, 
      subclass, 
      startDate, 
      endDate, 
      paymentMethod,
      page = 1, 
      limit = 10 
    } = req.query;

    // Validate userId if provided
    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const filters = {};
    if (type) filters.type = type;
    if (subclass) filters.subclass = subclass;
    if (paymentMethod) filters.paymentMethod = paymentMethod;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Build query and pagination
    const query = buildQueryFilters(userId, filters);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [transactions, totalCount] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Transactions retrieved successfully',
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
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID format'
      });
    }

    const transaction = await Transaction.findById(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction retrieved successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update transaction
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID format'
      });
    }

    // Handle payment method logic for updates
    if (req.body.type === 'income') {
      // For income transactions, remove paymentMethod if provided
      delete req.body.paymentMethod;
    } else if (req.body.type === 'expense' && req.body.paymentMethod === undefined) {
      // For expense transactions, ensure payment method exists
      const existingTransaction = await Transaction.findById(id);
      if (existingTransaction && !existingTransaction.paymentMethod) {
        req.body.paymentMethod = 'other';
      }
    }

    const transaction = await Transaction.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction updated successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete transaction
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID format'
      });
    }

    const transaction = await Transaction.findByIdAndDelete(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction deleted successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get subclass options for forms
const getSubclassOptions = async (req, res) => {
  try {
    const subclasses = getAllSubclasses();
    
    res.status(200).json({
      success: true,
      message: 'Subclass options retrieved successfully',
      data: subclasses
    });
  } catch (error) {
    console.error('Error fetching subclass options:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getSubclassOptions
};

