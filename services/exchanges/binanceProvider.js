const crypto = require('crypto');
const { decrypt } = require('../../utils/encryptions');

const SPOT_MAINNET = 'https://api.binance.com';
const SPOT_TESTNET = 'https://testnet.binance.vision';
const FUTURES_MAINNET = 'https://fapi.binance.com';
const FUTURES_TESTNET = 'https://testnet.binancefuture.com';

const DEFAULT_LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50].map((value) => ({ value }));

function getSpotBaseUrl(isTestnet) {
  return isTestnet ? SPOT_TESTNET : SPOT_MAINNET;
}

function getFuturesBaseUrl(isTestnet) {
  return isTestnet ? FUTURES_TESTNET : FUTURES_MAINNET;
}

function toInterval(timeframe) {
  if (!timeframe) return '1m';

  if (typeof timeframe === 'string') {
    if (/^\d+[mhdwM]$/.test(timeframe)) {
      return timeframe;
    }

    const asNumber = Number(timeframe);
    if (!Number.isNaN(asNumber)) {
      return secondsToInterval(asNumber);
    }
  }

  if (typeof timeframe === 'number') {
    return secondsToInterval(timeframe);
  }

  return '1m';
}

function secondsToInterval(seconds) {
  const map = {
    60: '1m',
    180: '3m',
    300: '5m',
    900: '15m',
    1800: '30m',
    3600: '1h',
    7200: '2h',
    14400: '4h',
    21600: '6h',
    28800: '8h',
    43200: '12h',
    86400: '1d',
  };

  return map[seconds] || '1m';
}

function buildQueryString(params) {
  return new URLSearchParams(params).toString();
}

async function signedRequest({ apiKey, apiSecret, baseUrl, path, method = 'GET', params = {} }) {
  if (!apiKey || !apiSecret) {
    throw new Error('Binance API key and secret are required');
  }

  const decryptedApiKey = decrypt(apiKey);
  const decryptedApiSecret = decrypt(apiSecret);

  const timestamp = Date.now();
  const recvWindow = 5000;
  const query = buildQueryString({ ...params, timestamp, recvWindow });
  const signature = crypto.createHmac('sha256', decryptedApiSecret).update(query).digest('hex');
  const url = `${baseUrl}${path}?${query}&signature=${signature}`;

  const response = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': decryptedApiKey,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.msg || 'Binance request failed');
  }

  return data;
}

async function validateCredentials({ apiKey, apiSecret, isTestnet, marketType = 'spot' }) {
  const baseUrl = marketType === 'futures' ? getFuturesBaseUrl(isTestnet) : getSpotBaseUrl(isTestnet);
  const path = marketType === 'futures' ? '/fapi/v2/account' : '/api/v3/account';

  await signedRequest({ apiKey, apiSecret, baseUrl, path });
  return { success: true };
}

async function fetchSymbols({ marketType = 'spot', isTestnet = false } = {}) {
  const baseUrl = marketType === 'futures' ? getFuturesBaseUrl(isTestnet) : getSpotBaseUrl(isTestnet);
  const endpoint = marketType === 'futures' ? '/fapi/v1/exchangeInfo' : '/api/v3/exchangeInfo';
  const response = await fetch(`${baseUrl}${endpoint}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.msg || 'Failed to fetch Binance symbols');
  }

  return (data.symbols || [])
    .filter((symbol) => symbol.status === 'TRADING')
    .map((symbol) => ({
      symbol: symbol.symbol,
      display_name: `${symbol.baseAsset}/${symbol.quoteAsset}`,
      market: symbol.quoteAsset,
      submarket: marketType,
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
    }));
}

async function fetchLeverageOptions() {
  return DEFAULT_LEVERAGE_OPTIONS;
}

async function fetchCandles(symbol, timeframe, startDate, endDate, options = {}) {
  const interval = toInterval(timeframe);
  const marketType = options.marketType || 'spot';
  const isTestnet = Boolean(options.isTestnet);
  const baseUrl = marketType === 'futures' ? getFuturesBaseUrl(isTestnet) : getSpotBaseUrl(isTestnet);
  const endpoint = marketType === 'futures' ? '/fapi/v1/klines' : '/api/v3/klines';

  const params = new URLSearchParams({
    symbol,
    interval,
    startTime: String(Number(startDate) * 1000),
    endTime: String(Number(endDate) * 1000),
    limit: '1000',
  });

  const response = await fetch(`${baseUrl}${endpoint}?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.msg || 'Failed to fetch Binance candles');
  }

  return (Array.isArray(data) ? data : []).map((kline) => ({
    open_time: Math.floor(Number(kline[0]) / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
  }));
}

module.exports = {
  key: 'Binance',
  validateCredentials,
  fetchSymbols,
  fetchLeverageOptions,
  fetchCandles,
};
