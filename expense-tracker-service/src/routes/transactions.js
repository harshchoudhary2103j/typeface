const express = require('express');
const router = express.Router();
const {
  createTransaction,
  getTransactions,
  getSubclassOptions,
  getTransactionById,
  updateTransaction,
  deleteTransaction
} = require('../controllers/transactionController');
const { validateTransaction, validateTransactionUpdate } = require('../middleware/validation');
// const { paginate } = require('../middleware/pagination');

// Transaction CRUD endpoints
router.post('/', validateTransaction, createTransaction);
router.get('/', getTransactions); // Removed paginate middleware as it's handled internally
router.get('/subclasses', getSubclassOptions);
router.get('/:id', getTransactionById);
router.put('/:id', validateTransactionUpdate, updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;