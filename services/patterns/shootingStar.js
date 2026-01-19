
const normalizeCandle = require('./normalizeCandle');

/**
 * Shooting Star candlestick (bearish reversal)
 * @param {Array} candles
 * @returns {Object|null} { signal, takeProfit, stopLoss, entryPrice, pattern } or null
 */
function shootingStar(candles) {
    if (!candles || candles.length < 5) return null;

    // --- Convert last candle safely into numbers ---
    const raw = normalizeCandle(candles[candles.length - 1]);
    const c = {
        open: Number(raw.open),
        close: Number(raw.close),
        high: Number(raw.high),
        low: Number(raw.low),
    };

    // Previous 3 candles for uptrend check
    const prevCandles = candles.slice(-4, -1).map(x => normalizeCandle(x));

    const uptrend = prevCandles.every(x => x.close > x.open);

    // Shadows and body
    const body = Math.abs(c.close - c.open);
    const upperShadow = c.high - Math.max(c.close, c.open);
    const lowerShadow = Math.min(c.close, c.open) - c.low;

    const isShootingStar =
        uptrend &&
        upperShadow >= body * 2 &&
        lowerShadow <= body;

    if (!isShootingStar) return null;

    // Prices (converted to numbers)
    const entryPrice = c.close;
    const stopLoss = c.high;
    const takeProfit = entryPrice - (stopLoss - entryPrice) * 2;

    return {
        signal: "SELL",
        entryPrice: Number(entryPrice.toFixed(5)),
        stopLoss: Number(stopLoss.toFixed(5)),
        takeProfit: Number(takeProfit.toFixed(5)),
        pattern: "SHTNGSTR"
    };
}

module.exports = shootingStar;
