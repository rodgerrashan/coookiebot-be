const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');

function sma(values, period) {
  if (!values || values.length < period) return null;
  const subset = values.slice(values.length - period);
  return subset.reduce((sum, value) => sum + value, 0) / period;
}

function std(values) {
  if (!values?.length) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function meanReversion(candles, options = {}) {
  if (!candles || candles.length < 30) return null;

  const rewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 2);

  const normalized = candles.map(normalizeCandle).filter(Boolean);
  if (normalized.length < 30) return null;

  const closes = normalized.map((c) => c.close);
  const window = closes.slice(-20);
  const basis = sma(closes, 20);
  const deviation = std(window);

  if (!Number.isFinite(basis) || !Number.isFinite(deviation) || deviation <= 0) return null;

  const latest = normalized[normalized.length - 1];
  const zScore = (latest.close - basis) / deviation;
  const riskDistance = Math.max(latest.close * 0.002, deviation * 0.8);

  if (zScore <= -1.5) {
    const entryPrice = latest.close;
    const stopLoss = latest.close - riskDistance;
    const rrTarget = entryPrice + (riskDistance * rewardMultiplier);

    return {
      signal: 'BUY',
      entryPrice: Number(entryPrice.toFixed(5)),
      stopLoss: Number(stopLoss.toFixed(5)),
      // Keep mean-reversion anchor while allowing RR to extend target.
      takeProfit: Number(Math.max(basis, rrTarget).toFixed(5)),
      riskReward: formatRiskReward(rewardMultiplier),
      pattern: 'MEAN_REVERSION',
    };
  }

  if (zScore >= 1.5) {
    const entryPrice = latest.close;
    const stopLoss = latest.close + riskDistance;
    const rrTarget = entryPrice - (riskDistance * rewardMultiplier);

    return {
      signal: 'SELL',
      entryPrice: Number(entryPrice.toFixed(5)),
      stopLoss: Number(stopLoss.toFixed(5)),
      // Keep mean-reversion anchor while allowing RR to extend target.
      takeProfit: Number(Math.min(basis, rrTarget).toFixed(5)),
      riskReward: formatRiskReward(rewardMultiplier),
      pattern: 'MEAN_REVERSION',
    };
  }

  return null;
}

module.exports = meanReversion;
