const normalizeCandle = require('./patterns/normalizeCandle');

function simpleMovingAverage(values, period) {
  if (!values || values.length < period) return null;
  const subset = values.slice(values.length - period);
  const total = subset.reduce((sum, value) => sum + value, 0);
  return total / period;
}

function averageRange(candles) {
  if (!candles?.length) return 0;
  const total = candles.reduce((sum, candle) => sum + Math.abs(candle.high - candle.low), 0);
  return total / candles.length;
}

function detectMarketRegime(candles = []) {
  if (!candles || candles.length < 40) {
    return { regime: 'UNKNOWN', confidence: 0 };
  }

  const normalized = candles.map(normalizeCandle).filter(Boolean);
  const closes = normalized.map((c) => c.close);
  const fastSma = simpleMovingAverage(closes, 10);
  const slowSma = simpleMovingAverage(closes, 30);

  if (!Number.isFinite(fastSma) || !Number.isFinite(slowSma)) {
    return { regime: 'UNKNOWN', confidence: 0 };
  }

  const latest = closes[closes.length - 1];
  const maSpreadPercent = Math.abs(fastSma - slowSma) / Math.max(Math.abs(latest), 1) * 100;
  const recentRanges = averageRange(normalized.slice(-14));
  const volatilityPercent = recentRanges / Math.max(Math.abs(latest), 1) * 100;

  if (maSpreadPercent >= 0.2 && volatilityPercent >= 0.05) {
    return {
      regime: 'TRENDING',
      confidence: Number(Math.min(maSpreadPercent * 220, 100).toFixed(2)),
    };
  }

  return {
    regime: 'SIDEWAYS',
    confidence: Number(Math.min((0.2 - Math.min(maSpreadPercent, 0.2)) * 450, 100).toFixed(2)),
  };
}

module.exports = { detectMarketRegime };
