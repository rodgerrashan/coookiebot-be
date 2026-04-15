
const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');


function bearishEngulfing(candles, options = {}) {
    if (!candles || candles.length < 2) return null;

    const rewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 2);

    const {
        minTrendCandles = 3,      // at least 3 green candles before
        requireStrongTrend = true, // all previous must be bullish
        minBodyRatio = 0.1,       // minimum body size to avoid tiny candles
        allowWickOverlap = false  // stricter: no upper wick overlap allowed?
    } = options;

    const prev = normalizeCandle(candles[candles.length - 2]);
    const curr = normalizeCandle(candles[candles.length - 1]);

    // Helper: candle body and direction
    const body = c => Math.abs(c.close - c.open);
    const isBullish = c => c.close > c.open;
    const isBearish = c => c.close < c.open;
    const upperWick = c => c.high - Math.max(c.open, c.close);
    const lowerWick = c => Math.min(c.open, c.close) - c.low;

    // 1. Previous candle must be bullish
    if (!isBullish(prev)) return null;

    // 2. Current candle must be bearish and fully engulf the previous body
    if (!isBearish(curr)) return null;
    if (curr.open <= prev.close && curr.close >= prev.open) return null; // not engulfing

    // Classic strict condition: current candle opens above prev close and closes below prev open
    const strictEngulfing = curr.open > prev.close && curr.close < prev.open;
    const relaxedEngulfing = curr.open >= prev.close && curr.close <= prev.open;

    if (!strictEngulfing && !relaxedEngulfing) return null;

    // Optional: stricter rule - no significant upper wick overlap
    if (!allowWickOverlap && curr.high > prev.high + (prev.high - prev.low) * 0.1) {
        // current high is much higher → weaker pattern
        // you can skip or downgrade confidence
    }

    // 3. Confirm prior uptrend (configurable strength)
    const lookback = candles.slice(-1 - minTrendCandles, -1);
    const uptrendCandles = lookback.filter(isBullish).length;
    const strongUptrend = uptrendCandles >= minTrendCandles - 1; // allow 1 neutral/red

    if (requireStrongTrend && uptrendCandles !== lookback.length) return null;
    if (!requireStrongTrend && uptrendCandles < lookback.length * 0.6) return null;

    // 4. Filter out tiny/insignificant candles
    const avgBody = candles.slice(-10).reduce((sum, c) => sum + body(c), 0) / 10;
    if (body(prev) < avgBody * minBodyRatio || body(curr) < avgBody * minBodyRatio) {
        return null; // too small to matter
    }

    // 5. Risk/Reward Calculation (more realistic)
    const entryPrice = curr.close;
    const stopLoss = Math.max(curr.high, prev.high) + (curr.high - curr.low) * 0.1; // buffer above pattern high
    const risk = stopLoss - entryPrice;
    const takeProfit = entryPrice - risk * rewardMultiplier;

    // Optional: ensure TP is reasonable (not too far in low volatility)
    const atr = calculateATR(candles.slice(-14)); // you should have an ATR function
    if (risk < atr * 0.5) return null; // too tight stop → noise

    return {
        signal: 'SELL',
        pattern: 'BRSHENG',
        confidence: strictEngulfing ? 'high' : 'medium',
        entryPrice: parseFloat(entryPrice.toFixed(5)),
        stopLoss: parseFloat(stopLoss.toFixed(5)),
        takeProfit: parseFloat(takeProfit.toFixed(5)),
        riskReward: formatRiskReward(rewardMultiplier),
        timestamp: curr.timestamp || new Date().toISOString(),
        details: {
            strictEngulfing,
            uptrendStrength: `${uptrendCandles}/${lookback.length}`,
            bodyEngulfed: true
        }
    };
}

// Simple ATR helper (14-period)
function calculateATR(candles) {
    if (candles.length < 14) return 0;
    let trSum = 0;
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i];
        const p = candles[i - 1];
        const tr = Math.max(
            c.high - c.low,
            Math.abs(c.high - p.close),
            Math.abs(c.low - p.close)
        );
        trSum += tr;
    }
    return trSum / Math.min(13, candles.length - 1);
}

module.exports = bearishEngulfing;