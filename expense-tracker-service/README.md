# Expense Tracker Service

A microservice for managing financial transactions, income, and expense tracking with OCR receipt processing capabilities.

## Features

- ✅ **Transaction Management**: Create, read, update, delete income/expense entries
- ✅ **Smart Receipt Processing**: Upload receipts with automatic OCR extraction and transaction creation
- ✅ **Advanced Analytics**: Category analysis, timeline trends, and balance overview
- ✅ **Date Range Filtering**: List transactions within specific time periods
- ✅ **Data Validation**: Comprehensive input validation with Joi
- ✅ **File Upload**: Multer-based receipt image processing
- ✅ **Security**: Helmet security headers, CORS, rate limiting
- ✅ **Error Handling**: Centralized error handling middleware
- ✅ **Pagination**: Built-in pagination for large datasets

## Tech Stack

- **Framework**: Express.js (Node.js)
- **Database**: MongoDB with Mongoose ODM
- **OCR**: Google Gemini AI for receipt text extraction
- **File Upload**: Multer middleware
- **Validation**: Joi schema validation
- **Security**: Helmet, CORS, express-rate-limit
- **Environment**: dotenv for configuration

## API Endpoints

### 🏥 Health Check
- `GET /health` - Service health status and available routes

### 💰 Transactions
- `POST /api/transactions` - Create income/expense transaction
- `GET /api/transactions` - List transactions with filters and pagination
- `GET /api/transactions/subclasses` - Get available income/expense categories
- `GET /api/transactions/:id` - Get single transaction by ID
- `PUT /api/transactions/:id` - Update existing transaction
- `DELETE /api/transactions/:id` - Delete transaction

### 📊 Analytics
- `GET /api/analytics/category` - Expenses/income grouped by category
- `GET /api/analytics/timeline` - Financial data over time periods
- `GET /api/analytics/balance` - Overall financial summary and health indicators
- `GET /api/analytics/subclasses` - Get available categories for analytics

### 🧾 Receipt Processing
- `POST /api/receipts/process` - Upload receipt image and auto-create expense transaction
- `GET /api/receipts/history` - View receipt processing history

## Transaction Classification

### Income Categories (Sources of Income)
- **Employment**: salary, freelance, bonus, commission
- **Investments**: investment_returns, dividends, interest
- **Property**: rental_income
- **Business**: business_income
- **Benefits**: pension, grants, insurance_claims, tax_refunds
- **Other**: gifts_received, other_income

### Expense Categories (Expenditure Types)
- **Housing**: rent, mortgage, utilities, home_maintenance
- **Food**: food_dining, groceries
- **Transportation**: transportation, fuel
- **Entertainment**: entertainment, travel, gym_fitness, subscriptions
- **Shopping**: shopping, clothing
- **Health**: healthcare, personal_care
- **Financial**: insurance, investments, loans, taxes
- **Communication**: phone_internet
- **Education**: education
- **Giving**: charity_donations, gifts_given
- **Business**: business_expenses
- **Other**: other_expenses

## Database Schema

### Transaction Collection
```javascript
{
  userId: ObjectId (required),
  type: String ('income' | 'expense'),
  subclass: String, // Category based on type
  amount: Number (min: 0.01, max 2 decimal places),
  description: String (max: 500 chars),
  date: Date (required),
  paymentMethod: String, // Only for expense transactions
  receiptData: { // Optional, for OCR-processed receipts
    merchant: String,
    items: [{ name, qty, price, category }],
    ocrConfidence: String,
    extractedAt: Date,
    originalFilename: String,
    uploadedFilename: String,
    fileSize: Number,
    filePath: String,
    processedAt: Date
  },
  timestamps: true // createdAt, updatedAt
}
```

## Installation & Setup

### 1. Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- Python (for OCR processing)

### 2. Install Dependencies
```bash
# Clone repository
git clone <repository-url>
cd expense-tracker-service

# Install Node.js dependencies
npm install

# Install Python dependencies for OCR
pip install pillow pytesseract requests
```

### 3. Environment Configuration
Create `.env` file in the root directory:
```env
# Server Configuration
PORT=3002
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Database
MONGODB_URI=mongodb://localhost:27017/expense_tracker

# OCR Configuration (in src/utils/ocr_util/.env)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Setup OCR
Create `src/utils/ocr_util/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
OCR_TIMEOUT=30
GEMINI_MODEL=models/gemini-2.5-pro
```

### 5. Start the Service
```bash
# Development with auto-restart
npm run dev

# Production
npm start
```

## Usage Examples

### Create Income Transaction
```bash
curl -X POST http://localhost:3002/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "type": "income",
    "subclass": "salary",
    "amount": 5000.00,
    "description": "Monthly salary",
    "date": "2024-01-15"
  }'
```

### Create Expense Transaction
```bash
curl -X POST http://localhost:3002/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "type": "expense",
    "subclass": "food_dining",
    "amount": 25.99,
    "description": "Lunch at restaurant",
    "date": "2024-01-15",
    "paymentMethod": "credit_card"
  }'
```

### Process Receipt with OCR
```bash
curl -X POST http://localhost:3002/api/receipts/process \
  -F "userId=507f1f77bcf86cd799439011" \
  -F "receipt=@receipt.jpg"
```

### Get Transactions with Filters
```bash
curl "http://localhost:3002/api/transactions?userId=507f1f77bcf86cd799439011&type=expense&startDate=2024-01-01&endDate=2024-01-31&page=1&limit=10"
```

### Get Category Analytics
```bash
curl "http://localhost:3002/api/analytics/category?userId=507f1f77bcf86cd799439011&type=expense&startDate=2024-01-01&endDate=2024-01-31"
```

### Get Timeline Analytics
```bash
curl "http://localhost:3002/api/analytics/timeline?userId=507f1f77bcf86cd799439011&period=monthly&startDate=2024-01-01&endDate=2024-12-31"
```

## Key Features

### 🎯 **Smart Receipt Processing**
- Upload receipt images (JPG, PNG, PDF)
- Automatic OCR with Google Gemini AI
- Auto-categorization of expenses
- Merchant and item extraction
- Automatic transaction creation

### 📈 **Advanced Analytics**
- Category-wise spending analysis
- Timeline trends (daily/weekly/monthly/yearly)
- Financial health indicators
- Savings rate and expense ratio calculations
- Chart-ready data format

### 🔒 **Security & Validation**
- Input validation with Joi schemas
- File upload restrictions and validation
- Rate limiting (100 requests per 15 minutes)
- Security headers with Helmet
- CORS protection

### 💡 **Smart Business Logic**
- Income transactions don't require payment methods
- Expense transactions default to 'other' payment method
- Amount validation (2 decimal places max)
- Date-based filtering and sorting
- Automatic categorization fallbacks

## API Response Format

All API responses follow this consistent format:
```javascript
{
  "success": boolean,
  "message": string,
  "data": object, // Response data
  "pagination": object, // For paginated responses
  "errors": array // For validation errors
}
```

## Architecture

- **Controller-Centric**: Business logic in controllers for simplicity
- **Function-Based**: All controller functions are individual exports
- **Constants-Based**: Centralized category definitions
- **Middleware**: Validation, upload handling, error management
- **OCR Integration**: Python script integration for receipt processing

## File Structure
```
src/
├── controllers/          # Business logic
├── models/              # MongoDB schemas
├── routes/              # API endpoints
├── middleware/          # Validation, upload, error handling
├── constants/           # Category definitions
├── utils/ocr_util/      # OCR processing scripts
├── uploads/             # File upload storage
└── server.js           # Application entry point
```

## License

ISC