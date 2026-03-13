const { runPattern } = require("../services/patterns/index");
const logger = require("../utils/logger");

// Config
const CONFIG = {
  tpPoints: 10,
  slPoints: 10
};

function calcPL(candleValue, entryValue, stake, leverage) {
  const pl = Math.abs(candleValue - entryValue) / entryValue * stake * leverage;
  return parseFloat(pl.toFixed(2));
}

function calcSignedPL(signal, entryValue, exitValue, stake, leverage) {
  if (!entryValue) return 0;
  const direction = signal === "BUY" ? 1 : -1;
  const raw = direction * ((exitValue - entryValue) / entryValue) * stake * leverage;
  return Number(raw.toFixed(2));
}

// Modified version: supports MULTIPLE CONCURRENT TRADES (no blocking)
// New trades can be opened at any time, even if other trades are already open
// Existing trades are monitored independently
// New trades are NOT checked for TP/SL on the same candle they are entered (matches original single-trade behavor)
// ROI is now correctly signed for both BUY and SELL (original had a bug on SELL trades)
// Uses signed PNL for totalProfit and ROI calculations (cleaner & correct for both directions)

function simulateTrade(
  history,
  patternName,
  stake,
  leverage,
  initialBalance = 1000,
  signalConflictMode = "allow_parallel"
) {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      success: false,
      message: "Invalid or empty candle history data."
    };
  }

  let activeTrades = [];       // ← now an array to allow multiple concurrent trades
  let currentBalance = initialBalance;
  let totalProfit = 0;
  let patternScore = 0;
  let numberOfSellTrades = 0;
  let numberOfBuyTrades = 0;
  let numberOfWinTrades = 0;
  let trades = [];             // closed trades only
  let accountBalanceHistory = [];   // track balance over time

  for (let i = 1; i < history.length; i++) {
    const candle = history[i];

    // === 1. Check all existing active trades for TP/SL (before looking for new signals) ===
    let newActiveTrades = [];


    for (let trade of activeTrades) {
      let closed = false;
      let pnl = 0;
      let exitPrice = null;
      let hitType = null;

      if (trade.signal === "BUY") {
        if (candle.high >= trade.takeProfit) {
          // TP hit
          pnl = calcPL(candle.high, trade.entryPrice, stake, leverage);
          totalProfit += pnl;
          patternScore += CONFIG.tpPoints;
          numberOfWinTrades += 1;
          exitPrice = candle.high;
          hitType = "TP Hit";
          closed = true;
          console.log(`✅ TP Hit (BUY) at ${exitPrice}, +${pnl.toFixed(2)}`);

        } else if (candle.low <= trade.stopLoss) {
          // SL hit
          pnl = -calcPL(candle.low, trade.entryPrice, stake, leverage);
          totalProfit += pnl;
          patternScore -= CONFIG.slPoints;
          exitPrice = candle.low;
          hitType = "SL Hit";
          closed = true;
          console.log(`❌ SL Hit (BUY) at ${exitPrice}, ${pnl.toFixed(2)}`);
        }
      } else if (trade.signal === "SELL") {
        if (candle.low <= trade.takeProfit) {
          // TP hit
          pnl = calcPL(candle.low, trade.entryPrice, stake, leverage);
          totalProfit += pnl;
          patternScore += CONFIG.tpPoints;
          numberOfWinTrades += 1;
          exitPrice = candle.low;
          hitType = "TP Hit";
          closed = true;
          console.log(`✅ TP Hit (SELL) at ${exitPrice}, +${pnl.toFixed(2)}`);
        } else if (candle.high >= trade.stopLoss) {
          // SL hit
          pnl = -calcPL(candle.high, trade.entryPrice, stake, leverage);
          totalProfit += pnl;
          patternScore -= CONFIG.slPoints;
          exitPrice = candle.high;
          hitType = "SL Hit";
          closed = true;
          console.log(`❌ SL Hit (SELL) at ${exitPrice}, ${pnl.toFixed(2)}`);
        }
      }

      if (closed) {
        const roi = stake ? Number((pnl / stake * 100).toFixed(2)) : 0;
        currentBalance += pnl;

        trades.push({
          type: trade.signal,
          entryPrice: trade.entryPrice,
          entryTime: trade.entryTime,
          exitPrice,
          exitTime: candle.epoch,   // renamed for consistency with entryTime/exittime
          result: hitType,
          profit: Number(pnl.toFixed(2)),
          candleIndex: i,
          leverage: leverage,
          roi
        });
      } else {
        newActiveTrades.push(trade);
      }
    }

    activeTrades = newActiveTrades;
    accountBalanceHistory.push({
      time: candle.epoch,
      balance: parseFloat(currentBalance.toFixed(2))
    });

    // === 2. Look for new pattern / new trade (can happen even if trades are open) ===
    const patternResult = runPattern(patternName, history.slice(0, i + 1), stake, leverage);

    if (patternResult) {
      // logger.warn("Candle: ", candle);
      // logger.debug("Pattern Result:", patternResult);
    }

    if (patternResult && patternResult.signal) {
      console.warn(`[SIGNAL] ${patternResult.signal} detected on candle ${i}`);

      if (signalConflictMode === "close_opposite_then_open") {
        const oppositeSignal = patternResult.signal === "BUY" ? "SELL" : "BUY";
        const stillOpenTrades = [];

        for (let trade of activeTrades) {
          if (trade.signal !== oppositeSignal) {
            stillOpenTrades.push(trade);
            continue;
          }

          const signalExitPrice = patternResult.entryPrice || candle.close;
          const pnl = calcSignedPL(trade.signal, trade.entryPrice, signalExitPrice, stake, leverage);
          totalProfit += pnl;
          currentBalance += pnl;

          if (pnl > 0) {
            numberOfWinTrades += 1;
          }

          const roi = stake ? Number((pnl / stake * 100).toFixed(2)) : 0;
          trades.push({
            type: trade.signal,
            entryPrice: trade.entryPrice,
            entryTime: trade.entryTime,
            exitPrice: signalExitPrice,
            exitTime: candle.epoch,
            result: `Closed on opposite ${patternResult.signal} signal`,
            profit: Number(pnl.toFixed(2)),
            candleIndex: i,
            leverage,
            roi,
          });
        }

        activeTrades = stillOpenTrades;
      }

      if (patternResult.signal === "BUY") {
        numberOfBuyTrades += 1;
      } else {
        numberOfSellTrades += 1;
      }

      activeTrades.push({
        ...patternResult,
        entryCandleIndex: i,
        entryTime: candle.epoch
      });
    }
  }

  // Optional: uncomment if you want to force-close remaining open trades at the final close price
  // const lastCandle = history[history.length - 1];
  // if (activeTrades.length > 0 && lastCandle) {
  //   for (let trade of activeTrades) {
  //     const direction = trade.signal === "BUY" ? 1 : -1;
  //     const pnl = direction * (lastCandle.close - trade.entryPrice) / trade.entryPrice * stake * leverage;
  //     totalProfit += pnl;
  //     const roi = stake ? Number((pnl / stake * 100).toFixed(2)) : 0;
  //     trades.push({
  //       type: trade.signal,
  //       entryPrice: trade.entryPrice,
  //       entryTime: trade.entryTime,
  //       exitPrice: lastCandle.close,
  //       exitTime: lastCandle.epoch,
  //       result: "Force Close (End of Data)",
  //       profit: Number(pnl.toFixed(2)),
  //       roi
  //     });
  //   }
  // }

  const result = {
    success: true,
    pattern: patternName,
    totalProfit: Number(totalProfit.toFixed(2)),
    patternScore,
    numberOfBuyTrades,
    numberOfSellTrades,
    numberOfWinTrades,
    totalTrades: trades.length,
    trades,
    openTradesAtEnd: activeTrades.length,
    accountBalanceHistory
  };

  logger.debug(`\n💰 Simulation Complete | Net Profit: ${totalProfit.toFixed(2)}`);
  logger.debug(`\n Net Score: ${patternScore}`);

  return result;
}

module.exports = { simulateTrade, calcPL };