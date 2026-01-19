const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const { register, login, logout, me } = require('../controllers/authController');
const { sendVerifyOtp, verifyEmail, isAuthenticated, sendResetOtp, resetPassword, sendVerifyOtpChangingEmails, verifyOTPChangeEmail } = require('../controllers/authController');

const authRouter = express.Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/logout', isAuthenticated, logout);
authRouter.post('/sendverifyotp', sendVerifyOtp);
authRouter.post('/verify-email', verifyEmail);

authRouter.get('/is-auth', isAuthenticated);

authRouter.post('/send-reset-password-otp', sendResetOtp);
authRouter.post('/reset-password', resetPassword);

// Protected route — USE MIDDLEWARE HERE
// authRouter.get('/me', isAuthenticated, me);
authRouter.get('/me', isAuthenticated, me);


// change emails
authRouter.post('/change-email', sendVerifyOtpChangingEmails);
authRouter.post('/change-email/verify', verifyOTPChangeEmail);


module.exports = authRouter;