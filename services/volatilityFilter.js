const normalizeCandle = require('./patterns/normalizeCandle');

function trueRange(curr, prevClose) {
  return Math.max(
    curr.high - curr.low,
    Math.abs(curr.high - prevClose),
    Math.abs(curr.low - prevClose)
  );
}

function calculateAtr(candles = [], period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const normalized = candles.map(normalizeCandle).filter(Boolean);
  if (normalized.length < period + 1) return null;

  let atr = 0;
  for (let i = 1; i <= period; i += 1) {
    atr += trueRange(normalized[i], normalized[i - 1].close);
  }
  atr /= period;

  for (let i = period + 1; i < normalized.length; i += 1) {
    const tr = trueRange(normalized[i], normalized[i - 1].close);
    atr = ((atr * (period - 1)) + tr) / period;
  }

  return atr;
}

function shouldBlockByVolatility(candles = [], config = {}) {
  if (!config?.enabled) {
    return { blocked: false, reason: '', atr: null, atrRatio: null };
  }

  const atrPeriod = Number(config.atrPeriod) || 14;
  const atrSpikeMultiplier = Number(config.atrSpikeMultiplier) || 2.5;
  const atr = calculateAtr(candles, atrPeriod);

  if (!Number.isFinite(atr)) {
    return { blocked: false, reason: '', atr: null, atrRatio: null };
  }

  const recent = candles.slice(-(atrPeriod + 1)).map(normalizeCandle).filter(Boolean);
  if (recent.length < atrPeriod + 1) {
    return { blocked: false, reason: '', atr, atrRatio: null };
  }

  const latestRange = Math.abs(recent[recent.length - 1].high - recent[recent.length - 1].low);
  const baselineRange = recent
    .slice(0, -1)
    .reduce((sum, candle) => sum + Math.abs(candle.high - candle.low), 0) / atrPeriod;

  const atrRatio = baselineRange > 0 ? latestRange / baselineRange : 0;

  if (atrRatio >= atrSpikeMultiplier) {
    return {
      blocked: true,
      reason: `Volatility spike filter triggered (${atrRatio.toFixed(2)}x baseline).`,
      atr: Number(atr.toFixed(6)),
      atrRatio: Number(atrRatio.toFixed(4)),
    };
  }

  return {
    blocked: false,
    reason: '',
    atr: Number(atr.toFixed(6)),
    atrRatio: Number(atrRatio.toFixed(4)),
  };
}

module.exports = { calculateAtr, shouldBlockByVolatility };
