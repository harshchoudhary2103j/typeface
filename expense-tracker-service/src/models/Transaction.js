const mongoose = require('mongoose');
const { incomeSubclasses, expenseSubclasses } = require('../constants/transactionSubclasses');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'User ID is required'],
    index: true
  },
  
  // Main transaction type (Income or Expense)
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: ['income', 'expense'],
      message: 'Type must be either income or expense'
    }
  },
  
  // Subclass based on transaction type
  subclass: {
    type: String,
    required: [true, 'Transaction subclass is required'],
    validate: {
      validator: function(value) {
        if (this.type === 'income') {
          return incomeSubclasses.includes(value);
        } else if (this.type === 'expense') {
          return expenseSubclasses.includes(value);
        }
        return false;
      },
      message: function(props) {
        const allowedSubclasses = this.type === 'income' ? incomeSubclasses : expenseSubclasses;
        return `Invalid subclass '${props.value}' for type '${this.type}'. Allowed values: ${allowedSubclasses.join(', ')}`;
      }
    }
  },
  
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0'],
    validate: {
      validator: function(value) {
        return Number(value.toFixed(2)) === value;
      },
      message: 'Amount can have maximum 2 decimal places'
    }
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    index: true
  },
  
  // Payment method (only for expense transactions)
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'check', 'other'],
    validate: {
      validator: function(value) {
        // Payment method is only required for expense transactions
        if (this.type === 'expense') {
          return value && value.length > 0;
        }
        // For income transactions, payment method should not be set
        if (this.type === 'income') {
          return !value;
        }
        return true;
      },
      message: function(props) {
        if (this.type === 'expense') {
          return 'Payment method is required for expense transactions';
        }
        if (this.type === 'income') {
          return 'Payment method should not be specified for income transactions';
        }
        return 'Invalid payment method';
      }
    }
  },

  // Receipt data (for transactions created from receipt OCR)
  receiptData: {
    type: {
      merchant: String,
      items: [{
        name: String,
        qty: Number,
        price: Number,
        category: String
      }],
      ocrConfidence: String,
      extractedAt: Date,
      originalFilename: String,
      uploadedFilename: String,
      fileSize: Number,
      filePath: String,
      processedAt: Date
    },
    required: false
  },

  // Statement data (for transactions created from statement OCR)
  statementData: {
    type: {
      statementInfo: {
        accountNumber: String,
        period: String,
        openingBalance: Number,
        closingBalance: Number,
        totalTransactions: Number
      },
      balance: Number,
      originalFilename: String,
      uploadedFilename: String,
      fileSize: Number,
      filePath: String,
      processedAt: Date,
      userReviewed: Boolean,
      extractedAt: Date,
      transactionIndex: Number
    },
    required: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for human-readable subclass
transactionSchema.virtual('subclassLabel').get(function() {
  return this.subclass.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
});

// Pre-save middleware for data consistency
transactionSchema.pre('save', function(next) {
  // Ensure amount is rounded to 2 decimal places
  this.amount = Math.round(this.amount * 100) / 100;
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;