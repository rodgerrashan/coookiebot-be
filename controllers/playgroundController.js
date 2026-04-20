const { getCandleHistory } = require('../services/deriv/candlesService');
const { simulateTrade } = require("../services/playgroundservice");
const { availablePatterns } = require("../services/patterns/index");
const logger = require('../utils/logger');
const { getExchangeProvider } = require('../services/exchanges/factory');
const { validateRiskRewardRatioInput } = require('../utils/riskRewardRatio');


const platforms = [
  { _id: 1, name: "Deriv", ava: true, code: "DRV" },
  { _id: 2, name: "Binance", ava: true, code: "BNC" },
  { _id: 3, name: "MetaTrader", ava: false, code: "MTD" },
]

function platformCodeToName(platformCode) {
  const code = String(platformCode || '').toUpperCase();
  if (code === 'DRV') return 'Deriv';
  if (code === 'BNC') return 'Binance';
  return null;
}


// Get Available platforms
exports.getPlatforms = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      platforms
    });
  } catch (error) {
    logger.error();
  }
}


// POST: Get symbols from Deriv and send
exports.getSymbols = async (req, res) => {
  try {
    const { platform, market, search } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: platform",
      });
    }

    const platformName = platformCodeToName(platform);
    if (!platformName) {
      return res.status(400).json({
        success: false,
        message: "Unsupported platform code",
      });
    }

    // Log for debugging
    logger.info(`Fetching symbols for platform: ${platform}`);

    const provider = getExchangeProvider(platformName);
    let symbols = await provider.fetchSymbols();

    if (market && market !== "all") {
      symbols = symbols.filter((s) => s.market === market);
    }

    if (search && String(search).trim()) {
      const query = String(search).trim().toLowerCase();
      symbols = symbols.filter(
        (s) =>
          s.display_name?.toLowerCase().includes(query) ||
          s.symbol?.toLowerCase().includes(query)
      );
    }

    symbols = symbols.sort((a, b) => {
      if ((a.market || '') !== (b.market || '')) return (a.market || '').localeCompare(b.market || '');
      if ((a.submarket || '') !== (b.submarket || '')) return (a.submarket || '').localeCompare(b.submarket || '');
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

    const marketMap = new Map();
    symbols.forEach((s) => {
      if (!marketMap.has(s.market)) {
        marketMap.set(s.market, {
          value: s.market,
          name: s.market,
          count: 0,
          submarkets: new Set(),
        });
      }

      const current = marketMap.get(s.market);
      current.count += 1;
      if (s.submarket) current.submarkets.add(s.submarket);
    });

    const markets = [
      { value: "all", name: "All Markets", count: symbols.length, submarkets: [] },
      ...Array.from(marketMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
          value: m.value,
          name: m.name,
          count: m.count,
          submarkets: Array.from(m.submarkets).sort(),
        })),
    ];

    return res.status(200).json({
      success: true,
      symbols,
      markets,
    });
  } catch (error) {
    logger.error("Error fetching symbols:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch symbols",
      error: error.message,
    });
  }
};


exports.getMultipliers = async (req, res) => {
  try {
    const { symbol, platform } = req.body;
    if (!symbol || !platform) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const platformName = platformCodeToName(platform);
    if (!platformName) {
      return res.status(400).json({
        success: false,
        message: "Unsupported platform code",
      });
    }

    const provider = getExchangeProvider(platformName);
    const multipliersArray = await provider.fetchLeverageOptions(symbol);

    return res.status(200).json({
      success: true,
      multipliers: multipliersArray,
    });

  } catch (error) {
    logger.error("Error fetching multipliers", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch multipliers",
      error: error.message,
    });
  }
};


exports.getAvailablePatterns = async (req, res) => {
  try {
    const patterns = await availablePatterns();
    return res.status(200).json({
      success: true,
      patterns,
    });
  } catch (error) {
    logger.error("Error in fetching available patterns");

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });

  }
}


/// Get: Backtest Result
exports.getBacktestResults = async (req, res) => {
  try {

    const {
      platform,
      symbol,
      timeframe,
      pattern,
      stake,
      multiplier,
      bot,
      startDate,
      endDate,
      signalConflictMode,
      riskRewardRatio,
    } = req.body;

    if (!platform || !symbol || !pattern || !stake || !timeframe || !bot || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const stakeNum = Number(stake)
    const leverageNum = Number(multiplier || 1);
    const ratioValidation = validateRiskRewardRatioInput(riskRewardRatio || '1:2');
    if (!ratioValidation.valid) {
      return res.status(400).json({
        success: false,
        message: ratioValidation.message,
      });
    }

    const platformName = platformCodeToName(platform);
    if (!platformName) {
      return res.status(400).json({
        success: false,
        message: "Unsupported platform code",
      });
    }

    const provider = getExchangeProvider(platformName);

    logger.info(`[INFO] Fetching historical candles for ${symbol}, timeframe: ${timeframe}`);

    const candles = platformName === 'Deriv'
      ? await getCandleHistory(symbol, Number(timeframe), Number(startDate), Number(endDate))
      : await provider.fetchCandles(symbol, timeframe, startDate, endDate);

    // Simulate trades
    const tradeSimulateResults = simulateTrade(
      candles,
      pattern,
      stakeNum,
      leverageNum,
      1000,
      signalConflictMode || "allow_parallel",
      ratioValidation.normalized
    );

    // logger.debug("[RESULT]", tradeSimulateResults);

    return res.status(200).json({
      success: true,
      tradeSimulateResults,
    });


  } catch (error) {
    logger.error(`[Controller] Error fetching backtest results: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};


// Post: historical candles 
exports.getCandleHistory = async (req, res) => {
  try {
    // Extract params from request
    const { platform, symbol, timeframe, startDate, endDate } = req.body;

    // Validation
    if (!symbol || !timeframe || !platform || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: symbol, timeframe, start date, end date, platform",
      });
    }

    logger.info(`[INFO] Fetching historical candles for ${symbol}, granularity: ${timeframe}`);

    const platformName = platformCodeToName(platform);
    if (!platformName) {
      return res.status(400).json({
        success: false,
        message: "Unsupported platform code",
      });
    }

    const provider = getExchangeProvider(platformName);
    const candles = platformName === 'Deriv'
      ? await getCandleHistory(symbol, Number(timeframe), Number(startDate), Number(endDate))
      : await provider.fetchCandles(symbol, timeframe, startDate, endDate);

    // Success response
    return res.status(200).json({
      success: true,
      symbol,
      timeframe,
      count: candles.length,
      data: candles
    });

  } catch (error) {
    logger.error(`[Controller] Error fetching candle history: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};
