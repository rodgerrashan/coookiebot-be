// services/deriv/candlesService.js
const { connectDeriv, setupHeartbeat, connectDerivWithRetry } = require('./connect');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryptions');
require('dotenv').config();

// get .env values
require('dotenv').config();



let lastCandle = null;

function handleCandle(candle, onCandle) {
  // this helps to detect when a new candle starts
  if (!lastCandle) {
    lastCandle = candle;
    return;
  }

  // New candle started?
  if (candle.open_time !== lastCandle.open_time) {
    // previous candle is complete
    onCandle(lastCandle);
  }

  lastCandle = candle;
}



const WebSocket = require('ws');
// bot , token, onCandle
const subscribeCandles = async (symbol, granularity, token, botid, onCandle) => {
  return new Promise(async (resolve, reject) => {
    try {

      const req = JSON.stringify({
        ticks_history: symbol,
        style: "candles",
        end: "latest",
        count: 1,
        granularity: granularity,
        subscribe: 1
      })

      let ws = await connectDerivWithRetry(token);

      setupHeartbeat(ws.socket, ws.socketId);

      // Wait for connectDeriv to return an open or new WebSocket
      resolve({
        socket: ws.socket
      });

      logger.info(`[WS] Socket obtained for ${symbol} (${granularity}), state: ${ws.socket.readyState}`);

      // --- If already open, send immediately
      if (ws.socket.readyState === WebSocket.OPEN) {
        logger.info(`[WS] Already connected for ${symbol} (${granularity})`);
        ws.socket.send(req);
        resolve({
          socket: ws.socket
        });
      }

      // --- Otherwise, wait until it opens
      else {
        ws.socket.once('open', () => {
          logger.info(`[WS] Connected for ${symbol} (${granularity})`);
          ws.socket.send(req);
          resolve({
            socket: ws.socket
          });
        });
      }

      ws.socket.on('message', (msg) => {
        try {
          const data = JSON.parse(msg); 

          // --- 1. Historical candles (first response) ---
          if ((data.msg_type === 'history' || data.msg_type === 'candles') && data.candles) {
            const latestCandle = data.candles[data.candles.length - 1];
            // logger.debug(`[WS] Historical latest candle for ${symbol}: ${JSON.stringify(latestCandle)}`);
            onCandle(latestCandle); // Pass it to your callback
          }

          // --- 2. New live candle (OHLC) ---
          if (data.msg_type === 'ohlc' && data.ohlc) {
            const candle = data.ohlc;
            // logger.debug(`[WS] New candle for ${symbol}: ${JSON.stringify(candle)}`);

            // check candle is complete or not
            handleCandle(candle, onCandle);

            // Check if the candle is complete
            // if (candle.epoch % candle.granularity === 0) {
            //     // logger.info(`[WS] Candle completed for ${symbol}: ${JSON.stringify(candle)}`);
            //     onCandle(candle);
            // } 

          }

          // --- 3. Tick updates ---
          if (data.msg_type === 'tick' && data.tick) {
            const tick = data.tick;
            logger.debug(`[WS] Tick received for ${symbol}: ${JSON.stringify(tick)}`);
            // You can also trigger any tick-specific calculations here
          }

          // --- 4. Optional: Other responses (error, info, etc.) ---
          if (data.msg_type === 'error') {
            logger.warn(`[WS] Error message for ${symbol}: ${data.error?.message}`);
          }

        } catch (err) {
          logger.error(`[WS] Failed to parse WS message: ${err.message}`);
        }
      });


      // --- Error handler
      ws.socket.on('error', (err) => {
        logger.warn(`[WS] Error on ${symbol}: ${err.message}`);
        reject(err);
      });

      // --- Close handler
      ws.socket.on('close', async () => {
        logger.warn(`[WS] Connection closed`);
        reject(new Error('WebSocket connection closed'));

      });

    } catch (error) {
      logger.warn(`[WS] Failed to subscribe candles for ${symbol}: ${error.message}`);
      
    }

  });
};


// Unsubscribe function stays the same
const unsubscribeCandles = (ws) => {
  try {
    ws.socket.send(JSON.stringify({ forget_all: 'candles' }));
    ws.socket.close();
  } catch (err) {
    logger.warn(`[WS] Error unsubscribing: ${err.message}`);
  }
};


// Get Available Symbols
const getSymbolsDeriv = async () => {
  return new Promise(async (resolve, reject) => {
    try {
      const ws = await connectDeriv(process.env.READONLY_TOKEN);

      ws.socket.send(JSON.stringify({ active_symbols: "brief" }));

      ws.socket.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          return reject("Invalid JSON received from WebSocket");
        }

        // Log unexpected messages
        if (!data.msg_type) {
          console.log("[WS] Unknown message:", data);
        }

        if (data.error) {
          ws.socket.close();
          return reject(data.error.message);
        }

        // We only care about active_symbols
        if (data.msg_type === "active_symbols") {
          if (!Array.isArray(data.active_symbols)) {
            ws.socket.close();
            return reject("active_symbols response missing array");
          }

          const symbols = data.active_symbols.map((s) => ({
            symbol: s.symbol,
            display_name: s.display_name,
            market: s.market,
            submarket: s.submarket,
            pip: s.pip,
          }));

          ws.socket.close();
          return resolve(symbols);
        }
      };

      ws.socket.onerror = (err) => {
        ws.socket.close();
        reject(`WebSocket Error: ${err.message}`);
      };
    } catch (err) {
      reject(err.message);
    }
  });
};



const getMultipliersDeriv = async (symbol) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: decrypt(process.env.READONLY_TOKEN) }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.msg_type === "authorize") {
        ws.send(JSON.stringify({
          contracts_for: symbol,
          currency: "USD",
          product_type: "basic",
          landing_company: "svg",
        }));
        return;
      }

      if (data.msg_type === "contracts_for") {
        const multipliers = [];
        const available = data.contracts_for?.available || [];

        available
          .filter(c => c.contract_category === "multiplier")
          .forEach(c => c.multiplier_range?.forEach(m => multipliers.push(m)));

        resolve({
          multipliers: [...new Set(multipliers)].sort((a, b) => a - b),
        });

        ws.close();
      }

      if (data.error) {
        reject(data.error.message);
        ws.close();
      }
    };

    ws.onerror = (err) => reject(err.message);
  });
};



const getCandleHistory = async (symbol, granularity = 60, startDate, endDate) => {
  return new Promise(async (resolve, reject) => {
    try {
      // connect to Deriv websocket using readonly token
      const ws = await connectDeriv(process.env.READONLY_TOKEN);

      // Deriv candle history request
      const req = {
        ticks_history: symbol,
        style: 'candles',
        start: startDate,
        end: endDate,
        granularity: granularity,
        count: 10000,
      };

      const sendWhenReady = () => {
        logger.info(
          `[WS] Requesting historical data for ${symbol} from ${startDate} to ${endDate} (${granularity}s)`
        );
        ws.socket.send(JSON.stringify(req));
      };

      if (ws.socket.readyState === WebSocket.OPEN) {
        sendWhenReady();
      } else {
        ws.socket.once('open', sendWhenReady);
      }

      // handle incoming messages
      ws.socket.on('message', (msg) => {
        const data = JSON.parse(msg);

        if (data.error) {
          logger.error(`[WS] Deriv history error: ${data.error.message}`);
          ws.socket.close();
          return reject(new Error(data.error.message));
        }

        if (data.candles) {
          ws.socket.close();
          logger.info(`[WS] Received ${data.candles.length} candles for ${symbol}`);
          resolve(data.candles);
        }
      });

      // handle websocket errors
      ws.socket.on('error', (err) => {
        ws.socket.close();
        reject(err);
      });

      ws.socket.on('close', () => {
        logger.debug(`[WS] Connection closed for ${symbol}`);
      });

    } catch (err) {
      reject(err);
    }
  });
};



module.exports = { subscribeCandles, unsubscribeCandles, getCandleHistory, getSymbolsDeriv, getMultipliersDeriv };
