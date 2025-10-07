const nodemailer = require('nodemailer');
const config = require('../config/env');

const transporter = nodemailer.createTransport({
    host: config.emailHost,
    port: config.emailPort,
    secure: true, 
    auth: {
        user: config.emailUser,
        pass: config.emailPass,
    },
});

const sendMail = async (to, subject, htmlContent) => {
    try {
        const info = await transporter.sendMail({
            from: `"Typeface" <${config.emailUser}>`,
            to: to,
            subject: subject,
            html: htmlContent,
        });
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

module.exports = {
    sendMail,
};
