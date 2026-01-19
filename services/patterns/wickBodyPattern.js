const normalizeCandle = require('./normalizeCandle');

/**
 * Fires whenever:
 * (upperShadow/body > 0.5) OR (lowerShadow/body > 0.5)
 * No trend checks, no direction checks.
 */
function wickBodyPattern(candles) {
    if (candles.length < 1) return null;

    const c = normalizeCandle(candles[candles.length - 1]);

    const body = Math.abs(c.close - c.open);

    // Avoid division by zero (do nothing if doji)
    if (body === 0) return null;

    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const upperShadow = c.high - Math.max(c.open, c.close);

    const lowerRatio = lowerShadow / body;
    const upperRatio = upperShadow / body;

    if (lowerRatio > 0.5 || upperRatio > 0.5) {
        return {
            signal: lowerRatio > upperRatio ? "BUY" : "SELL",
            entryPrice: c.close,
            stopLoss: lowerRatio > upperRatio ? c.low : c.high,
            takeProfit: lowerRatio > upperRatio
                ? c.close + (c.close - c.low)
                : c.close - (c.high - c.close),
            pattern: "WICK_BODY_0.5"
        };
    }

    return null;
}

module.exports = wickBodyPattern;
