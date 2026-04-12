const Bot = require('../models/Bot');
const Exchange = require('../models/Exchange');
const LogBot = require('../models/LogsBots');
const Candle = require('../models/Candle');
const TradingMarker = require('../models/TradingMarker');

const User = require('../models/User');
const logger = require('../utils/logger');
const { getExchangeProvider } = require('../services/exchanges/factory');
const { validateRiskRewardRatioInput } = require('../utils/riskRewardRatio');

const { startBot, stopBot } = require('../services/botServices')
const { makelogbot } = require('../services/logsBotsServices');


// 🟢 Create a new bot
exports.createBot = async (req, res) => {
  try {
    const {
      botName,
      exchange,
      tradingPair,
      timeframe,
      strategy,
      botMode,
      investment,
      multiplier,
      marketType,
      orderType,
      leverage,
      marginMode,
      positionSide,
      signalConflictMode,
      riskRewardRatio,
      smartFeatures,
    } = req.body;

    // ✅ Validate required fields
    if (!botName || !exchange || !tradingPair || !timeframe || !strategy || !investment || !botMode) {
      logger.warn("[BOT CREATE] Missing required fields");
      return res.status(400).json({ message: "Missing required bot configuration fields." });
    }

    const validBotModes = ['Grid', 'Pattern Trading'];
    if (!validBotModes.includes(botMode)) {
      logger.warn(`[BOT CREATE] Unsupported bot mode: ${botMode}`);
      return res.status(400).json({
        message: `Unsupported bot mode. Allowed modes: ${validBotModes.join(', ')}`,
      });
    }

    const ratioValidation = validateRiskRewardRatioInput(riskRewardRatio || '1:2');
    if (!ratioValidation.valid) {
      return res.status(400).json({ message: ratioValidation.message });
    }

    // fetch platform from exchange by id 
    const exchangeRecord = await Exchange.findById(exchange);

    if (!exchangeRecord) {
      logger.warn(`[BOT CREATE] Exchange not found: ${exchange.name}`);
      return res.status(404).json({ message: "Exchange not found." });
    }

    const provider = getExchangeProvider(exchangeRecord.platform);
    await provider.validateCredentials({
      apiToken: exchangeRecord.apiToken,
      apiKey: exchangeRecord.apiKey,
      apiSecret: exchangeRecord.apiSecret,
      isTestnet: exchangeRecord.isTestnet,
      marketType: marketType || 'spot',
    });

    const newBot = new Bot({
      botName,
      exchange: {
        _id: exchangeRecord._id,
        platform: exchangeRecord.platform,
        name: exchangeRecord.name,
      },
      tradingPair,
      timeframe,
      strategy,
      botMode,
      investment,
      status: "created",
      multiplier: multiplier || 1,
      marketType: marketType || 'spot',
      orderType: orderType || 'MARKET',
      leverage: leverage || 1,
      marginMode: marginMode || 'CROSS',
      positionSide: positionSide || 'BOTH',
      signalConflictMode,
      riskRewardRatio: ratioValidation.normalized,
      smartFeatures: {
        riskEngine: {
          enabled: Boolean(smartFeatures?.riskEngine?.enabled),
          autoPositionSizing: Boolean(smartFeatures?.riskEngine?.autoPositionSizing),
          riskPerTradePercent: Number(smartFeatures?.riskEngine?.riskPerTradePercent || 1),
          maxDailyLossPercent: Number(smartFeatures?.riskEngine?.maxDailyLossPercent || 3),
          stopAfterConsecutiveLosses: Number(smartFeatures?.riskEngine?.stopAfterConsecutiveLosses || 3),
        },
        marketDetection: {
          enabled: Boolean(smartFeatures?.marketDetection?.enabled),
          autoSwitch: Boolean(smartFeatures?.marketDetection?.autoSwitch),
          switchCooldownCandles: Number(smartFeatures?.marketDetection?.switchCooldownCandles || 5),
          trendStrategy: smartFeatures?.marketDetection?.trendStrategy || 'TREND_FOLLOWING',
          sidewaysStrategy: smartFeatures?.marketDetection?.sidewaysStrategy || 'GRID_RANGE',
        },
        volatilityFilter: {
          enabled: Boolean(smartFeatures?.volatilityFilter?.enabled),
          atrPeriod: Number(smartFeatures?.volatilityFilter?.atrPeriod || 14),
          atrSpikeMultiplier: Number(smartFeatures?.volatilityFilter?.atrSpikeMultiplier || 2.5),
        },
      },
    });

    try {
      const savedBot = await newBot.save();

      makelogbot(savedBot._id, 'status', `Bot ${savedBot.botName} created`);
      logger.info(`[BOT CREATED] ${savedBot.botName} (${savedBot._id})`);

      return res.status(201).json({ message: "Bot created successfully.", bot: savedBot });

    } catch (error) {
      logger.error("[BOT CREATE ERROR]", error);
      return res.status(400).json({
        message: "Failed to create bot.",
        error: error.message,
      });
    }

  } catch (error) {
    // print error to console and logger
    console.error("Error creating bot:", error);
    logger.error("[ERROR] Creating bot failed:", error);
    res.status(500).json({ message: "Error creating bot", error: error });
  }
};

// 📄 Get all bots
exports.getBots = async (req, res) => {
  try {
    const bots = await Bot.find({});
    res.status(200).json(bots);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bots", error: error.message });
  }
};

// 🔍 Get one bot by ID
exports.getBotById = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    const ex = await Exchange.findById(bot.exchange._id.toString());
    const exchange = ex ? ex.name : "Unknown";

    if (!bot) return res.status(404).json({ message: "Bot not found" });


    // send bot data botMode, botName, cooldownPeriod, createdAt, investment, isTestMode,status,strategy, timeframe,tradingPair,updatedAt
    const {
      _id,
      botMode,
      botName,
      cooldownPeriod,
      createdAt,
      investment,
      isTestMode,
      signalConflictMode,
      riskRewardRatio,
      status,
      strategy,
      timeframe,
      tradingPair,
      updatedAt,
      smartFeatures,
      runtimeState,
    } = bot;

    res.status(200).json({
      _id,
      botMode,
      botName,
      cooldownPeriod,
      createdAt,
      investment,
      isTestMode,
      signalConflictMode,
      riskRewardRatio,
      status,
      strategy,
      timeframe,
      tradingPair,
      updatedAt,
      exchange,
      smartFeatures,
      runtimeState,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bot", error: error.message });
  }
};

// ✏️ Update bot
exports.updateBot = async (req, res) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, 'riskRewardRatio')) {
      const ratioValidation = validateRiskRewardRatioInput(req.body.riskRewardRatio);
      if (!ratioValidation.valid) {
        return res.status(400).json({ message: ratioValidation.message });
      }
      req.body.riskRewardRatio = ratioValidation.normalized;
    }

    const updatedBot = await Bot.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBot) return res.status(404).json({ message: "Bot not found" });

    makelogbot(updatedBot._id, 'status', `Bot ${updatedBot.botName} updated`);
    logger.info(`[BOT UPDATED] ${updatedBot.botName} (${updatedBot._id})`);
    res.status(200).json(updatedBot);
  } catch (error) {
    res.status(500).json({ message: "Error updating bot", error: error.message });
  }
};



// ❌ Delete bot
exports.deleteBot = async (req, res) => {
  try {
    const deleted = await Bot.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Bot not found" });

    logger.warn(`[BOT DELETED] ${req.params.id}`);
    res.status(200).json({ message: "Bot deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting bot", error: error.message });
  }
};



// Operations 

// ▶️ Start bot
exports.startBot = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    const exchange = await Exchange.findById(bot.exchange._id.toString());
    if (!exchange) return res.status(404).json({ message: "Exchange not found" });

    if (exchange.platform.toLowerCase() !== 'deriv') {
      return res.status(400).json({
        message: `${exchange.platform} bot runtime is still in progress. Connection and market data are already enabled.`,
      });
    }

    bot.status = "active";
    await bot.save();

    startBot(bot, exchange);

    logger.warn(`[BOT STARTED] ${bot.botName} (${bot._id})`);
    res.status(200).json({ message: "Bot started successfully", bot });

  } catch (error) {
    console.log("Error starting bot:", error);
    logger.error("[ERROR] Starting bot failed:", error);
    res.status(500).json({ message: "Error starting bot", error: error.message });
  }
};

// ⏹️ Stop bot
exports.stopBot = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    stopBot(bot._id);

    bot.status = "stopped";
    await bot.save();

    logger.info(`[BOT STOPPED] ${bot.botName} (${bot._id})`);
    res.status(200).json({ message: "Bot stopped successfully", bot });
  } catch (error) {
    logger.error("[ERROR] Stopping bot failed:", error.message);
    res.status(500).json({ message: "Error stopping bot", error: error.message });
  }
};

// 📊 Get bot status
exports.getBotStatus = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);

    if (!bot) return res.status(404).json({ message: "Bot not found" });
    res.status(200).json({ status: bot.status });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bot status", error: error.message });
  }
};


// get bot logs
exports.getBotLogs = async (req, res) => {
  try {
    const botId = req.params.id;

    const logs = await LogBot.find({ botId: botId }).sort({ timestamp: -1 });
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bot logs", error: error.message });
  }
};


// get bot candles 
exports.getBotCandles = async (req, res) => {
  try {
    const botId = req.params.id;

    // 1. Fetch from DB (sorted newest → oldest)
    const originalCandles = await Candle.find({ botId })
      .sort({ timestamp: -1 })   // newest first (good for DB performance)
      .lean();                   // ← IMPORTANT: return plain JS objects (faster)

    // 3. Send clean, deduplicated, perfectly sorted data
    res.status(200).json(originalCandles);

  } catch (error) {
    logger.error("[ERROR] Fetching bot candles failed:", error.message);
    res.status(500).json({ message: "Error fetching bot candles", error: error.message });
  }
};


// get Markers from TradingMarker collection
exports.getMarkers = async (req, res) => {
  try {
    const markers = await TradingMarker.find({ botId: req.params.id });
    // logger.debug("[MARKERS] Fetched markers:", markers);
    res.status(200).json(markers);
  } catch (error) {
    logger.error("[ERROR] Fetching markers failed:", error.message);
    res.status(500).json({ message: "Error fetching markers", error: error.message });
  }
};