const Bot = require('../models/Bot');
const Exchange = require('../models/Exchange');
const LogBot = require('../models/LogsBots');
const Candle = require('../models/Candle');
const TradingMarker = require('../models/TradingMarker');

const User = require('../models/User');
const { connectDeriv } = require('../services/deriv/connect');
const logger = require('../utils/logger');

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
      signalConflictMode,
    } = req.body;

    // ✅ Validate required fields
    if (!botName || !exchange || !tradingPair || !timeframe || !strategy || !investment) {
      logger.warn("[BOT CREATE] Missing required fields");
      return res.status(400).json({ message: "Missing required bot configuration fields." });
    }

    // fetch platform from exchange by id 
    const exchangeRecord = await Exchange.findById(exchange);

    if (!exchangeRecord) {
      logger.warn(`[BOT CREATE] Exchange not found: ${exchange.name}`);
      return res.status(404).json({ message: "Exchange not found." });
    }

    // ✅ Optional: Verify Deriv connection if exchange.platform === 'Deriv'
    if (exchangeRecord.platform.toLowerCase() === 'deriv' && exchangeRecord.derivToken) {
      try {
        await connectDeriv(exchangeRecord.derivToken);
        logger.info(`[Deriv] Connection verified for ${exchangeRecord.name || 'Deriv Account'}`);
      } catch (error) {
        logger.error(`[Deriv] Invalid token for ${exchangeRecord.name}: ${error.message}`);
        return res.status(400).json({ message: "Invalid Deriv token." });
      }
    }

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
      multiplier,
      signalConflictMode,
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
    const { _id, botMode, botName, cooldownPeriod, createdAt, investment, isTestMode, signalConflictMode, status, strategy, timeframe, tradingPair, updatedAt } = bot;

    res.status(200).json({ _id, botMode, botName, cooldownPeriod, createdAt, investment, isTestMode, signalConflictMode, status, strategy, timeframe, tradingPair, updatedAt, exchange });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bot", error: error.message });
  }
};

// ✏️ Update bot
exports.updateBot = async (req, res) => {
  try {
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
    const exchange = await Exchange.findById(bot.exchange._id.toString());

    // console.log("Fetched exchange for bot start:", exchange);

    if (!bot) return res.status(404).json({ message: "Bot not found" });

    bot.status = "active";
    await bot.save();

    startBot(bot, exchange.apiToken);

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