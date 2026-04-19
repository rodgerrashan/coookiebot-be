const derivProvider = require('./derivProvider');
const binanceProvider = require('./binanceProvider');

const providers = {
  deriv: derivProvider,
  binance: binanceProvider,
};

function getExchangeProvider(platform) {
  const key = String(platform || '').toLowerCase();
  const provider = providers[key];

  if (!provider) {
    throw new Error(`Unsupported exchange platform: ${platform}`);
  }

  return provider;
}

module.exports = {
  getExchangeProvider,
};
