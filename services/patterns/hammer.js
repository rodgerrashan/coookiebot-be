const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');

/**
 * Hammer candlestick (bullish reversal)
 * @param {Array} candles
 * @returns {Object|null} { signal, takeProfit, stopLoss } or null
 */
function hammer(candles, options = {}) {
    if (candles.length < 4) return null;

    const rewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 2);

    const c = normalizeCandle(candles[candles.length - 1]);

    const prevCandles = candles.slice(-4, -1);
    const downtrend = prevCandles.every(x => x.close < x.open);

    const body = Math.abs(c.close - c.open);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const upperShadow = c.high - Math.max(c.open, c.close);

    // ensure non-tiny range
    const range = c.high - c.low;
    if (range === 0 || body / range > 0.5) return null;

    if (downtrend && lowerShadow >= 2 * body && upperShadow <= body) {
        const entryPrice = c.close;
        const stopLoss = c.low;
        const takeProfit = entryPrice + (entryPrice - stopLoss) * rewardMultiplier;

        return {
            signal: 'BUY',
            takeProfit: parseFloat(takeProfit.toFixed(5)),
            stopLoss: parseFloat(stopLoss.toFixed(5)),
            entryPrice: parseFloat(entryPrice.toFixed(5)),
            riskReward: formatRiskReward(rewardMultiplier),
            pattern: 'HMMR'
        };
    }

    return null;
}

module.exports = hammer;
