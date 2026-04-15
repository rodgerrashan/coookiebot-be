const normalizeCandle = require('./normalizeCandle');
const { resolveRewardMultiplier, formatRiskReward } = require('./riskReward');

function sma(values, period) {
  if (!values || values.length < period) return null;
  const subset = values.slice(values.length - period);
  return subset.reduce((sum, value) => sum + value, 0) / period;
}

function trendStrategy(candles, options = {}) {
  if (!candles || candles.length < 50) return null;

  const rewardMultiplier = resolveRewardMultiplier(options.riskRewardRatio, 2);

  const normalized = candles.map(normalizeCandle).filter(Boolean);
  if (normalized.length < 50) return null;

  const closes = normalized.map((c) => c.close);
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);

  if (!Number.isFinite(fast) || !Number.isFinite(slow)) return null;

  const latest = normalized[normalized.length - 1];
  const previous = normalized[normalized.length - 2];
  const riskDistance = Math.max(latest.close * 0.002, Math.abs(latest.high - latest.low));

  if (fast > slow && latest.close > previous.high) {
    return {
      signal: 'BUY',
      entryPrice: Number(latest.close.toFixed(5)),
      stopLoss: Number((latest.close - riskDistance).toFixed(5)),
      takeProfit: Number((latest.close + riskDistance * rewardMultiplier).toFixed(5)),
      riskReward: formatRiskReward(rewardMultiplier),
      pattern: 'TREND_FOLLOWING',
    };
  }

  if (fast < slow && latest.close < previous.low) {
    return {
      signal: 'SELL',
      entryPrice: Number(latest.close.toFixed(5)),
      stopLoss: Number((latest.close + riskDistance).toFixed(5)),
      takeProfit: Number((latest.close - riskDistance * rewardMultiplier).toFixed(5)),
      riskReward: formatRiskReward(rewardMultiplier),
      pattern: 'TREND_FOLLOWING',
    };
  }

  return null;
}

module.exports = trendStrategy;
