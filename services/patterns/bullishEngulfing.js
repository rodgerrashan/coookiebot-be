
const normalizeCandle = require('./normalizeCandle');



/**
 * Bullish Engulfing pattern
 * @param {Array} candles - array of recent candles
 * @returns {Object|null} { signal, takeProfit, stopLoss } or null if no pattern
 */
function bullishEngulfing(candles) {
    if (candles.length < 4) return null;

    const prev = normalizeCandle(candles[candles.length - 2]);
    const curr = normalizeCandle(candles[candles.length - 1]);

    // Check previous trend (downtrend)
    const lastFew = candles.slice(-4, -1);
    const downtrend = lastFew.every(x => x.close < x.open);
    if (!downtrend) return null;

    // Check engulfing structure
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.close > prev.open && curr.open < prev.close) {

        const entryPrice = curr.close;
        const stopLoss = curr.low; // safer stop below candle low
        const takeProfit = entryPrice + (entryPrice - stopLoss) * 2; // 2:1 RR

        return {
            signal: 'BUY',
            takeProfit: parseFloat(takeProfit.toFixed(5)),
            stopLoss: parseFloat(stopLoss.toFixed(5)),
            entryPrice: parseFloat(entryPrice.toFixed(5)),
            pattern: 'BRSHENG'
        };
    }

    return null;
}

module.exports = bullishEngulfing;
