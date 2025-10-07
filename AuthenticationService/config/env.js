require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    db: {
        localUri: process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker',
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        lifetime: process.env.JWT_LIFETIME,
    }
}