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
    multiplier: { type: Number, default: 1 },
    marketType: { type: String, enum: ['spot', 'futures'], default: 'spot' },
    orderType: { type: String, enum: ['MARKET', 'LIMIT'], default: 'MARKET' },
    leverage: { type: Number, default: 1 },
    marginMode: { type: String, enum: ['CROSS', 'ISOLATED'], default: 'CROSS' },
    positionSide: { type: String, enum: ['LONG', 'SHORT', 'BOTH'], default: 'BOTH' },

    // Strategy
    tradingPair: { type: String, required: true },  // e.g. "R_100"
    timeframe: { type: String, required: true },     // e.g. "1m"
    strategy: { type: String, required: true },      // e.g. "martingale"
    botMode: { type: String, enum: ['Grid', 'Pattern Trading'], required: true },

    // Investment
    investment: { type: Number, required: true },    // Amount to trade

    // Risk Management (nested schema)
    // riskManagement: { type: RiskManagementSchema, required: true },

    // Operational
    cooldownPeriod: { type: Number, default: 0 },    // In seconds
    signalConflictMode: {
        type: String,
        enum: ['allow_parallel', 'close_opposite_then_open'],
        default: 'allow_parallel'
    },
    riskRewardRatio: {
        type: String,
        default: '1:2'
    },

    smartFeatures: {
        riskEngine: {
            enabled: { type: Boolean, default: false },
            autoPositionSizing: { type: Boolean, default: false },
            riskPerTradePercent: { type: Number, default: 1 },
            maxDailyLossPercent: { type: Number, default: 3 },
            stopAfterConsecutiveLosses: { type: Number, default: 3 }
        },
        marketDetection: {
            enabled: { type: Boolean, default: false },
            autoSwitch: { type: Boolean, default: false },
            switchCooldownCandles: { type: Number, default: 5 },
            trendStrategy: { type: String, default: 'TREND_FOLLOWING' },
            sidewaysStrategy: { type: String, default: 'GRID_RANGE' }
        },
        volatilityFilter: {
            enabled: { type: Boolean, default: false },
            atrPeriod: { type: Number, default: 14 },
            atrSpikeMultiplier: { type: Number, default: 2.5 }
        }
    },

    runtimeState: {
        currentRegime: {
            type: String,
            enum: ['TRENDING', 'SIDEWAYS', 'UNKNOWN'],
            default: 'UNKNOWN'
        },
        currentStrategy: { type: String, default: '' },
        tradingPaused: { type: Boolean, default: false },
        pauseReason: { type: String, default: '' },
        consecutiveLosses: { type: Number, default: 0 },
        dayPnLPercent: { type: Number, default: 0 },
        lastSwitchAt: { type: Date, default: null },
        lastPauseAt: { type: Date, default: null }
    },

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

