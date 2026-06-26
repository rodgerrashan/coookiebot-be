const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');


/**
 * HA EMA Re-Entry Strategy
 *
 * @param {Array} candles
 * @returns {Object|null}
 */
function haEmaReEntry(candles, options = {}) {

    if (!candles || candles.length < 35) return null;


    const rewardMultiplier = resolveRewardMultiplier(
        options.riskRewardRatio,
        2
    );


    // Convert candles
    const data = candles.map(c => {
        const x = normalizeCandle(c);

        return {
            open: Number(x.open),
            high: Number(x.high),
            low: Number(x.low),
            close: Number(x.close)
        };
    });



    // ===== Heikin Ashi =====
    const ha = [];

    for (let i = 0; i < data.length; i++) {

        const c = data[i];

        const haClose =
            (c.open + c.high + c.low + c.close) / 4;


        const haOpen =
            i === 0
                ? (c.open + c.close) / 2
                : (ha[i-1].open + ha[i-1].close) / 2;


        const haHigh =
            Math.max(c.high, haOpen, haClose);


        const haLow =
            Math.min(c.low, haOpen, haClose);


        ha.push({
            open: haOpen,
            high: haHigh,
            low: haLow,
            close: haClose
        });
    }



    // ===== EMA 32 High / Low =====
    const length = 32;
    const alpha = 2 / (length + 1);


    let emaHigh = null;
    let emaLow = null;


    const ema = ha.map(c => {

        emaHigh =
            emaHigh === null
                ? c.high
                : alpha * c.high + (1 - alpha) * emaHigh;


        emaLow =
            emaLow === null
                ? c.low
                : alpha * c.low + (1 - alpha) * emaLow;


        return {
            emaHigh,
            emaLow
        };
    });



    const last = ha.at(-1);
    const lastEma = ema.at(-1);



    // ===== Entry Conditions =====
    const longCondition =
        last.close > lastEma.emaHigh;


    const shortCondition =
        last.close < lastEma.emaLow;



    if (!longCondition && !shortCondition) {
        return null;
    }



    const entryPrice = last.close;



    // approximate SL using EMA band
    let stopLoss;
    let takeProfit;


    if (longCondition) {

        stopLoss = lastEma.emaLow;

        takeProfit =
            entryPrice +
            (entryPrice - stopLoss) * rewardMultiplier;


        return {
            signal: "BUY",
            entryPrice: Number(entryPrice.toFixed(5)),
            stopLoss: Number(stopLoss.toFixed(5)),
            takeProfit: Number(takeProfit.toFixed(5)),
            riskReward: formatRiskReward(rewardMultiplier),
            pattern: "HA_EMA_REENTRY"
        };
    }



    if (shortCondition) {

        stopLoss = lastEma.emaHigh;

        takeProfit =
            entryPrice -
            (stopLoss - entryPrice) * rewardMultiplier;


        return {
            signal: "SELL",
            entryPrice: Number(entryPrice.toFixed(5)),
            stopLoss: Number(stopLoss.toFixed(5)),
            takeProfit: Number(takeProfit.toFixed(5)),
            riskReward: formatRiskReward(rewardMultiplier),
            pattern: "HA_EMA_REENTRY"
        };
    }


    return null;
}


module.exports = haEmaReEntry;