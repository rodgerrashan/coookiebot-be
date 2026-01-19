import { Schema, model } from 'mongoose';

const userScheme = new Schema({
    userID: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    verifyOtp: { type: String, default: '' },
    verifyOtpExpireAt: { type: Number, default: 0 },
    isAccountVerified: { type: Boolean, default: false },
    resetOtp: { type: String, default: '' },
    resetOtpExpiredAt: { type: Number, default: 0 },
    profilePicture: { type: String, default: 'https://www.gravatar.com/avatar/?d=mp&s=200' },
    preferences: {
        theme: { type: String, default: 'light' },
        language: { type: String, default: 'en' },
        notifications: { type: Boolean, default: true }
    },
    settings: {
        twoFactorEnabled: { type: Boolean, default: false }
    },
    lastSession: {
        ip: String,
        browser: String,
        os: String,
        device: String,
        lastLogin: { type: Date, default: Date.now }
    },
    willchangeEmail: { type: String },
    willchangeEmailOTP: { type: String },
    willchangeEmailOTPExpiredAt: { type: Number, default: 0 },

});

const User = model('User', userScheme);
export default User;
