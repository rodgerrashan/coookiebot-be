const { runPattern } = require("./patterns/index");
const normalizeCandle = require("./patterns/normalizeCandle");
const logger = require("../utils/logger");
const { parseRewardMultiplier } = require("./patterns/riskReward");

const DEFAULT_CONFIG = {
  commissionRate: 0.0004,
  spreadRate: 0.0001,
  slippageRate: 0.00015,
  minRiskDistancePct: 0.0025,
  atrRiskMultiplier: 0.8,
  atrPeriod: 14,
};

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCandleTime(candle) {
  const rawTime = candle?.epoch ?? candle?.open_time ?? candle?.time;
  const numericTime = Number(rawTime);

  if (!Number.isFinite(numericTime)) return null;
  return numericTime > 10000000000 ? Math.floor(numericTime / 1000) : Math.floor(numericTime);
}

function normalizeRawCandles(history) {
  if (!Array.isArray(history)) return [];

  return history
    .map((candle) => {
      const normalized = normalizeCandle(candle);
      if (!normalized) return null;

      const time = toCandleTime(candle);
      if (time === null) return null;

      return {
        time,
        open: toFiniteNumber(candle?.open ?? normalized.open),
        high: toFiniteNumber(candle?.high ?? normalized.high),
        low: toFiniteNumber(candle?.low ?? normalized.low),
        close: toFiniteNumber(candle?.close ?? normalized.close),
        volume: toFiniteNumber(candle?.volume ?? candle?.vol ?? 0),
      };
    })
    .filter(Boolean);
}

function calcEMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const smoothing = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < values.length; i += 1) {
    ema = values[i] * smoothing + ema * (1 - smoothing);
  }

  return ema;
}

function calcATR(candles, period) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previousClose = candles[i - 1].close;
    const range1 = current.high - current.low;
    const range2 = Math.abs(current.high - previousClose);
    const range3 = Math.abs(current.low - previousClose);
    trueRanges.push(Math.max(range1, range2, range3));
  }

  const seed = trueRanges.slice(0, period);
  if (seed.length < period) return null;

  let atr = seed.reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < trueRanges.length; i += 1) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }

  return atr;
}

function buildRiskModel(entrySide, entryPrice, candlesBeforeEntry, rewardMultiplier) {
  const multiplier = Number.isFinite(rewardMultiplier) && rewardMultiplier > 0 ? rewardMultiplier : 2;
  const atr = calcATR(candlesBeforeEntry, DEFAULT_CONFIG.atrPeriod);
  const rawRisk = Number.isFinite(atr) ? atr * DEFAULT_CONFIG.atrRiskMultiplier : null;
  const minRisk = entryPrice * DEFAULT_CONFIG.minRiskDistancePct;
  const riskDistance = Math.max(minRisk, rawRisk || 0);

  if (!Number.isFinite(riskDistance) || riskDistance <= 0) return null;

  if (entrySide === "BUY") {
    return {
      stopLoss: Number((entryPrice - riskDistance).toFixed(5)),
      takeProfit: Number((entryPrice + riskDistance * multiplier).toFixed(5)),
    };
  }

  return {
    stopLoss: Number((entryPrice + riskDistance).toFixed(5)),
    takeProfit: Number((entryPrice - riskDistance * multiplier).toFixed(5)),
  };
}

function getSpreadAdjustment(price, side, action, config) {
  const spread = price * config.spreadRate;
  const slippage = price * config.slippageRate;
  const adverse = spread + slippage;

  if (action === "entry") {
    if (side === "BUY") return price + adverse;
    return price - adverse;
  }

  if (side === "BUY") return price - adverse;
  return price + adverse;
}

function resolveMarketFill(candle, side, action, config) {
  const open = candle.open;
  return Number(getSpreadAdjustment(open, side, action, config).toFixed(5));
}

function resolveExitFillFromStopLimit(order, candle, config) {
  const { side, orderKind, price: targetPrice } = order;
  const open = candle.open;
  const high = candle.high;
  const low = candle.low;

  if (orderKind === "stop") {
    if (side === "BUY") {
      if (high < targetPrice) return null;
      const base = open >= targetPrice ? open : targetPrice;
      return Number(getSpreadAdjustment(base, side, "entry", config).toFixed(5));
    }

    if (low > targetPrice) return null;
    const base = open <= targetPrice ? open : targetPrice;
    return Number(getSpreadAdjustment(base, side, "entry", config).toFixed(5));
  }

  if (side === "BUY") {
    if (low > targetPrice) return null;
    const base = open <= targetPrice ? open : targetPrice;
    return Number(getSpreadAdjustment(base, side, "entry", config).toFixed(5));
  }

  if (high < targetPrice) return null;
  const base = open >= targetPrice ? open : targetPrice;
  return Number(getSpreadAdjustment(base, side, "entry", config).toFixed(5));
}

function createPosition({ side, entryPrice, entryTime, entryIndex, stake, leverage, pattern, exitMode, riskRewardRatio, candlesBeforeEntry, config }) {
  const quantity = (stake * leverage) / entryPrice;
  const rewardMultiplier = parseRewardMultiplier(riskRewardRatio) || 2;
  const risk = exitMode === "EMA_14_CLOSE_EXIT"
    ? null
    : buildRiskModel(side, entryPrice, candlesBeforeEntry, rewardMultiplier);

  return {
    side,
    entryPrice,
    entryTime,
    entryIndex,
    entryCandleIndex: entryIndex,
    stake,
    leverage,
    pattern,
    exitMode,
    quantity,
    grossExposure: stake * leverage,
    entryFee: (stake * leverage) * config.commissionRate,
    stopLoss: risk?.stopLoss ?? null,
    takeProfit: risk?.takeProfit ?? null,
  };
}

function closePosition(position, exitPrice, exitTime, exitIndex, reason, config, ledger) {
  const direction = position.side === "BUY" ? 1 : -1;
  const grossPnl = position.quantity * (exitPrice - position.entryPrice) * direction;
  const exitFee = (position.stake * position.leverage) * config.commissionRate;
  const netPnl = grossPnl - position.entryFee - exitFee;

  ledger.cashBalance += grossPnl - exitFee;
  ledger.realizedPnl += netPnl;
  ledger.feesPaid += exitFee;
  ledger.marginUsed = Math.max(0, ledger.marginUsed - position.stake);

  return {
    type: position.side,
    entryPrice: position.entryPrice,
    entryTime: position.entryTime,
    exitPrice: Number(exitPrice.toFixed(5)),
    exitTime,
    result: reason,
    grossPnL: Number(grossPnl.toFixed(5)),
    profit: Number(netPnl.toFixed(2)),
    fees: Number((position.entryFee + exitFee).toFixed(5)),
    candleIndex: exitIndex,
    leverage: position.leverage,
    roi: position.stake ? Number(((netPnl / position.stake) * 100).toFixed(2)) : 0,
  };
}

function hasPendingOrder(pendingOrders, kind, side = null) {
  return pendingOrders.some((order) => order.kind === kind && (side ? order.side === side : true));
}

function scheduleOrder(pendingOrders, order) {
  if (!order) return;

  const duplicate = pendingOrders.some((existing) => (
    existing.kind === order.kind &&
    existing.side === order.side &&
    existing.executeIndex === order.executeIndex &&
    existing.reason === order.reason
  ));

  if (!duplicate) {
    pendingOrders.push(order);
  }
}

function maybeScheduleExit(position, candleIndex, candleTime, pendingOrders) {
  if (!position) return;

  scheduleOrder(pendingOrders, {
    kind: "exit",
    side: position.side === "BUY" ? "SELL" : "BUY",
    orderKind: "market",
    executeIndex: candleIndex + 1,
    reason: "Signal Exit",
  });
}

function getFillPriority(order) {
  if (order.kind === "exit") return 0;
  if (order.kind === "entry") return 1;
  return 2;
}

function simulateTrade(
  history,
  patternName,
  stake,
  leverage,
  initialBalance = 1000,
  signalConflictMode = "allow_parallel",
  riskRewardRatio = "1:2"
) {
  const candles = normalizeRawCandles(history);
  if (!candles.length) {
    return {
      success: false,
      message: "Invalid or empty candle history data.",
    };
  }

  const config = { ...DEFAULT_CONFIG };
  const ledger = {
    cashBalance: initialBalance,
    realizedPnl: 0,
    unrealizedPnl: 0,
    feesPaid: 0,
    marginUsed: 0,
  };

  const pendingOrders = [];
  const trades = [];
  const accountBalanceHistory = [];

  let activePosition = null;
  let totalProfit = 0;
  let patternScore = 0;
  let numberOfSellTrades = 0;
  let numberOfBuyTrades = 0;
  let numberOfWinTrades = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const candleTime = candle.time;

    // Execute orders queued on the previous bar.
    const executableOrders = pendingOrders
      .filter((order) => order.executeIndex === i)
      .sort((a, b) => getFillPriority(a) - getFillPriority(b));

    for (const order of executableOrders) {
      if (order.kind === "exit" && activePosition) {
        const fillPrice = order.orderKind === "market"
          ? resolveMarketFill(candle, activePosition.side === "BUY" ? "SELL" : "BUY", "exit", config)
          : resolveExitFillFromStopLimit(order, candle, config);

        if (fillPrice !== null) {
          const trade = closePosition(activePosition, fillPrice, candleTime, i, order.reason, config, ledger);
          trades.push(trade);
          totalProfit += trade.profit;
          if (trade.profit > 0) {
            numberOfWinTrades += 1;
            patternScore += 10;
          } else if (trade.profit < 0) {
            patternScore -= 10;
          }
          activePosition = null;
        }
      }

      if (order.kind === "entry" && !activePosition) {
        const fillPrice = order.orderKind === "market"
          ? resolveMarketFill(candle, order.side, "entry", config)
          : resolveExitFillFromStopLimit(order, candle, config);

        if (fillPrice !== null) {
          const entryFee = (stake * leverage) * config.commissionRate;
          ledger.cashBalance -= entryFee;
          ledger.feesPaid += entryFee;
          ledger.marginUsed += stake;
          ledger.realizedPnl -= entryFee;

          activePosition = createPosition({
            side: order.side,
            entryPrice: fillPrice,
            entryTime: candleTime,
            entryIndex: i,
            stake: Number(stake),
            leverage: Number(leverage),
            pattern: patternName,
            exitMode: order.exitMode || null,
            riskRewardRatio,
            candlesBeforeEntry: candles.slice(0, i),
            config,
          });
        }
      }
    }

    // Drop processed orders.
    for (let idx = pendingOrders.length - 1; idx >= 0; idx -= 1) {
      if (pendingOrders[idx].executeIndex === i) {
        pendingOrders.splice(idx, 1);
      }
    }

    // Manage open position exits against raw candle data.
    if (activePosition) {
      if (activePosition.exitMode === "EMA_14_CLOSE_EXIT") {
        const closes = candles.slice(0, i + 1).map((entry) => entry.close);
        const ema14 = calcEMA(closes, 14);
        if (Number.isFinite(ema14) && i > activePosition.entryIndex) {
          const shouldExit = (activePosition.side === "BUY" && candle.close < ema14)
            || (activePosition.side === "SELL" && candle.close > ema14);

          if (shouldExit && !hasPendingOrder(pendingOrders, "exit")) {
            scheduleOrder(pendingOrders, {
              kind: "exit",
              side: activePosition.side,
              orderKind: "market",
              executeIndex: i + 1,
              reason: "EMA14 Exit",
            });
          }
        }
      } else if (i > activePosition.entryIndex) {
        const stopLoss = activePosition.stopLoss;
        const takeProfit = activePosition.takeProfit;

        if (Number.isFinite(stopLoss) || Number.isFinite(takeProfit)) {
          const stopHit = Number.isFinite(stopLoss)
            && (
              (activePosition.side === "BUY" && candle.low <= stopLoss)
              || (activePosition.side === "SELL" && candle.high >= stopLoss)
            );

          const takeProfitHit = Number.isFinite(takeProfit)
            && (
              (activePosition.side === "BUY" && candle.high >= takeProfit)
              || (activePosition.side === "SELL" && candle.low <= takeProfit)
            );

          if ((stopHit || takeProfitHit) && !hasPendingOrder(pendingOrders, "exit")) {
            const exitPrice = stopHit && takeProfitHit
              ? stopLoss
              : (stopHit ? stopLoss : takeProfit);

            scheduleOrder(pendingOrders, {
              kind: "exit",
              side: activePosition.side === "BUY" ? "SELL" : "BUY",
              orderKind: stopHit ? "stop" : "limit",
              price: exitPrice,
              executeIndex: i,
              reason: stopHit ? "Stop Loss" : "Take Profit",
            });
          }
        }
      }
    }

    // Use closed-bar data for signal generation only.
    const patternResult = runPattern(patternName, candles.slice(0, i + 1), {
      riskRewardRatio,
    });

    if (patternResult?.signal) {
      const nextIndex = i + 1;
      if (nextIndex < candles.length) {
        if (!activePosition) {
          numberOfBuyTrades += patternResult.signal === "BUY" ? 1 : 0;
          numberOfSellTrades += patternResult.signal === "SELL" ? 1 : 0;

          scheduleOrder(pendingOrders, {
            kind: "entry",
            side: patternResult.signal,
            orderKind: "market",
            executeIndex: nextIndex,
            reason: patternResult.pattern || patternName,
            exitMode: patternResult.exitMode || null,
          });
        } else if (activePosition.side !== patternResult.signal) {
          if (signalConflictMode === "close_opposite_then_open" || patternResult.closeOppositeOnSignal) {
            maybeScheduleExit(activePosition, i, candleTime, pendingOrders);

            scheduleOrder(pendingOrders, {
              kind: "entry",
              side: patternResult.signal,
              orderKind: "market",
              executeIndex: nextIndex,
              reason: patternResult.pattern || patternName,
              exitMode: patternResult.exitMode || null,
            });

            numberOfBuyTrades += patternResult.signal === "BUY" ? 1 : 0;
            numberOfSellTrades += patternResult.signal === "SELL" ? 1 : 0;
          } else if (!hasPendingOrder(pendingOrders, "exit")) {
            maybeScheduleExit(activePosition, i, candleTime, pendingOrders);
          }
        }
      }
    }

    const unrealizedPnl = activePosition
      ? activePosition.quantity * (candle.close - activePosition.entryPrice) * (activePosition.side === "BUY" ? 1 : -1)
      : 0;

    ledger.unrealizedPnl = unrealizedPnl;
    const equity = ledger.cashBalance + unrealizedPnl;
    const freeMargin = equity - ledger.marginUsed;

    accountBalanceHistory.push({
      time: candleTime,
      balance: Number(equity.toFixed(2)),
      cash: Number(ledger.cashBalance.toFixed(2)),
      equity: Number(equity.toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      realizedPnl: Number(ledger.realizedPnl.toFixed(2)),
      marginUsed: Number(ledger.marginUsed.toFixed(2)),
      freeMargin: Number(freeMargin.toFixed(2)),
      feesPaid: Number(ledger.feesPaid.toFixed(2)),
    });
  }

  // Force-close any final position at the last raw close to keep the equity curve complete.
  if (activePosition) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const trade = closePosition(activePosition, exitPrice, lastCandle.time, candles.length - 1, "Force Close (End of Data)", config, ledger);
    trades.push(trade);
    totalProfit += trade.profit;
    if (trade.profit > 0) {
      numberOfWinTrades += 1;
      patternScore += 10;
    } else if (trade.profit < 0) {
      patternScore -= 10;
    }
    activePosition = null;
  }

  ledger.unrealizedPnl = 0;
  totalProfit = ledger.realizedPnl;

  const finalEquity = ledger.cashBalance;
  accountBalanceHistory.push({
    time: candles[candles.length - 1].time,
    balance: Number(finalEquity.toFixed(2)),
    cash: Number(ledger.cashBalance.toFixed(2)),
    equity: Number(finalEquity.toFixed(2)),
    unrealizedPnl: 0,
    realizedPnl: Number(ledger.realizedPnl.toFixed(2)),
    marginUsed: Number(ledger.marginUsed.toFixed(2)),
    freeMargin: Number((finalEquity - ledger.marginUsed).toFixed(2)),
    feesPaid: Number(ledger.feesPaid.toFixed(2)),
  });

  logger.debug(`\n💰 Simulation Complete | Net Profit: ${ledger.realizedPnl.toFixed(2)}`);
  logger.debug(`\n Net Score: ${patternScore}`);

  return {
    success: true,
    pattern: patternName,
    totalProfit: Number(ledger.realizedPnl.toFixed(2)),
    patternScore,
    numberOfBuyTrades,
    numberOfSellTrades,
    numberOfWinTrades,
    totalTrades: trades.length,
    trades,
    openTradesAtEnd: activePosition ? 1 : 0,
    accountBalanceHistory,
    feesPaid: Number(ledger.feesPaid.toFixed(2)),
    realizedPnl: Number(ledger.realizedPnl.toFixed(2)),
    unrealizedPnl: Number(ledger.unrealizedPnl.toFixed(2)),
  };
}

module.exports = { simulateTrade };
