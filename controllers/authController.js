const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { randomUUID } = require('crypto');
const User = require('../models/User').default;
const transporter = require('../mail/mail.config');
const { default: mongoose } = require('mongoose');
const logger = require('../utils/logger');
const { getSessionDetails } = require('../services/userServices');

const getCompiledHtml = require('../mail/mail-template.service').getCompiledHtml;
const isUserApproved = (user) => {
    if (!user?.approvalStatus) {
        return true;
    }

    return user.approvalStatus === 'approved';
};

const getPublicUserPayload = (user, currentSessionId = null) => {
    const sessions = Array.isArray(user.activeSessions) ? user.activeSessions : [];

    return {
        id: user._id,
        userID: user.userID,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        isAccountVerified: user.isAccountVerified,
        approvalStatus: user.approvalStatus || 'approved',
        isApproved: isUserApproved(user),
        approvedAt: user.approvedAt || null,
        rejectedAt: user.rejectedAt || null,
        rejectionReason: user.rejectionReason || '',
        profilePicture: user.profilePicture,
        preferences: {
            theme: user.preferences?.theme || 'light',
            language: user.preferences?.language || 'en',
            notifications: {
                email: user.preferences?.notifications?.email ?? true,
                push: user.preferences?.notifications?.push ?? true,
                sms: user.preferences?.notifications?.sms ?? false,
            }
        },
        settings: {
            twoFactorEnabled: !!user.settings?.twoFactorEnabled,
            twoFactorPendingSetup: !!user.settings?.twoFactorTempSecret,
        },
        accountStatus: {
            isSuspended: !!user.accountStatus?.isSuspended,
            suspendedUntil: user.accountStatus?.suspendedUntil || null,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSession: user.lastSession,
        activeSessions: sessions.map((session) => ({
            sessionId: session.sessionId,
            ip: session.ip,
            browser: session.browser,
            os: session.os,
            device: session.device,
            lastLogin: session.lastLogin,
            isCurrent: currentSessionId ? session.sessionId === currentSessionId : false,
        })),
    };
};



// get the real user details by jwt token
const getUserFromToken = async (req) => {

    try{
        const token = req.cookies.token;        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const existing_user = await User.findById(decoded.id);

        return existing_user;
        
    }catch(error){
        logger.error("Error in getUserFromToken:", error.message);
        return null;
    }
    
}




const me = async (req, res) => {
    try {
        // User is already attached by middleware — fetch fresh if needed, but select safe fields
        const user = await User.findById(req.user._id).select('-password -verifyOtp -resetOtp -resetOtpExpiredAt -verifyOtpExpireAt');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.json({
            success: true,
            user: getPublicUserPayload(user, req.sessionId),
        });
    } catch (error) {
        console.error('Error in /me endpoint:', error);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};



const register = async (req, res) => {

    logger.info(`[REGISTER ATTEMPT] ${req.body.email}`);

    const { email, password } = req.body;
    const sessionInfo = getSessionDetails(req);

    if (!email || !password) {
        return res.json({ success: false, message: 'Missing Details' })
    }

    // optional strength check
    if (password.length < 6) {
        return res.json({ success: false, message: "Password must be at least 6 characters long." });
    }

    try {
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.json({ success: false, message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // profile pic link 
        const profilePicture = `https://api.dicebear.com/7.x/initials/svg?seed=${email}`;

        const userID = `CBU${email.split('@')[0]}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        const name = email.split('@')[0];

        const sessionId = randomUUID();
        const activeSession = { sessionId, ...sessionInfo, lastLogin: new Date() };

        const user = new User({
            email,
            password: hashedPassword,
            userID: userID,
            profilePicture: profilePicture,
            name: name,
            role: 'user',
            approvalStatus: 'pending',
            approvalRequestedAt: new Date(),
            lastSession: sessionInfo,
            activeSessions: [activeSession],
        });
        await user.save();


        // Generate JWT token
        const token = jwt.sign({ id: user._id, sid: sessionId }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            // secure:false,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 1 * 24 * 60 * 60 * 1000
        })


        //sending welcome email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Welcome to Coookie-bot',
            // And replace {{name}} rom user.name
            html: getCompiledHtml('welcome', { email: user.email, name: user.name }),
        }

        await transporter.sendMail(mailOptions);

        return res.json({
            success: true,
            message: 'Registration complete. Verify your email and wait for admin approval before trading.',
        });

    } catch (error) {
        res.json({ success: false, message: error.message })
    }
}

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please enter all fields' })
        }

        const validUser = await User.findOne({ email });

        if (validUser) {
            const validpassword = await bcrypt.compare(password, validUser.password);

            if (!validUser.isAccountVerified) {
                return res.status(403).json({ success: false, message: 'Please verify your email before login' });
            }

            if (validpassword) {
                const sessionInfo = getSessionDetails(req);
                logger.debug("sessionInfo", sessionInfo);
                const sessionId = randomUUID();
                const newSession = { sessionId, ...sessionInfo, lastLogin: new Date() };

                // save in database
                validUser.lastSession = sessionInfo;
                validUser.activeSessions = [
                    ...(Array.isArray(validUser.activeSessions) ? validUser.activeSessions : []),
                    newSession,
                ].slice(-10);
                validUser.save();

                const token = jwt.sign({ id: validUser._id, sid: sessionId }, process.env.JWT_SECRET, { expiresIn: '5h' });
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                })

                return res.json({ success: true });

            }
            else {
                return res.status(401).json({ success: false, message: 'Check your credentials' });
            }
        }
        else {
            return res.status(404).json({ success: false, message: 'Check your credentials' });
        }
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

const logout = async (req, res) => {
    try {
        if (req.user && req.sessionId) {
            req.user.activeSessions = (req.user.activeSessions || []).filter(
                (session) => session.sessionId !== req.sessionId
            );
            await req.user.save();
        }

        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });

        return res.status(200).json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}

const sendVerifyOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });

        if (user.isAccountVerified) {
            return res.json({ success: false, message: "user already verified" });
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));

        user.verifyOtp = otp;
        user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;

        await user.save();

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Account Verification OTP',
            html: getCompiledHtml('verify-email', { otp: otp, email: user.email }) 
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: 'Verification OTP sent to the email' });

    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
}

//verify the email using otp
const verifyEmail = async (req, res) => {

    const { email, otp } = req.body;

    if (!otp) {
        return res.json({ success: false, message: 'Missing Details' });
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if (user.verifyOtp === '' || user.verifyOtp !== otp) {
            return res.json({ success: false, message: 'Invalid OTP' });
        }

        if (user.verifyOtpExpireAt < Date.now()) {
            return res.json({ success: false, message: 'OTP Expired' });
        }

        user.isAccountVerified = true;
        user.verifyOtp = '';
        user.verifyOtpExpireAt = 0;

        await user.save();

        return res.json({ success: true, message: 'Email verified successfully' });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}

//Send password reset Otp
const sendResetOtp = async (req, res) => {
    console.log('Send password reset OTP request received');
    const { email } = req.body;
    if (!email) {
        return res.json({ success: false, message: 'Email is required' })
    }
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User not found' })
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.resetOtp = otp;
        user.resetOtpExpiredAt = Date.now() + 15 * 60 * 1000;

        await user.save();

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Password Reset OTP',
            //text:`Your OTP for resting your password is ${otp}.
            //Use this OTP to proceed with resetting your password.`
            html: getCompiledHtml('reset-password', { otp: otp, email: user.email })
        };
        await transporter.sendMail(mailOptions);

        return res.json({ success: true, message: 'OTP send to your email' });

    } catch (error) {
        return res.json({ success: false, message: error.message })
    }
}

//Reset user password
const resetPassword = async (req, res) => {
    console.log('Reset password request received');
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.json({ success: false, message: 'Email,OTP and new password required' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if (user.resetOtp === "" || user.resetOtp !== otp) {
            return res.json({ success: false, message: 'Invalid OTP' });
        }

        if (user.resetOtpExpiredAt < Date.now()) {
            return res.json({ success: false, message: 'OTP expired' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password = hashedPassword;
        user.resetOtp = '';
        user.resetOtpExpiredAt = 0;

        await user.save();
        return res.json({ success: true, message: 'Password has been reset successfully' });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}


const isAuthenticated = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided. Please login.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (!user.isAccountVerified) {
            return res.status(403).json({ success: false, message: 'Please verify your email first.' });
        }

        if (user.accountStatus?.isSuspended) {
            const suspendedUntil = user.accountStatus?.suspendedUntil ? new Date(user.accountStatus.suspendedUntil) : null;

            if (suspendedUntil && suspendedUntil > new Date()) {
                return res.status(403).json({
                    success: false,
                    message: `Your account is suspended until ${suspendedUntil.toISOString()}`,
                });
            }

            user.accountStatus.isSuspended = false;
            user.accountStatus.suspendedUntil = null;
            await user.save();
        }

        const sessionId = decoded.sid || null;
        if (sessionId) {
            const hasActiveSession = (user.activeSessions || []).some(
                (session) => session.sessionId === sessionId
            );

            if (!hasActiveSession) {
                return res.status(401).json({ success: false, message: 'Session is no longer active. Please login again.' });
            }
        }

        // Attach the user to the request object
        req.user = user;
        req.sessionId = sessionId;

        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token has expired. Please login again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token. Please login again.' });
        }
        return res.status(500).json({ success: false, message: 'Server error during authentication.' });
    }
};



// Changing Emails
const sendVerifyOtpChangingEmails = async (req, res) => {
    const { email } = req.body;

    const existing_user = await  getUserFromToken(req);
    const existing_email = existing_user?.email;



    try {
        const user = await User.findOne({ email });

        if (user) {
            return res.json({ success: false, message: "This email has already linked to an account" });
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));

        existing_user.willchangeEmailOTP = otp;
        existing_user.willchangeEmailOTPExpiredAt = Date.now() + 24 * 60 * 60 * 1000;
        existing_user.willchangeEmail = email;

        await existing_user.save();

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Account Verification OTP',
            html: getCompiledHtml('change-email', { otp: otp, existing_email: existing_email, new_email: email })
        };


        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: 'Verification OTP sent to the email' });

    }
    catch (error) {
        logger.error("Error in changing emails", error.message);
        res.status(500).json({ success: false, message: error.message })
    }
}



//Verify OTP to change Email
const verifyOTPChangeEmail = async (req, res) => {
    const { otp, email } = req.body;

    const existing_user = await getUserFromToken(req);

    if (!otp) {
        return res.json({ success: false, message: 'OTP is required' }, 400);
    }

    try {
        const user = await User.findOne({ email });
        
        // if user is already available with that email, return error
        if (user) {
            console.log('Email already linked to another account');
            return res.json({ success: false, message: 'This email is already linked to another account' }, 400);
        }

        if (existing_user.willchangeEmailOTP === "" || existing_user.willchangeEmailOTP !== otp) {
            console.log('Invalid OTP provided for email change');
            return res.json({ success: false, message: 'Invalid OTP' }, 400);
        }

        if (existing_user.willchangeEmailOTPExpiredAt < Date.now()) {
            console.log('OTP expired for email change');
            return res.json({ success: false, message: 'OTP expired' }, 400);
        }

        const new_email = existing_user.willchangeEmail;

        existing_user.email = new_email;
        existing_user.willchangeEmail = '';
        existing_user.willchangeEmailOTP = '';
        existing_user.willchangeEmailOTPExpiredAt = 0;


        await existing_user.save();
        return res.json({ success: true, message: 'Email has been changed successfully' }, 200);

    } catch (error) {
        return res.json({ success: false, message: error.message }, 500);
    }
}

const updatePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    try {
        const user = await User.findById(req.user._id);
        const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);

        if (!isValidCurrentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.updatedAt = Date.now();
        await user.save();

        return res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateProfile = async (req, res) => {
    const { name, profilePicture } = req.body;

    try {
        const user = await User.findById(req.user._id);

        if (typeof name === 'string' && name.trim()) {
            user.name = name.trim().slice(0, 60);
        }

        if (typeof profilePicture === 'string' && profilePicture.trim()) {
            user.profilePicture = profilePicture.trim();
        }

        user.updatedAt = Date.now();
        await user.save();

        return res.json({
            success: true,
            message: 'Profile updated successfully.',
            user: getPublicUserPayload(user, req.sessionId),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const updateNotificationPreferences = async (req, res) => {
    const { email, push, sms } = req.body;

    try {
        const user = await User.findById(req.user._id);
        user.preferences = user.preferences || {};
        user.preferences.notifications = {
            email: typeof email === 'boolean' ? email : (user.preferences.notifications?.email ?? true),
            push: typeof push === 'boolean' ? push : (user.preferences.notifications?.push ?? true),
            sms: typeof sms === 'boolean' ? sms : (user.preferences.notifications?.sms ?? false),
        };
        user.updatedAt = Date.now();
        await user.save();

        return res.json({
            success: true,
            message: 'Notification settings updated.',
            notifications: user.preferences.notifications,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getActiveSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const sessions = (user.activeSessions || []).map((session) => ({
            sessionId: session.sessionId,
            ip: session.ip,
            browser: session.browser,
            os: session.os,
            device: session.device,
            lastLogin: session.lastLogin,
            isCurrent: req.sessionId ? session.sessionId === req.sessionId : false,
        }));

        return res.json({ success: true, sessions });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const revokeSession = async (req, res) => {
    const { sessionId } = req.params;

    try {
        const user = await User.findById(req.user._id);
        const hasSession = (user.activeSessions || []).some((session) => session.sessionId === sessionId);

        if (!hasSession) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        user.activeSessions = (user.activeSessions || []).filter((session) => session.sessionId !== sessionId);
        await user.save();

        if (req.sessionId && sessionId === req.sessionId) {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            });
        }

        return res.json({ success: true, message: 'Session revoked successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const revokeOtherSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const currentSessionId = req.sessionId || null;

        if (!currentSessionId) {
            user.activeSessions = [];
        } else {
            user.activeSessions = (user.activeSessions || []).filter(
                (session) => session.sessionId === currentSessionId
            );
        }

        await user.save();
        return res.json({ success: true, message: 'All other sessions revoked.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const setupTwoFactor = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const secret = speakeasy.generateSecret({ name: `Coookiebot (${user.email})` });

        user.settings = user.settings || {};
        user.settings.twoFactorTempSecret = secret.base32;
        await user.save();

        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(secret.otpauth_url)}`;

        return res.json({
            success: true,
            message: 'Two-factor setup initiated. Verify code to enable.',
            secretBase32: secret.base32,
            otpauthUrl: secret.otpauth_url,
            qrCodeUrl,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const verifyEnableTwoFactor = async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Verification code is required.' });
    }

    try {
        const user = await User.findById(req.user._id);
        const tempSecret = user.settings?.twoFactorTempSecret;

        if (!tempSecret) {
            return res.status(400).json({ success: false, message: '2FA setup is not initialized.' });
        }

        const verified = speakeasy.totp.verify({
            secret: tempSecret,
            encoding: 'base32',
            token: String(token),
            window: 1,
        });

        if (!verified) {
            return res.status(400).json({ success: false, message: 'Invalid authenticator code.' });
        }

        user.settings.twoFactorSecret = tempSecret;
        user.settings.twoFactorEnabled = true;
        user.settings.twoFactorTempSecret = '';
        await user.save();

        return res.json({ success: true, message: 'Two-factor authentication enabled successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const disableTwoFactor = async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Verification code is required.' });
    }

    try {
        const user = await User.findById(req.user._id);
        const secret = user.settings?.twoFactorSecret;

        if (!user.settings?.twoFactorEnabled || !secret) {
            return res.status(400).json({ success: false, message: 'Two-factor authentication is not enabled.' });
        }

        const verified = speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token: String(token),
            window: 1,
        });

        if (!verified) {
            return res.status(400).json({ success: false, message: 'Invalid authenticator code.' });
        }

        user.settings.twoFactorEnabled = false;
        user.settings.twoFactorSecret = '';
        user.settings.twoFactorTempSecret = '';
        await user.save();

        return res.json({ success: true, message: 'Two-factor authentication disabled.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const suspendAccount = async (req, res) => {
    const { months } = req.body;
    const parsedMonths = Number(months);

    if (!Number.isInteger(parsedMonths) || parsedMonths < 1 || parsedMonths > 36) {
        return res.status(400).json({ success: false, message: 'Suspension duration must be between 1 and 36 months.' });
    }

    try {
        const user = await User.findById(req.user._id);
        const suspendedUntil = new Date();
        suspendedUntil.setMonth(suspendedUntil.getMonth() + parsedMonths);

        user.accountStatus = user.accountStatus || {};
        user.accountStatus.isSuspended = true;
        user.accountStatus.suspendedUntil = suspendedUntil;
        user.activeSessions = [];

        await user.save();

        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });

        return res.json({ success: true, message: `Account suspended until ${suspendedUntil.toISOString()}.` });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteAccount = async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required to delete account.' });
    }

    try {
        const user = await User.findById(req.user._id);
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ success: false, message: 'Password is incorrect.' });
        }

        await User.deleteOne({ _id: user._id });

        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        });

        return res.json({ success: true, message: 'Account deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const requireAdmin = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    next();
};

const requireTradingApproval = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    if (!isUserApproved(req.user)) {
        return res.status(403).json({
            success: false,
            message: 'Account approval is pending. Trading is disabled until an admin approves your account.',
        });
    }

    next();
};

module.exports = {
    register,
    login,
    logout,
    sendVerifyOtp,
    verifyEmail,
    sendResetOtp,
    resetPassword,
    isAuthenticated,
    requireAdmin,
    requireTradingApproval,
    me,
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
};