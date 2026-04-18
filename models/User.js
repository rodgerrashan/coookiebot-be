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
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    approvalRequestedAt: { type: Date, default: Date.now },
    resetOtp: { type: String, default: '' },
    resetOtpExpiredAt: { type: Number, default: 0 },
    profilePicture: { type: String, default: 'https://www.gravatar.com/avatar/?d=mp&s=200' },
    preferences: {
        theme: { type: String, default: 'light' },
        language: { type: String, default: 'en' },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            sms: { type: Boolean, default: false }
        }
    },
    settings: {
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, default: '' },
        twoFactorTempSecret: { type: String, default: '' }
    },
    lastSession: {
        ip: String,
        browser: String,
        os: String,
        device: String,
        lastLogin: { type: Date, default: Date.now }
    },
    activeSessions: [
        {
            sessionId: { type: String, required: true },
            ip: String,
            browser: String,
            os: String,
            device: String,
            lastLogin: { type: Date, default: Date.now }
        }
    ],
    accountStatus: {
        isSuspended: { type: Boolean, default: false },
        suspendedUntil: { type: Date, default: null }
    },
    willchangeEmail: { type: String },
    willchangeEmailOTP: { type: String },
    willchangeEmailOTPExpiredAt: { type: Number, default: 0 },

});

const User = model('User', userScheme);
export default User;
