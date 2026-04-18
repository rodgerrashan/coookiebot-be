const logger = require("../utils/logger");
const socketManager = require("./socketManager");
const { getExchangeProvider } = require("./exchanges/factory");

require('dotenv').config();

const { saveCandle } = require("../services/candleService");
const { makelogbot } = require("../services/logsBotsServices");

// runpattern
const { runPattern } = require("../services/patterns/index");

// calculate pl
const { calcPL } = require("../services/playgroundservice");


// create trade log in bot
const { createTradeMarker } = require("../services/tradeMarkersServices");
const { evaluateTradingRisk, calculatePositionSize } = require("../services/riskEngine");
const { detectMarketRegime } = require("../services/marketRegime");
const { shouldBlockByVolatility } = require("../services/volatilityFilter");
const { resolveActiveStrategy } = require("../services/strategySwitchCoordinator");
const { runGridBot } = require("../services/gridBotEngine");

const Candle = require("../models/Candle");
const mongoose = require("mongoose");
const Bot = require("../models/Bot");
const Exchange = require("../models/Exchange");
const TradingMarker = require("../models/TradingMarker");
const User = require("../models/User").default;



// Store running bots in memory
const runningBots = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildRuntimeState(bot) {
  return {
    currentRegime: bot?.runtimeState?.currentRegime || 'UNKNOWN',
    currentStrategy: bot?.runtimeState?.currentStrategy || bot?.strategy,
    tradingPaused: Boolean(bot?.runtimeState?.tradingPaused),
    pauseReason: bot?.runtimeState?.pauseReason || '',
    consecutiveLosses: Number(bot?.runtimeState?.consecutiveLosses || 0),
    dayPnLPercent: Number(bot?.runtimeState?.dayPnLPercent || 0),
    lastSwitchAt: bot?.runtimeState?.lastSwitchAt || null,
    candlesSinceSwitch: 0,
  };
}

async function hydrateRuntimeRiskState(botId, runtimeState) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const closedTrades = await TradingMarker.find({
    botId,
    status: 'closed',
    updatedAt: { $gte: startOfDay },
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  let dayPnLPercent = 0;
  let consecutiveLosses = 0;

  for (const trade of closedTrades) {
    dayPnLPercent += Number(trade.pnlPercent || 0);
  }

  for (const trade of closedTrades) {
    if (Number(trade.realizedPnL || 0) < 0) {
      consecutiveLosses += 1;
    } else {
      break;
    }
  }

  return {
    ...runtimeState,
    dayPnLPercent: Number(dayPnLPercent.toFixed(4)),
    consecutiveLosses,
  };
}

/**
 * Main Bot Runner
 * @param {Object} bot - bot object from DB
 * @param {Object|string} exchangeConfig - exchange document or encrypted token (legacy)
 * @param {string} appId - your DERIV_APP_ID
 */
const startBot = async (bot, exchangeConfig, isAfterRestarted = false) => {
  const botKey = String(bot._id);

  let retries = 0;
  const MAX_RETRIES = 10;

  if (runningBots.has(botKey)) {
    logger.warn(`[BOT] Bot ${bot.botName} is already running`);
    return;
  }

  const resolvedExchange = typeof exchangeConfig === 'string'
    ? { platform: bot.exchange.platform, apiToken: exchangeConfig }
    : exchangeConfig;

  const provider = getExchangeProvider(resolvedExchange?.platform || bot.exchange.platform);
  const supportsRuntime = typeof provider.subscribeMarketData === 'function'
    && typeof provider.createOrder === 'function'
    && typeof provider.closeOrder === 'function';

  if (!supportsRuntime) {
    throw new Error(`${resolvedExchange?.platform || bot.exchange.platform} runtime trading is not implemented yet`);
  }

  logger.info(`[BOT] Starting bot: ${bot.botName} (${bot._id})`);

  if (isAfterRestarted) {

    // Send web socket notification
    socketManager.publish(`bot-activity-logs-${bot._id}`, {
      level: 'info',
      message: `Resumed after server restart`,
      timestamp: new Date()
    });

    makelogbot(bot._id, 'info', `Resumed after server restart`);
  } else {
    makelogbot(bot._id, 'status', `Bot ${bot.botName} successfully started`);
    // Send web socket notification
    socketManager.publish(`bot-activity-logs-${bot._id}`, {
      actionRequired: false,
      botId: bot._id,
      logType: 'info',
      message: `Bot ${bot.botName} successfully started`,
      timestamp: new Date()
    });
  }

  let ws;

  while (retries < MAX_RETRIES) {

    logger.info(`[BOT] Attempting to subscribe candles for bot ${bot.botName} (Attempt ${retries + 1}/${MAX_RETRIES})`);
    try {
    let candleHistory = [];
    let activeTrades = [];
    let isHandlingSignal = false;
    let runtimeState = await hydrateRuntimeRiskState(bot._id, buildRuntimeState(bot));

    
    ws = await provider.subscribeMarketData({
      symbol: bot.tradingPair,
      timeframe: bot.timeframe,
      apiToken: resolvedExchange.apiToken,
      apiKey: resolvedExchange.apiKey,
      apiSecret: resolvedExchange.apiSecret,
      isTestnet: resolvedExchange.isTestnet,
      botId: bot._id,
      onCandle: async (newCandle) => {

      // update the candle history
      candleHistory.push(newCandle);

      if (candleHistory.length > 100) {
        candleHistory.shift();
      }

      const regimeResult = detectMarketRegime(candleHistory);
      runtimeState.currentRegime = regimeResult.regime;

      const switchResult = resolveActiveStrategy(bot, runtimeState, regimeResult.regime);
      runtimeState = switchResult.updatedState;

      if (switchResult.switched) {
        makelogbot(bot._id, 'info', switchResult.switchReason);
        socketManager.publish(`bot-activity-logs-${bot._id}`, {
          logType: 'info',
          actionRequired: false,
          botId: bot._id,
          message: switchResult.switchReason,
          timestamp: new Date(),
        });
      }

      const riskStatus = evaluateTradingRisk(bot, runtimeState);
      if (!riskStatus.allowTrade) {
        runtimeState.tradingPaused = true;
        runtimeState.pauseReason = riskStatus.reason;
        runtimeState.lastPauseAt = new Date();

        await Bot.findByIdAndUpdate(bot._id, {
          status: 'paused',
          runtimeState,
        });

        makelogbot(bot._id, 'warning', riskStatus.reason);
        socketManager.publish(`bot-activity-logs-${bot._id}`, {
          logType: 'warning',
          actionRequired: true,
          botId: bot._id,
          message: riskStatus.reason,
          timestamp: new Date(),
        });
        return;
      }

      runtimeState.tradingPaused = false;
      runtimeState.pauseReason = '';

      const volatilityDecision = shouldBlockByVolatility(
        candleHistory,
        bot?.smartFeatures?.volatilityFilter || {}
      );

      if (volatilityDecision.blocked) {
        makelogbot(bot._id, 'info', volatilityDecision.reason);
        socketManager.publish(`bot-activity-logs-${bot._id}`, {
          logType: 'info',
          actionRequired: false,
          botId: bot._id,
          message: volatilityDecision.reason,
          timestamp: new Date(),
        });
        return;
      }

      const activeStrategy = switchResult.strategy || bot.strategy;
      runtimeState.currentStrategy = activeStrategy;

      let patternResult = null;
      const isGridMode = ['grid', 'grid trading'].includes(String(bot.botMode || '').toLowerCase())
        || activeStrategy === 'GRID_RANGE';

      if (isGridMode) {
        patternResult = runGridBot(candleHistory, {
          rewardMultiplier: 1.4,
          gridSpacingPercent: 0.4,
        });
      } else {
        patternResult = runPattern(activeStrategy, candleHistory, {
          riskRewardRatio: bot.riskRewardRatio || '1:2',
        });
      }

      if (patternResult) {
        if (isHandlingSignal) {
          return;
        }

        isHandlingSignal = true;

        await createTradeMarker(
          bot._id,
          patternResult.entryPrice,
          Date.now(),
          patternResult.takeProfit,
          patternResult.stopLoss,
          patternResult.signal,
          {
            strategy: runtimeState.currentStrategy,
            marketRegime: runtimeState.currentRegime,
          }
        );
         
        // Send web socket notification
        socketManager.publish(`bot-activity-logs-${bot._id}`, {
          logType: 'info',
          actionRequired: false,
          botId: bot._id,
          message: `Found ${patternResult.signal} pattern`,
          timestamp: new Date()
        });

        makelogbot(bot._id, 'info', `Found a pattern`);


        logger.warn(`[BOT] ${bot.botName} found pattern: ${JSON.stringify(patternResult)}`);

        // place a trade based on pattern
        try {
          if (bot.signalConflictMode === "close_opposite_then_open") {
            const oppositeDirection = patternResult.signal === "BUY" ? "SELL" : "BUY";
            const openOppositeTrades = activeTrades.filter(
              (trade) => trade.status === "open" && trade.direction === oppositeDirection
            );

            if (openOppositeTrades.length > 0) {
              for (const trade of openOppositeTrades) {
                try {
                  await provider.closeOrder({
                    apiToken: resolvedExchange.apiToken,
                    apiKey: resolvedExchange.apiKey,
                    apiSecret: resolvedExchange.apiSecret,
                    isTestnet: resolvedExchange.isTestnet,
                    botId: bot._id,
                    orderId: trade.contractId,
                  });
                  trade.status = "closed";

                  makelogbot(
                    bot._id,
                    "trade",
                    `Closed ${oppositeDirection} position ${trade.contractId} before opening ${patternResult.signal}`
                  );

                  socketManager.publish(`bot-activity-logs-${bot._id}`, {
                    logType: "info",
                    actionRequired: false,
                    botId: bot._id,
                    message: `Closed opposite ${oppositeDirection} position before opening ${patternResult.signal}`,
                    timestamp: new Date(),
                  });
                } catch (closeErr) {
                  logger.error(
                    `[BOT] ${bot.botName} failed closing opposite ${oppositeDirection} trade ${trade.contractId}: ${closeErr.message}`
                  );
                  makelogbot(bot._id, "error", `Failed closing opposite trade: ${closeErr.message}`);

                  socketManager.publish(`bot-activity-logs-${bot._id}`, {
                    logType: "error",
                    actionRequired: false,
                    botId: bot._id,
                    message: `Failed closing opposite trade: ${closeErr.message}`,
                    timestamp: new Date(),
                  });

                  return;
                }
              }
            }
          }

          const orderAmount = calculatePositionSize(bot, {
            equityBase: Number(bot.investment || 0),
          });

          const payload = {
            price: 10, // Max stake (example: $10)
            parameters: {
              "proposal": 1,
              "amount": orderAmount,
              "basis": "stake",
              "contract_type": patternResult.signal === "BUY" ? "MULTUP" : "MULTDOWN",                          
              "currency": "USD",
              "symbol": bot.tradingPair,
              "multiplier": bot.multiplier,
              "limit_order": {
                "take_profit": calcPL(patternResult.takeProfit, patternResult.entryPrice, bot.investment, bot.multiplier),
                // stop loss should be maximum limit to bot investment
                "stop_loss": Math.min(calcPL(patternResult.stopLoss, patternResult.entryPrice, bot.investment, bot.multiplier), bot.investment), 
              },
            }
          };




          const tradeResult = await provider.createOrder({
            apiToken: resolvedExchange.apiToken,
            apiKey: resolvedExchange.apiKey,
            apiSecret: resolvedExchange.apiSecret,
            isTestnet: resolvedExchange.isTestnet,
            botId: bot._id,
            payload,
          });
          activeTrades.push({
            contractId: tradeResult.contract_id,
            direction: patternResult.signal,
            status: "open",
            openedAt: new Date(),
          });
          logger.info(`[BOT] ${bot.botName} placed trade: ${JSON.stringify(tradeResult)}`);
        } catch (tradeErr) {

          makelogbot(bot._id, 'error', `Trade error: ${tradeErr.message}`);
          // Send web socket notification
          socketManager.publish(`bot-activity-logs-${bot._id}`, {
            logType: 'error',
            actionRequired: false,
            botId: bot._id,
            message: `Trade error: ${tradeErr.message}`,
            timestamp: new Date()
          });
          console.log(tradeErr);
          logger.error(`[BOT] ${bot.botName} trade error: ${tradeErr.message}`);
        } finally {
          isHandlingSignal = false;
        }
      }

      await Bot.findByIdAndUpdate(bot._id, {
        runtimeState,
      });

      // Save new candle to DB or in-memory store as needed
      try {
        const candlePayload = {
          botId: bot._id,
          symbol: bot.tradingPair,
          timeframe: bot.timeframe,
          open_time: newCandle.open_time,
          data: newCandle,
        };

        try {

          await saveCandle(bot._id, candlePayload);

        } catch (e) {
          // Fallback to inserting directly into the collection (no model required)
          await mongoose.connection.collection("candles").insertOne(candlePayload);
        }
      } catch (err) {
        logger.warn(`[BOT] Failed to save candle for ${bot.botName}: ${err.message}`);
        // makelogbot(bot._id, 'error', `Failed to save candle: ${err.message}`);
      }

      }
    });

    // WebSocket error handling
      ws.socket.on("error", (err) => {
        logger.error(`[BOT] WS error: ${err.message}`);
        ws.close();
      });

      ws.socket.on("close", () => {
        logger.warn(`[BOT] WS closed for bot ${bot.botName}. Attempting to reconnect...`);
        makelogbot(bot._id, 'warning', `WebSocket disconnected. Attempting to reconnect...`);
        // Send web socket notification
        socketManager.publish(`bot-activity-logs-${bot._id}`, {
          logType: 'warning',
          actionRequired: false,
          botId: bot._id,
          message: `WebSocket disconnected.`,
          timestamp: new Date()
        });
      });

      // If subscription succeeds, reset retries
      retries = 0;
      runningBots.set(botKey, { ws, candleHistory, activeTrades, runtimeState });


      return;

    

  } catch (error) {
    retries += 1;
    logger.warn(`[BOT] Subscription failed (${retries}/${MAX_RETRIES}): ${error.message}`);
    await delay(2000 * retries); 
    makelogbot(bot._id, 'error', `Failed to subscribe candles: ${error.message}`);
    // Send web socket notification
    socketManager.publish(`bot-activity-logs-${bot._id}`, {
      logType: 'error',
      actionRequired: false,
      botId: bot._id,
      message: `Failed to subscribe candles: ${error.message}`,
      timestamp: new Date()
    });
  } finally {

  }


  }
};

/**
 * Stop a bot
 */
const stopBot = (botId) => {
  const botData = runningBots.get(String(botId));

  if (!botData) {
    throw new Error(`Cannot stop bot ${botId}: botData not found`);
  }

  botData.ws.socket.close();
  runningBots.delete(String(botId));

  makelogbot(botId, 'status', `Bot successfully stopped`);

  // Send web socket notification
  socketManager.publish(`bot-activity-logs-${botId}`, {
    logType: 'info',
    actionRequired: false,
    botId: botId,
    message: `Bot successfully stopped`,
    timestamp: new Date()
  });

  logger.warn(`[BOT] Bot ${botId} stopped`);
  return true;
};



/**
 * Get bot status
 */
const getBotStatus = (botId) => {
  return runningBots.has(String(botId)) ? "running" : "stopped";
};



// Start bots all after restarting server
const startAllBots = async () => {
  try {
    const bots = await Bot.find({ status: "active" });
    for (const bot of bots) {
      if (bot.userId) {
        const user = await User.findById(bot.userId).select('approvalStatus');
        if (!user || (user.approvalStatus && user.approvalStatus !== 'approved')) {
          logger.warn(`[BOT] Skipping auto-start for ${bot.botName}: owner account is not approved`);
          continue;
        }
      }

      const exchange = await Exchange.findById(bot.exchange._id.toString());
      if (exchange) {
        if (String(exchange.platform || '').toLowerCase() !== 'deriv') {
          logger.warn(`[BOT] Skipping auto-start for ${bot.botName}: ${exchange.platform} runtime pending implementation`);
          continue;
        }
        startBot(bot, exchange, true);
        logger.info(`[BOT] Restarted bot ${bot.botName} (${bot._id}) after server restart`);
      } else {
        logger.error(`[BOT] Exchange not found for bot ${bot.botName} (${bot._id})`);
      }
    }
  } catch (error) {
    logger.error("[BOT] Failed to start all bots after server restart:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  }
};


module.exports = {
  startBot,
  stopBot,
  getBotStatus,
  startAllBots
};
