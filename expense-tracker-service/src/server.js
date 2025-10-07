require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import database
const { connectDB } = require('../config/database');

// Import routes
const transactionRoutes = require('./routes/transactions');
const analyticsRoutes = require('./routes/analytics');
const receiptRoutes = require('./routes/receipts');
const statementRoutes = require('./routes/statements');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { handleUploadError } = require('./middleware/upload');

const app = express();
const PORT = process.env.PORT || 3002;

// Rate limiting with environment variables
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Middleware setup
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(morgan(process.env.LOG_LEVEL || 'combined')); // Logging
app.use(limiter); // Rate limiting
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Expense Tracker Service is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    availableRoutes: {
      transactions: '/api/v1/transactions',
      analytics: '/api/v1/analytics',
      receipts: '/api/v1/receipts',
      statements: '/api/v1/statements'
    }
  });
});

// API routes
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/statements', statementRoutes);

// Handle upload errors
app.use(handleUploadError);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Initialize services and start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await connectDB();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ ${process.env.APP_NAME || 'Expense Tracker Service'} running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: MongoDB Connected`);
      console.log(`🔒 CORS Origins: ${process.env.ALLOWED_ORIGINS || 'http://localhost:3000'}`);
      console.log(`⏱️  Rate Limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} requests per ${(parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 60000} minutes`);
      console.log('Available Routes:');
      console.log('   GET  /api/v1/transactions - Get all transactions');
      console.log('   POST /api/v1/transactions - Create a new transaction');
      console.log('   GET  /api/v1/analytics/income-expense - Income vs Expense overview');
      console.log('   GET  /api/analytics/balance - Balance overview');
      console.log('   GET  /api/analytics/subclasses - Analytics subclasses');
      console.log('   POST /api/v1/receipts/process-ocr - Process receipt OCR for review');
      console.log('   POST /api/v1/receipts/confirm-transaction - Confirm and create transaction');
      console.log('   POST /api/v1/receipts/reject-processing - Reject processing and cleanup');
      console.log('   GET  /api/v1/receipts/history - Get receipt processing history');
      console.log('   POST /api/v1/statements/process-ocr - Process statement OCR for review');
      console.log('   POST /api/v1/statements/confirm-transactions - Confirm and create transactions');
      console.log('   POST /api/v1/statements/reject-processing - Reject processing and cleanup');
      console.log('   GET  /api/v1/statements/history - Get statement processing history');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});


startServer();

module.exports = app;