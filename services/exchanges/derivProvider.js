const { connectDeriv } = require('../deriv/connect');
const {
  getSymbolsDeriv,
  getMultipliersDeriv,
  getCandleHistory,
  subscribeCandles,
} = require('../deriv/candlesService');
const { placeTrade, sellContract } = require('../deriv/tradeService');

async function validateCredentials({ apiToken }) {
  if (!apiToken) {
    throw new Error('Deriv token is required');
  }

  const result = await connectDeriv(apiToken);
  result.socket.close();
  return { success: true, loginid: result.loginid };
}

async function fetchSymbols() {
  return getSymbolsDeriv();
}

async function fetchLeverageOptions(symbol) {
  const data = await getMultipliersDeriv(symbol);
  const values = Array.isArray(data?.multipliers) ? data.multipliers : [];
  return values.map((value) => ({ value }));
}

async function fetchCandles(symbol, timeframe, startDate, endDate) {
  return getCandleHistory(symbol, Number(timeframe), Number(startDate), Number(endDate));
}

async function subscribeMarketData({ symbol, timeframe, apiToken, botId, onCandle }) {
  return subscribeCandles(symbol, timeframe, apiToken, botId, onCandle);
}

async function createOrder({ apiToken, botId, payload }) {
  return placeTrade(apiToken, botId, payload);
}

async function closeOrder({ apiToken, botId, orderId }) {
  return sellContract(apiToken, botId, orderId);
}

module.exports = {
  key: 'Deriv',
  validateCredentials,
  fetchSymbols,
  fetchLeverageOptions,
  fetchCandles,
  subscribeMarketData,
  createOrder,
  closeOrder,
};
