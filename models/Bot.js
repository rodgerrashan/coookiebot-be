const mongoose = require('mongoose');


const BotSchema = new mongoose.Schema({
    // user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // General bot info
    botName: { type: String, required: true, unique: true }, // e.g. "Smart Bot V1"
    exchange: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Exchange', required: true },
        platform: { type: String, required: true }, // e.g. "Deriv"
        name: { type: String }, // e.g. "My Deriv Account"
    },
    isTestMode: { type: Boolean, default: false },
    multiplier: { type: Number, required: true },

    // Strategy
    tradingPair: { type: String, required: true },  // e.g. "R_100"
    timeframe: { type: String, required: true },     // e.g. "1m"
    strategy: { type: String, required: true },      // e.g. "martingale"
    botMode: { type: String, enum: ['RSI', 'DCA', 'Grid', 'Orion', 'Pattern Trading'], required: true },

    // Investment
    investment: { type: Number, required: true },    // Amount to trade

    // Risk Management (nested schema)
    // riskManagement: { type: RiskManagementSchema, required: true },

    // Operational
    cooldownPeriod: { type: Number, default: 0 },    // In seconds

    // Status tracking
    status: {
        type: String,
        enum: ['created', 'active', 'paused', 'stopped', 'error'],
        default: 'created'
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    // All candles go with this bot should be linked to this bot

    candles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Candle' }],
    logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LogsBots' }],
    tradingMarkers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradingMarker' }],

}, { timestamps: true });

module.exports = mongoose.model('Bot', BotSchema);

