// services/strategyService.js
const { getCandles } = require('./candleService');

// Example strategy: Buy if last 2 candles are green, Sell if last 2 are red
function analyzeStrategy() {
  const candles = getCandles();

  if (candles.length < 3) {
    return { signal: 'HOLD', reason: 'Not enough candles yet' };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const third = candles[candles.length - 3];

  // Example BUY: last 2 candles closed higher than opened
  if (prev.close > prev.open && last.close > last.open) {
    return { signal: 'BUY', reason: 'Last 2 candles are bullish' };
  }

  // Example SELL: last 2 candles closed lower than opened
  if (prev.close < prev.open && last.close < last.open) {
    return { signal: 'SELL', reason: 'Last 2 candles are bearish' };
  }

  // Example extra condition using 3rd candle
  if (third.close < third.open && prev.close > prev.open && last.close > last.open) {
    return { signal: 'BUY', reason: 'Reversal pattern detected' };
  }

  return { signal: 'HOLD', reason: 'No condition met' };
}

module.exports = { analyzeStrategy };
