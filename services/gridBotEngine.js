const normalizeCandle = require('./patterns/normalizeCandle');

function simpleAverage(values) {
  if (!values?.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function runGridBot(candles = [], options = {}) {
  if (!candles || candles.length < 20) return null;

  const normalized = candles.map(normalizeCandle).filter(Boolean);
  if (normalized.length < 20) return null;

  const closes = normalized.map((c) => c.close);
  const recentCloses = closes.slice(-20);
  const mid = simpleAverage(recentCloses);
  const latest = normalized[normalized.length - 1];

  if (!Number.isFinite(mid)) return null;

  const halfBandPercent = Number(options.gridSpacingPercent) || 0.4;
  const band = mid * (halfBandPercent / 100);
  const lowerBand = mid - band;
  const upperBand = mid + band;

  const rewardMultiplier = Number(options.rewardMultiplier) || 1.4;
  const riskDistance = Math.max(latest.close * 0.002, Math.abs(band) * 0.8);

  if (latest.close <= lowerBand) {
    return {
      signal: 'BUY',
      entryPrice: Number(latest.close.toFixed(5)),
      stopLoss: Number((latest.close - riskDistance).toFixed(5)),
      takeProfit: Number((latest.close + riskDistance * rewardMultiplier).toFixed(5)),
      pattern: 'GRID_RANGE',
    };
  }

  if (latest.close >= upperBand) {
    return {
      signal: 'SELL',
      entryPrice: Number(latest.close.toFixed(5)),
      stopLoss: Number((latest.close + riskDistance).toFixed(5)),
      takeProfit: Number((latest.close - riskDistance * rewardMultiplier).toFixed(5)),
      pattern: 'GRID_RANGE',
    };
  }

  return null;
}

module.exports = { runGridBot };
