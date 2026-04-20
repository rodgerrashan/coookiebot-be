const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');

/**
 * Fires whenever:
 * (upperShadow/body > 0.5) OR (lowerShadow/body > 0.5)
 * No trend checks, no direction checks.
 */
function wickBodyPattern(candles, options = {}) {
    if (candles.length < 1) return null;

    const rewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 1);

    const c = normalizeCandle(candles[candles.length - 1]);

    const body = Math.abs(c.close - c.open);

    // Avoid division by zero (do nothing if doji)
    if (body === 0) return null;

    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const upperShadow = c.high - Math.max(c.open, c.close);

    const lowerRatio = lowerShadow / body;
    const upperRatio = upperShadow / body;

    if (lowerRatio > 0.5 || upperRatio > 0.5) {
        const isBuy = lowerRatio > upperRatio;
        const stopLoss = isBuy ? c.low : c.high;
        const riskDistance = Math.abs(c.close - stopLoss);
        const takeProfit = isBuy
            ? c.close + (riskDistance * rewardMultiplier)
            : c.close - (riskDistance * rewardMultiplier);

        return {
            signal: isBuy ? "BUY" : "SELL",
            entryPrice: c.close,
            stopLoss,
            takeProfit: Number(takeProfit.toFixed(5)),
            riskReward: formatRiskReward(rewardMultiplier),
            pattern: "WICK_BODY_0.5"
        };
    }

    return null;
}

module.exports = wickBodyPattern;
