const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const transporter = require('../mail/mail.config');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { getSessionDetails } = require('../services/userServices');

const getCompiledHtml = require('../mail/mail-template.service').getCompiledHtml;



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
            // send user everything except password
            user: {
                id: user._id,
                userID: user.userID,
                name: user.name,
                email: user.email,
                isAccountVerified: user.isAccountVerified,
                profilePicture: user.profilePicture,
                theme: user.theme,
                language: user.language,
                notifications: user.notifications,
                settings: user.settings,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastSession: user.lastSession,


            }
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

        const user = new User({ email, password: hashedPassword, userID: userID, profilePicture: profilePicture, name: name, lastSession: sessionInfo });
        await user.save();


        // Generate JWT token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

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

        return res.json({ success: true });

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

            // if (!validUser.isAccountVerified) {
            //     return res.status(403).json({ success: false, message: 'Please verify your email before login' });
            // }

            if (validpassword) {
                const sessionInfo = getSessionDetails(req);
                logger.debug("sessionInfo", sessionInfo);

                // save in database
                validUser.lastSession = sessionInfo;
                validUser.save();

                const token = jwt.sign({ id: validUser._id }, process.env.JWT_SECRET, { expiresIn: '5h' });
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

        // Attach the user to the request object
        req.user = user;

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
module.exports = { register, login, logout, sendVerifyOtp, verifyEmail, sendResetOtp, resetPassword, isAuthenticated, me, sendVerifyOtpChangingEmails, verifyOTPChangeEmail };