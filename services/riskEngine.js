function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value, min = 0, max = 100) {
  return Math.min(Math.max(toFiniteNumber(value, 0), min), max);
}

function calculatePositionSize(bot, markerContext = {}) {
  const config = bot?.smartFeatures?.riskEngine || {};
  const investment = toFiniteNumber(bot?.investment, 0);

  if (!config.enabled || !config.autoPositionSizing) {
    return Math.max(investment, 0);
  }

  const riskPerTradePercent = clampPercent(config.riskPerTradePercent, 0.1, 100);
  const equityBase = Math.max(
    toFiniteNumber(markerContext.equityBase, investment),
    investment,
    1
  );

  const dynamicSize = (equityBase * riskPerTradePercent) / 100;
  return Number(Math.max(dynamicSize, 1).toFixed(2));
}

function evaluateTradingRisk(bot, runtimeState = {}) {
  const config = bot?.smartFeatures?.riskEngine || {};

  if (!config.enabled) {
    return { allowTrade: true, reason: '' };
  }

  const dayPnLPercent = toFiniteNumber(runtimeState.dayPnLPercent, 0);
  const consecutiveLosses = toFiniteNumber(runtimeState.consecutiveLosses, 0);
  const maxDailyLossPercent = Math.abs(toFiniteNumber(config.maxDailyLossPercent, 3));
  const maxLossStreak = Math.max(1, toFiniteNumber(config.stopAfterConsecutiveLosses, 3));

  if (dayPnLPercent <= -maxDailyLossPercent) {
    return {
      allowTrade: false,
      reason: `Daily loss limit reached (${dayPnLPercent.toFixed(2)}%).`,
    };
  }

  if (consecutiveLosses >= maxLossStreak) {
    return {
      allowTrade: false,
      reason: `Stopped after ${consecutiveLosses} consecutive losses.`,
    };
  }

  return { allowTrade: true, reason: '' };
}

function updateRiskStateFromClosedTrade(runtimeState = {}, closedTrade = {}) {
  const realizedPnL = toFiniteNumber(closedTrade.realizedPnL, 0);
  const pnlPercent = toFiniteNumber(closedTrade.pnlPercent, 0);
  const next = {
    ...runtimeState,
    dayPnLPercent: toFiniteNumber(runtimeState.dayPnLPercent, 0) + pnlPercent,
  };

  if (realizedPnL < 0) {
    next.consecutiveLosses = toFiniteNumber(runtimeState.consecutiveLosses, 0) + 1;
  } else if (realizedPnL > 0) {
    next.consecutiveLosses = 0;
  }

  return next;
}

module.exports = {
  calculatePositionSize,
  evaluateTradingRisk,
  updateRiskStateFromClosedTrade,
};
