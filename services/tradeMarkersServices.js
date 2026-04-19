const mongoose = require("mongoose");
const Bot = require("../models/Bot");
const TradeMarker = require("../models/TradingMarker");

// create trade marker
const createTradeMarker = async (
    botId,
    entryPrice,
    entryTime,
    takeProfitPrice,
    stopLossPrice,
    type,
    options = {}
) => {
    try {
        const tradeMarker = new TradeMarker({
            botId,
            entryPrice,
            entryTime,
            takeProfitPrice,
            stopLossPrice,
            type,
            strategy: options.strategy || '',
            marketRegime: options.marketRegime || 'UNKNOWN',
        });
        await tradeMarker.save();
        return tradeMarker;
    } catch (error) {
        console.error("Error creating trade marker:", error);
        throw error;
    }
};


module.exports = { createTradeMarker };




