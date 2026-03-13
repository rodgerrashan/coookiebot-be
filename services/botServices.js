const { subscribeCandles } = require("./deriv/candlesService");
const { placeTrade, sellContract } = require("./deriv/tradeService");
const logger = require("../utils/logger");
const socketManager = require("./socketManager");

require('dotenv').config();

const { saveCandle } = require("../services/candleService");
const { makelogbot } = require("../services/logsBotsServices");

// runpattern
const { runPattern } = require("../services/patterns/index");

// calculate pl
const { calcPL } = require("../services/playgroundservice");


// create trade log in bot
const { createTradeMarker } = require("../services/tradeMarkersServices");

const Candle = require("../models/Candle");
const mongoose = require("mongoose");
const Bot = require("../models/Bot");
const Exchange = require("../models/Exchange");



// Store running bots in memory
const runningBots = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main Bot Runner
 * @param {Object} bot - bot object from DB
 * @param {string} token - user Deriv API token
 * @param {string} appId - your DERIV_APP_ID
 */
const startBot = async (bot, token, isAfterRestarted = false) => {
  const botKey = String(bot._id);

  let retries = 0;
  const MAX_RETRIES = 10;

  if (runningBots.has(botKey)) {
    logger.warn(`[BOT] Bot ${bot.botName} is already running`);
    return;
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

    
    ws = await subscribeCandles(bot.tradingPair, bot.timeframe, token, bot._id, async (newCandle) => {

      // update the candle history
      candleHistory.push(newCandle);

      if (candleHistory.length > 100) {
        candleHistory.shift();
      }

      // Check for patterns
      // const patternResult = checkPatterns(candleHistory);

      const patternResult = runPattern(bot.strategy, candleHistory, {
        riskRewardRatio: bot.riskRewardRatio || '1:2',
      });

      if (patternResult) {
        if (isHandlingSignal) {
          return;
        }

        isHandlingSignal = true;

        createTradeMarker(bot._id, patternResult.entryPrice, Date.now(), patternResult.takeProfit, patternResult.stopLoss, patternResult.signal);
         
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
                  await sellContract(token, bot._id, trade.contractId);
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

          const payload = {
            price: 10, // Max stake (example: $10)
            parameters: {
              "proposal": 1,
              "amount": bot.investment,
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




          const tradeResult = await placeTrade(token, bot._id, payload);
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
      runningBots.set(botKey, { ws, candleHistory, activeTrades });


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
      const exchange = await Exchange.findById(bot.exchange._id.toString());
      if (exchange) {
        startBot(bot, exchange.apiToken, true);
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
