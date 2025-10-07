require('dotenv').config();
require('express-async-errors');

const express = require('express');
const app = express();

const notFoundMiddleware = require('./middleware/not-found');
const errorHandlerMiddleware = require('./middleware/error-handler');
const config = require('./config/env');
const KafkaConsumer = require('./services/KafkaConsumer');

app.use(express.json());

// routes
app.get('/', (req, res) => {
    res.send('<h1>Notification Service</h1>');
});


app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const start = async () => {
    try {
        const kafkaConsumer = new KafkaConsumer('notification-group');
        await kafkaConsumer.connect();
        console.log('Kafka consumer connected');
        
        await kafkaConsumer.listenForNotifications(config.kafkaTopic);
        console.log(`Listening for notifications on topic: ${config.kafkaTopic}`);

        const port = config.port;
        app.listen(port, () => {
            console.log(`Server is listening on port ${port}...`);
        });
    } catch (error) {
        console.log(error);
    }
};

start();

