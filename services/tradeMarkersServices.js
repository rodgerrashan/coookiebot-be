const mongoose = require("mongoose");
const Bot = require("../models/Bot");
const TradeMarker = require("../models/TradingMarker");

// create trade marker
const createTradeMarker = async (botId, entryPrice, entryTime, takeProfitPrice, stopLossPrice, type) => {
    try {
        const tradeMarker = new TradeMarker({
            botId,
            entryPrice,
            entryTime,
            takeProfitPrice,
            stopLossPrice,
            type,
        });
        await tradeMarker.save();
        return tradeMarker;
    } catch (error) {
        console.error("Error creating trade marker:", error);
        throw error;
    }
};


module.exports = { createTradeMarker };




