const mongoose = require('mongoose');

const CandleSchema = new mongoose.Schema({
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    symbol: { type: String, required: true },
    timeframe: { type: String, required: true },
    open_time: { type: String, required: true },
    data: { type: Object },
});

CandleSchema.index(
    { botId: 1, symbol: 1, timeframe: 1, open_time: 1 },
    { unique: true }
);

const Candle = mongoose.model('Candle', CandleSchema);


module.exports = Candle;
