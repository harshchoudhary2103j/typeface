const mongoose = require('mongoose');

// MongoDB connection configuration
const connectDB = async () => {
  try {
    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense_tracker';
    
    const conn = await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // // Initialize default data if needed
    // await initializeDefaultData();
    
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};




// Graceful shutdown
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};

module.exports = {
  connectDB,
  disconnectDB
};