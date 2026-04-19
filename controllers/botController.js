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

const isOwnerOrUnassigned = (ownerUserId, user) => !ownerUserId || String(ownerUserId) === String(user?._id || '');

const buildBotQueryForUser = (user) => (user?.role === 'admin' ? {} : { userId: user?._id });

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTradeStatsByBot = async (botIds) => {
  if (!botIds.length) return new Map();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const grouped = await TradingMarker.aggregate([
    {
      $match: {
        botId: { $in: botIds },
        status: 'closed',
      },
    },
    {
      $group: {
        _id: '$botId',
        totalTrades: { $sum: 1 },
        totalPnl: { $sum: { $ifNull: ['$realizedPnL', 0] } },
        totalWins: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ['$realizedPnL', 0] }, 0] }, 1, 0],
          },
        },
        pnl24h: {
          $sum: {
            $cond: [
              { $gte: ['$updatedAt', since24h] },
              { $ifNull: ['$realizedPnL', 0] },
              0,
            ],
          },
        },
      },
    },
  ]);

  return new Map(grouped.map((item) => [String(item._id), item]));
};

const getStatusCounts = (bots) => bots.reduce(
  (acc, bot) => {
    const status = String(bot.status || '').toLowerCase();
    if (status === 'active') acc.active += 1;
    if (status === 'paused' || bot?.runtimeState?.tradingPaused) acc.paused += 1;
    if (status === 'error') acc.error += 1;
    if (status === 'error' || status === 'paused' || bot?.runtimeState?.tradingPaused) acc.attention += 1;
    return acc;
  },
  { active: 0, paused: 0, error: 0, attention: 0 }
);


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
      userId: req.user?._id,
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
    const query = buildBotQueryForUser(req.user);
    const bots = await Bot.find(query).lean();
    const botIds = bots.map((bot) => bot._id);
    const tradeStatsByBot = await getTradeStatsByBot(botIds);

    const enrichedBots = bots.map((bot) => {
      const stats = tradeStatsByBot.get(String(bot._id));
      const totalTrades = toNumber(stats?.totalTrades);
      const totalWins = toNumber(stats?.totalWins);
      return {
        ...bot,
        totalPnl: Number(toNumber(stats?.totalPnl).toFixed(2)),
        totalTrades,
        winRate: totalTrades ? Number(((totalWins / totalTrades) * 100).toFixed(2)) : 0,
      };
    });

    res.status(200).json(enrichedBots);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bots", error: error.message });
  }
};

// 📈 Get aggregate summary for My Bots page
exports.getBotsSummary = async (req, res) => {
  try {
    const query = buildBotQueryForUser(req.user);
    const bots = await Bot.find(query)
      .select('_id status runtimeState createdAt updatedAt')
      .lean();

    const botIds = bots.map((bot) => bot._id);
    const tradeStatsByBot = await getTradeStatsByBot(botIds);

    const statusCounts = getStatusCounts(bots);

    const totals = {
      totalTrades: 0,
      totalWins: 0,
      totalPnl: 0,
      pnl24h: 0,
      profitableBots: 0,
    };

    for (const bot of bots) {
      const stat = tradeStatsByBot.get(String(bot._id));
      const botPnl = toNumber(stat?.totalPnl);

      totals.totalTrades += toNumber(stat?.totalTrades);
      totals.totalWins += toNumber(stat?.totalWins);
      totals.totalPnl += botPnl;
      totals.pnl24h += toNumber(stat?.pnl24h);
      if (botPnl > 0) totals.profitableBots += 1;
    }

    const winRate = totals.totalTrades > 0
      ? (totals.totalWins / totals.totalTrades) * 100
      : 0;

    return res.status(200).json({
      totalBots: bots.length,
      activeBots: statusCounts.active,
      pausedBots: statusCounts.paused,
      errorBots: statusCounts.error,
      attentionBots: statusCounts.attention,
      totalTrades: totals.totalTrades,
      totalPnl: Number(totals.totalPnl.toFixed(2)),
      pnl24h: Number(totals.pnl24h.toFixed(2)),
      winRate: Number(winRate.toFixed(2)),
      profitableBots: totals.profitableBots,
    });
  } catch (error) {
    logger.error('[ERROR] Fetching bots summary failed:', error.message);
    return res.status(500).json({ message: 'Error fetching bots summary', error: error.message });
  }
};

// 📊 Get dashboard aggregate data
exports.getDashboardSummary = async (req, res) => {
  try {
    const query = buildBotQueryForUser(req.user);
    const bots = await Bot.find(query)
      .select('_id botName status tradingPair strategy runtimeState createdAt updatedAt')
      .lean();

    const botIds = bots.map((bot) => bot._id);
    const tradeStatsByBot = await getTradeStatsByBot(botIds);
    const statusCounts = getStatusCounts(bots);

    const recentBots = [...bots]
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5)
      .map((bot) => {
        const stats = tradeStatsByBot.get(String(bot._id));
        return {
          _id: bot._id,
          botName: bot.botName,
          status: bot.status,
          tradingPair: bot.tradingPair,
          strategy: bot.strategy,
          updatedAt: bot.updatedAt,
          createdAt: bot.createdAt,
          totalPnl: Number(toNumber(stats?.totalPnl).toFixed(2)),
        };
      });

    const pairExposureMap = bots.reduce((acc, bot) => {
      const pair = bot.tradingPair || 'Unknown Pair';
      acc[pair] = (acc[pair] || 0) + 1;
      return acc;
    }, {});

    const pairExposure = Object.entries(pairExposureMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([pair, count]) => ({ pair, count }));

    let totalPnl = 0;
    let totalTrades = 0;
    let totalWins = 0;
    let pnl24h = 0;
    let profitableBots = 0;

    for (const bot of bots) {
      const stats = tradeStatsByBot.get(String(bot._id));
      const botPnl = toNumber(stats?.totalPnl);
      totalPnl += botPnl;
      totalTrades += toNumber(stats?.totalTrades);
      totalWins += toNumber(stats?.totalWins);
      pnl24h += toNumber(stats?.pnl24h);
      if (botPnl > 0) profitableBots += 1;
    }

    const topPerformer = recentBots.length
      ? [...recentBots].sort((a, b) => toNumber(b.totalPnl) - toNumber(a.totalPnl))[0]
      : null;

    const logs = botIds.length
      ? await LogBot.find({ botId: { $in: botIds } })
        .sort({ timestamp: -1 })
        .limit(8)
        .lean()
      : [];

    const botNameById = bots.reduce((acc, bot) => {
      acc[String(bot._id)] = bot.botName;
      return acc;
    }, {});

    const recentActivity = logs.map((log) => ({
      _id: log._id,
      botId: log.botId,
      botName: botNameById[String(log.botId)] || 'Unknown bot',
      logType: log.logType,
      message: log.message,
      timestamp: log.timestamp,
      actionRequired: Boolean(log.actionRequired),
    }));

    return res.status(200).json({
      totals: {
        totalBots: bots.length,
        activeBots: statusCounts.active,
        pausedBots: statusCounts.paused,
        errorBots: statusCounts.error,
        attentionBots: statusCounts.attention,
        profitableBots,
        totalTrades,
        totalPnl: Number(totalPnl.toFixed(2)),
        pnl24h: Number(pnl24h.toFixed(2)),
        averagePnl: bots.length ? Number((totalPnl / bots.length).toFixed(2)) : 0,
        winRate: totalTrades ? Number(((totalWins / totalTrades) * 100).toFixed(2)) : 0,
      },
      topPerformer,
      pairExposure,
      recentBots,
      recentActivity,
    });
  } catch (error) {
    logger.error('[ERROR] Fetching dashboard summary failed:', error.message);
    return res.status(500).json({ message: 'Error fetching dashboard summary', error: error.message });
  }
};

// 🔍 Get one bot by ID
exports.getBotById = async (req, res) => {
  try {
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view this bot.' });
    }

    const ex = await Exchange.findById(bot.exchange._id.toString());
    const exchange = ex ? ex.name : "Unknown";


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

    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to update this bot.' });
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
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to delete this bot.' });
    }

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
    if (req.user?.approvalStatus && req.user.approvalStatus !== 'approved') {
      return res.status(403).json({
        message: 'Account approval is pending. Trading is disabled until an admin approves your account.',
      });
    }

    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to start this bot.' });
    }

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

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to stop this bot.' });
    }

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
    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view this bot status.' });
    }
    res.status(200).json({ status: bot.status });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bot status", error: error.message });
  }
};


// get bot logs
exports.getBotLogs = async (req, res) => {
  try {
    const botId = req.params.id;
    const bot = await Bot.findById(botId);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view these bot logs.' });
    }

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
    const bot = await Bot.findById(botId);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view these bot candles.' });
    }

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
    const bot = await Bot.findById(req.params.id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });

    if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(bot.userId, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view these markers.' });
    }

    const markers = await TradingMarker.find({ botId: req.params.id });
    // logger.debug("[MARKERS] Fetched markers:", markers);
    res.status(200).json(markers);
  } catch (error) {
    logger.error("[ERROR] Fetching markers failed:", error.message);
    res.status(500).json({ message: "Error fetching markers", error: error.message });
  }
};