// services/patterns/normalizeCandle.js

function normalizeCandle(c) {
    if (!c) return null;

    return {
        open: Number(c.open),
        close: Number(c.close),
        high: Number(c.high),
        low: Number(c.low)
    };
}

module.exports = normalizeCandle;
