const Joi = require('joi');

// Import subclasses from constants file
const { incomeSubclasses, expenseSubclasses } = require('../constants/transactionSubclasses');

// Custom validation for subclass based on type
const subclassValidation = (value, helpers) => {
  const type = helpers.state.ancestors[0].type;
  
  if (type === 'income' && !incomeSubclasses.includes(value)) {
    return helpers.error('any.invalid', { 
      message: `Invalid income subclass. Allowed values: ${incomeSubclasses.join(', ')}` 
    });
  }
  
  if (type === 'expense' && !expenseSubclasses.includes(value)) {
    return helpers.error('any.invalid', { 
      message: `Invalid expense subclass. Allowed values: ${expenseSubclasses.join(', ')}` 
    });
  }
  
  return value;
};

// Transaction validation schema
const transactionSchema = Joi.object({
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid user ID format'
  }),
  type: Joi.string().valid('income', 'expense').required(),
  subclass: Joi.string().custom(subclassValidation).required(),
  amount: Joi.number().positive().min(0.01).precision(2).required(),
  description: Joi.string().max(500).optional().allow('').trim(),
  date: Joi.date().required(),
  paymentMethod: Joi.when('type', {
    is: 'expense',
    then: Joi.string().valid('cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'check', 'other').default('other'),
    otherwise: Joi.forbidden().messages({
      'any.unknown': 'Payment method should not be specified for income transactions'
    })
  })
});

// Transaction update validation schema (all fields optional except type/subclass dependency)
const transactionUpdateSchema = Joi.object({
  type: Joi.string().valid('income', 'expense').optional(),
  subclass: Joi.string().custom(subclassValidation).optional(),
  amount: Joi.number().positive().min(0.01).precision(2).optional(),
  description: Joi.string().max(500).optional().allow('').trim(),
  date: Joi.date().optional(),
  paymentMethod: Joi.when('type', {
    is: 'expense',
    then: Joi.string().valid('cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'check', 'other').optional(),
    otherwise: Joi.forbidden().messages({
      'any.unknown': 'Payment method should not be specified for income transactions'
    })
  })
}).min(1); // At least one field must be provided

// Middleware functions
const validateTransaction = (req, res, next) => {
  const { error, value } = transactionSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  next();
};

const validateTransactionUpdate = (req, res, next) => {
  const { error, value } = transactionUpdateSchema.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }
  
  req.body = value;
  next();
};

// Generic validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.body = value;
    next();
  };
};

module.exports = {
  validateTransaction,
  validateTransactionUpdate,
  validate,
  transactionSchema,
  transactionUpdateSchema
};