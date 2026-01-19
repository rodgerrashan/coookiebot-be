// services/candleService.js
const Candle = require('../models/Candle');
const Bot = require('../models/Bot');


let candles = [];

function addCandle(candle) {
  candles.push(candle);
  if (candles.length > 50) {
    candles.shift(); // keep only last 50
  }
}


function getCandles() {
  return candles;
}



async function saveCandle(botId, newCandle) {
  // 1. Create and save the new candle to the Bot candles array

  const candle = new Candle({
    botId,
    symbol: newCandle.symbol,
    timeframe: newCandle.timeframe,
    timestamp: newCandle.timestamp,
    open: newCandle.open,
    high: newCandle.high,
    low: newCandle.low,
    close: newCandle.close,
    volume: newCandle.volume,
    raw: newCandle.raw,
  });

  const saved = await candle.save();

  // 2. Push to bot.candles and auto-keep only last 100
  const bot = await Bot.findByIdAndUpdate(
    botId,
    {
      $push: {
        candles: { $each: [saved._id], $slice: -100 }
      }
    },
    { new: true } // return updated bot with trimmed array
  ).lean();

  // 3. Delete candle documents not in the latest 100 list
  await Candle.deleteMany({
    botId,
    _id: { $nin: bot.candles }
  });

  return saved;
}
  
module.exports = { addCandle, getCandles , saveCandle};
