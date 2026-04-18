const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const { register, login, logout, me } = require('../controllers/authController');
const {
	sendVerifyOtp,
	verifyEmail,
	isAuthenticated,
	sendResetOtp,
	resetPassword,
	sendVerifyOtpChangingEmails,
	verifyOTPChangeEmail,
	updatePassword,
	updateProfile,
	updateNotificationPreferences,
	getActiveSessions,
	revokeSession,
	revokeOtherSessions,
	setupTwoFactor,
	verifyEnableTwoFactor,
	disableTwoFactor,
	suspendAccount,
	deleteAccount,
} = require('../controllers/authController');

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

// settings: profile, password, notifications
authRouter.patch('/profile', isAuthenticated, updateProfile);
authRouter.patch('/change-password', isAuthenticated, updatePassword);
authRouter.patch('/preferences/notifications', isAuthenticated, updateNotificationPreferences);

// settings: sessions
authRouter.get('/sessions', isAuthenticated, getActiveSessions);
authRouter.delete('/sessions/:sessionId', isAuthenticated, revokeSession);
authRouter.delete('/sessions', isAuthenticated, revokeOtherSessions);

// settings: two-factor authentication
authRouter.post('/2fa/setup', isAuthenticated, setupTwoFactor);
authRouter.post('/2fa/verify-enable', isAuthenticated, verifyEnableTwoFactor);
authRouter.post('/2fa/disable', isAuthenticated, disableTwoFactor);

// settings: account actions
authRouter.post('/suspend-account', isAuthenticated, suspendAccount);
authRouter.delete('/delete-account', isAuthenticated, deleteAccount);


module.exports = authRouter;