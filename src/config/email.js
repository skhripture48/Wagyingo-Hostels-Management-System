const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify the connection configuration
transporter.verify(function(error, success) {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

const sendVerificationEmail = async (email, token) => {
    try {
        // Create verification URL with /api prefix
        const verificationUrl = `${process.env.BASE_URL}/api/verify-email?token=${token}`;
        
        // Email options
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify Your Email - Hostel Booking System',
            html: `
                <h1>Welcome to the Hostel Booking System!</h1>
                <p>Thank you for registering. Please click the link below to verify your email address:</p>
                <p><a href="${verificationUrl}">Click here to verify your email</a></p>
                <p>This link will expire in 24 hours.</p>
                <p>If you did not create an account, please ignore this email.</p>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        return false;
    }
};

module.exports = {
    sendVerificationEmail
}; 