const normalizeCandle = require('./normalizeCandle');

function trueRange(curr, prevClose) {
    return Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prevClose),
        Math.abs(curr.low - prevClose)
    );
}

function calculateAtrRma(candles, period) {
    if (!candles || candles.length < period + 1) return null;

    const normalized = candles.map(normalizeCandle);
    const trs = [];

    for (let i = 1; i < normalized.length; i++) {
        trs.push(trueRange(normalized[i], normalized[i - 1].close));
    }

    let atr = 0;
    for (let i = 0; i < period; i++) {
        atr += trs[i];
    }
    atr /= period;

    for (let i = period; i < trs.length; i++) {
        atr = ((atr * (period - 1)) + trs[i]) / period;
    }

    return atr;
}

function buildTrailingStop(closes, nLoss) {
    const trail = [];

    for (let i = 0; i < closes.length; i++) {
        const src = closes[i];

        if (i === 0) {
            trail.push(src + nLoss);
            continue;
        }

        const prevTrail = trail[i - 1];
        const prevSrc = closes[i - 1];

        if (src > prevTrail && prevSrc > prevTrail) {
            trail.push(Math.max(prevTrail, src - nLoss));
        } else if (src < prevTrail && prevSrc < prevTrail) {
            trail.push(Math.min(prevTrail, src + nLoss));
        } else if (src > prevTrail) {
            trail.push(src - nLoss);
        } else {
            trail.push(src + nLoss);
        }
    }

    return trail;
}

function didCrossover(seriesA, seriesB) {
    if (seriesA.length < 2 || seriesB.length < 2) return false;

    const prevA = seriesA[seriesA.length - 2];
    const currA = seriesA[seriesA.length - 1];
    const prevB = seriesB[seriesB.length - 2];
    const currB = seriesB[seriesB.length - 1];

    return prevA <= prevB && currA > currB;
}

function didCrossunder(seriesA, seriesB) {
    if (seriesA.length < 2 || seriesB.length < 2) return false;

    const prevA = seriesA[seriesA.length - 2];
    const currA = seriesA[seriesA.length - 1];
    const prevB = seriesB[seriesB.length - 2];
    const currB = seriesB[seriesB.length - 1];

    return prevA >= prevB && currA < currB;
}

function evaluateUtBotSignal(candles, atrPeriod, keyValue) {
    if (!candles || candles.length < Math.max(atrPeriod + 2, 3)) return null;

    const normalized = candles.map(normalizeCandle);
    const closes = normalized.map(c => c.close);

    const atr = calculateAtrRma(normalized, atrPeriod);
    if (!atr || !Number.isFinite(atr)) return null;

    const nLoss = keyValue * atr;
    const trailingStop = buildTrailingStop(closes, nLoss);

    const buy = didCrossover(closes, trailingStop);
    const sell = didCrossunder(closes, trailingStop);

    return { buy, sell, trailingStop };
}

/**
 * UT Bot pattern signal
 * Sell variant: key=2, ATR=1
 * Buy variant: key=2, ATR=300
 */
function utBotPattern(candles) {
    if (!candles || candles.length < 302) return null;

    const sellSetup = evaluateUtBotSignal(candles, 1, 2);
    const buySetup = evaluateUtBotSignal(candles, 300, 2);

    if (!sellSetup || !buySetup) return null;

    const last = normalizeCandle(candles[candles.length - 1]);
    const entryPrice = last.close;
    const range = Math.max(last.high - last.low, entryPrice * 0.001);

    if (sellSetup.sell) {
        const stopLoss = Math.max(last.high, sellSetup.trailingStop[sellSetup.trailingStop.length - 1]);
        const takeProfit = entryPrice - Math.max((stopLoss - entryPrice) * 2, range);

        return {
            signal: 'SELL',
            entryPrice: Number(entryPrice.toFixed(5)),
            stopLoss: Number(stopLoss.toFixed(5)),
            takeProfit: Number(takeProfit.toFixed(5)),
            pattern: 'UTBOT'
        };
    }

    if (buySetup.buy) {
        const stopLoss = Math.min(last.low, buySetup.trailingStop[buySetup.trailingStop.length - 1]);
        const takeProfit = entryPrice + Math.max((entryPrice - stopLoss) * 2, range);

        return {
            signal: 'BUY',
            entryPrice: Number(entryPrice.toFixed(5)),
            stopLoss: Number(stopLoss.toFixed(5)),
            takeProfit: Number(takeProfit.toFixed(5)),
            pattern: 'UTBOT'
        };
    }

    return null;
}

module.exports = utBotPattern;
