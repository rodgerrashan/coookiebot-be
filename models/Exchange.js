const mongoose = require('mongoose');

const exchangeSchema = new mongoose.Schema({
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
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Exchange', exchangeSchema);
