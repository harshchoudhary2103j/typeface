const {Kafka} = require('kafkajs');
const config = require('../config/env');
const { sendMail } = require('./emailService');

class KafkaConsumer {
    constructor(groupId) {
        console.log(`Is Array: ${Array.isArray(config.kafkaBrokers)}`);
        console.log(`Kafka Brokers: ${config.kafkaBrokers}`);
        
        this.kafka = new Kafka({
            clientId: 'user-service',
            brokers: [config.kafkaBrokers]
        });

        this.consumer = this.kafka.consumer({
            groupId: groupId
        });
        console.log(`Kafka consumer created with group ID: ${groupId}`);
    }

    async connect() {
        try {
            console.log('Connecting to Kafka broker...');
            
            await this.consumer.connect();
            console.log('Connected to Kafka broker');
        } catch (error) {
            console.error('Error connecting to Kafka:', error);
            throw error;
        }
    }

    async subscribe(topic) {
        this.consumer.subscribe({
            topic: topic,
            fromBeginning: true
        });
    }

    async listenForNotifications(topic) {
        await this.subscribe(topic);
        await this.run(async ({ message }) => {
            try {
                console.log(`Received message: ${message.value.toString()}`);
                
                const { email, message: notificationMessage } = JSON.parse(message.value.toString());
                if (email && notificationMessage) {
                    await sendMail(email, 'Notification from Typeface', notificationMessage);
                    console.log(`Email sent to ${email}`);
                }
            } catch (error) {
                console.error('Error processing Kafka message or sending email:', error);
            }
        });
    }

    async run(handler) {
        await this.consumer.run({
            eachMessage: handler
        });
    }

   
    async disconnect() {
        try {
            await this.consumer.disconnect();
        } catch (error) {
            console.error('Error disconnecting from Kafka:', error);
            throw error;
        }
    }
}

module.exports = KafkaConsumer;