// import normalizeCandle from './normalizeCandle';
const normalizeCandle = require('./normalizeCandle');


function morningEveningStar(candles) {
    if (candles.length < 3) return null;

    const c2 = normalizeCandle(candles[candles.length - 3]);
    const c1 = normalizeCandle(candles[candles.length - 2]);  // star
    const c0 = normalizeCandle(candles[candles.length - 1]);

    const body = c => Math.abs(c.close - c.open);
    const firstBody = body(c2);
    const secondBody = body(c1);


    if (c2.close > c2.open &&
        secondBody < firstBody * 0.20 &&
        c1.high > c2.high && c1.high > c0.high &&
        c0.close < c0.open &&
        c0.close <= (c2.open + firstBody * 0.4)) {

        const entry = c0.close;
        const sl = c1.high;                    // EXACTLY like Pine
        const tp = entry - (sl - entry) * 3;


        return {
            signal: 'SELL',
            pattern: 'MESTR',
            entryPrice: parseFloat(entry.toFixed(5)),
            stopLoss: parseFloat(sl.toFixed(5)),
            takeProfit: parseFloat(tp.toFixed(5)),
            riskReward: '1:3',
            entryOnNextCandle: true
        };
    }

    // Morning Star
    if (c2.close < c2.open &&
        secondBody < firstBody * 0.20 &&
        c1.low < c2.low && c1.low < c0.low &&
        c0.close > c0.open &&
        c0.close >= (c2.open - firstBody * 0.4)) {

        const entry = c0.close;
        const sl = c1.low;                     // EXACTLY like Pine
        const tp = entry + (entry - sl) * 3;


        return {
            signal: 'BUY',
            pattern: 'MESTR',
            entryPrice: parseFloat(entry.toFixed(5)),
            stopLoss: parseFloat(sl.toFixed(5)),
            takeProfit: parseFloat(tp.toFixed(5)),
            riskReward: '1:3',
            entryOnNextCandle: true
        };
    }

    return null;
}




module.exports = morningEveningStar;