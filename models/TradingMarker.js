const mongoose = require("mongoose");

const tradingMarkerSchema = new mongoose.Schema({
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    entryPrice: { type: Number, required: true },
    entryTime: { type: Number, required: true },
    takeProfitPrice: { type: Number, required: true },
    stopLossPrice: { type: Number, required: true },
    type: { type: String, required: true },
    strategy: { type: String, default: '' },
    marketRegime: {
        type: String,
        enum: ['TRENDING', 'SIDEWAYS', 'UNKNOWN'],
        default: 'UNKNOWN'
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    },
    exitPrice: { type: Number, default: null },
    exitTime: { type: Number, default: null },
    exitReason: { type: String, default: '' },
    realizedPnL: { type: Number, default: 0 },
    pnlPercent: { type: Number, default: 0 },
}, { timestamps: true });

tradingMarkerSchema.index({ botId: 1, status: 1, entryTime: -1 });
tradingMarkerSchema.index({ botId: 1, createdAt: -1 });

module.exports = mongoose.model("TradingMarker", tradingMarkerSchema);
