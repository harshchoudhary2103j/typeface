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

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { handleUploadError } = require('./middleware/upload');

const app = express();
const PORT = process.env.PORT || 3002;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Middleware setup
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(morgan('combined')); // Logging
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
    availableRoutes: {
      transactions: '/api/transactions',
      analytics: '/api/analytics',
      receipts: '/api/receipts'
    }
  });
});

// API routes
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/receipts', receiptRoutes);

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
        console.log(`Expense Tracker Service running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

  } catch (error) {
    console.error(' Failed to start server:', error);
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