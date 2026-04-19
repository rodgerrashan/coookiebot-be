// threeCandleReversal.js
// Exact Node.js clone of your Pine Script "3-Candle Pattern Detector with SL/TP (1:3 RR, Entry = 4th Candle Open)"

const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');

function threeCandleReversal(candles, options = {}) {
    // We need at least 3 completed candles + the current (4th) open
    if (!candles || candles.length < 4) return null;

    const bearishRewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 2);
    const bullishRewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 3);

    // Map candles: [3] = oldest, [0] = current (4th candle, entry)
    const c3 = normalizeCandle(candles[candles.length - 4]); // candle 1 (trend)
    const c2 = normalizeCandle(candles[candles.length - 3]); // candle 2 (reversal starter)
    const c1 = normalizeCandle(candles[candles.length - 2]); // candle 3 (confirmation)
    const c0 = normalizeCandle(candles[candles.length - 1]); // candle 4 → ENTRY at open

    const o1 = c3.open, h1 = c3.high, l1 = c3.low, c1_ = c3.close;
    const o2 = c2.open, h2 = c2.high, l2 = c2.low, c2_ = c2.close;
    const o3 = c1.open, h3 = c1.high, l3 = c1.low, c3_ = c1.close;
    const o4 = c0.open;  // <-- ENTRY PRICE

    const isBullish = (o, c) => c > o;
    const isBearish = (o, c) => c < o;

    // =======================================================
    // Bearish Reversal Pattern (Exact Pine Logic)
    // =======================================================
    const bearishPattern =
        isBullish(o1, c1_) &&                                   // 1st: bullish
        isBearish(o2, c2_) &&                                   // 2nd: bearish
        ((o2 >= c1_ && o2 <= h1) || o2 === c1_) &&              // 2nd opens inside or at close of 1st
        c2_ < o1 &&                                             // 2nd closes below 1st open
        h2 > h1 &&                                              // 2nd makes higher high
        isBearish(o3, c3_) &&                                   // 3rd: bearish
        c3_ < l2;                                               // 3rd closes below 2nd low

    if (bearishPattern) {
        const entry = o4;
        const sl = h2;
        const risk = sl - entry;
        const tp = entry - (risk * bearishRewardMultiplier);

        return {
            signal: 'SELL',
            pattern: 'Bearish 3-Candle Reversal',
            entryPrice: parseFloat(entry.toFixed(5)),
            stopLoss: parseFloat(sl.toFixed(5)),
            takeProfit: parseFloat(tp.toFixed(5)),
            riskReward: formatRiskReward(bearishRewardMultiplier),
            entryOnCandle: '4th open',
            timestamp: c0.timestamp || new Date().toISOString(),
            details: {
                patternCandles: [c3, c2, c1],
                entryCandleOpen: o4
            }
        };
    }

    // =======================================================
    // Bullish Reversal Pattern (Exact Pine Logic)
    // =======================================================
    const bullishPattern =
        isBearish(o1, c1_) &&                                   // 1st: bearish
        isBullish(o2, c2_) &&                                   // 2nd: bullish
        ((o2 >= l1 && o2 <= c1_) || o2 === c1_) &&              // 2nd opens inside or at close of 1st
        c2_ > o1 &&                                             // 2nd closes above 1st open
        l2 < l1 &&                                              // 2nd makes lower low
        isBullish(o3, c3_) &&                                   // 3rd: bullish
        c3_ > h2;                                               // 3rd closes above 2nd high

    if (bullishPattern) {
        const entry = o4;
        const sl = l2;
        const risk = entry - sl;
        const tp = entry + (risk * bullishRewardMultiplier);

        return {
            signal: 'BUY',
            pattern: '3VRVRSL',
            entryPrice: parseFloat(entry.toFixed(5)),
            stopLoss: parseFloat(sl.toFixed(5)),
            takeProfit: parseFloat(tp.toFixed(5)),
            riskReward: formatRiskReward(bullishRewardMultiplier),
            entryOnCandle: '4th open',
            timestamp: c0.timestamp || new Date().toISOString(),
            details: {
                patternCandles: [c3, c2, c1],
                entryCandleOpen: o4
            }
        };
    }

    return null;
}

module.exports = threeCandleReversal;