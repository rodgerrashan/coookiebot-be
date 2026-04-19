const mongoose = require('mongoose');

const activityEntrySchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
    },
    level: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
    },
    message: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const exchangeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    platform: {
        type: String,
        required: true,
        enum: ['Binance', 'Deriv'], 
    },
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    apiToken: {
        type: String,
        default: null,
    },
    apiKey: {
        type: String,
        default: null,
    },
    apiSecret: {
        type: String,
        default: null,
    },
    isTestnet: {
        type: Boolean,
        default: true,
    },
    status: {
        type: String,
        enum: ['Connected', 'Failed', 'unknown','Disconnected'],
        default: 'unknown',
    },
    statusCheckedAt: {
        type: Date,
    },
    permissions: {
        type: [String],
        default: ['read'],
    },
    lastError: {
        type: String,
        default: null,
    },
    activityLog: {
        type: [activityEntrySchema],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Exchange', exchangeSchema);
