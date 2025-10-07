require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3002,
    kafkaBrokers: process.env.KAFKA_BROKERS_PROD,
    kafkaTopic: process.env.KAFKA_TOPIC || 'notification-messages',
    emailHost: process.env.EMAIL_HOST,
    emailPort: process.env.EMAIL_PORT,
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS,
}