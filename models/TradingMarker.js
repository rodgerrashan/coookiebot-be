const mongoose = require("mongoose");

const tradingMarkerSchema = new mongoose.Schema({
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    entryPrice: { type: Number, required: true },
    entryTime: { type: Number, required: true },
    takeProfitPrice: { type: Number, required: true },
    stopLossPrice: { type: Number, required: true },
    type: { type: String, required: true },
});

module.exports = mongoose.model("TradingMarker", tradingMarkerSchema);
