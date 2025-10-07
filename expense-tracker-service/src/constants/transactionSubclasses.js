// Income subclasses (sources of income)
const incomeSubclasses = [
  'salary',
  'freelance',
  'investment_returns',
  'rental_income',
  'business_income',
  'dividends',
  'interest',
  'bonus',
  'commission',
  'pension',
  'grants',
  'gifts_received',
  'insurance_claims',
  'tax_refunds',
  'other_income'
];

// Expense subclasses (expenditure categories)
const expenseSubclasses = [
  'food_dining',
  'groceries',
  'rent',
  'mortgage',
  'utilities',
  'transportation',
  'fuel',
  'entertainment',
  'shopping',
  'healthcare',
  'insurance',
  'education',
  'travel',
  'gym_fitness',
  'subscriptions',
  'phone_internet',
  'clothing',
  'personal_care',
  'home_maintenance',
  'investments',
  'loans',
  'taxes',
  'charity_donations',
  'gifts_given',
  'business_expenses',
  'other_expenses'
];

// Getter functions
const getIncomeSubclasses = () => incomeSubclasses;
const getExpenseSubclasses = () => expenseSubclasses;
const getAllSubclasses = () => ({
  income: incomeSubclasses,
  expense: expenseSubclasses
});

// Utility function to validate subclass against type
const validateSubclass = (type, subclass) => {
  if (type === 'income') {
    return incomeSubclasses.includes(subclass);
  } else if (type === 'expense') {
    return expenseSubclasses.includes(subclass);
  }
  return false;
};

// Utility function to format subclass for display
const formatSubclassLabel = (subclass) => {
  return subclass.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

module.exports = {
  incomeSubclasses,
  expenseSubclasses,
  getIncomeSubclasses,
  getExpenseSubclasses,
  getAllSubclasses,
  validateSubclass,
  formatSubclassLabel
};
