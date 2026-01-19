// utils/deriv/connectDeriv.js
const WebSocket = require("ws");
const logger = require("../../utils/logger");
const { decrypt } = require("../../utils/encryptions");
require("dotenv").config();

const sockets = new Map();

const CONNECT_TIMEOUT = 10_000;

const HEARTBEAT_INTERVAL = 30_000; // 10 seconds
const HEARTBEAT_TIMEOUT = 10_000;   // 30 seconds

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;


const connectDeriv = (token, socketId = `deriv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`) => {

  return new Promise((resolve, reject) => {
    // Reuse fully authorized connection
    // Number of sockets
    logger.warn(`[Deriv:${socketId}] Number of sockets: ${sockets.size}`);
    const existing = sockets.get(socketId);
    if (existing?.readyState === WebSocket.OPEN && existing.isAuthorized) {
      logger.info(`[Deriv:${socketId}] Reusing authorized connection (${existing.loginid})`);
      return resolve({
        socket: existing,
        loginid: existing.loginid,
        authorize: existing.authorizeData
      });
    }

    // Cleanup stale connection
    if (existing) {
      logger.warn(`[Deriv:${socketId}] Terminating stale connection`);
      existing.terminate();
      sockets.delete(socketId);
    }

    let decryptedToken;
    try {
      decryptedToken = decrypt(token);
    } catch (err) {
      return reject(new Error("Failed to decrypt token"));
    }

    const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=${process.env.DERIV_APP_ID}`;
    const ws = new WebSocket(wsUrl);

    ws.isAuthorized = false;
    ws.loginid = null;
    ws.authorizeData = null;
    ws.socketId = socketId;

    sockets.set(socketId, ws);

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      sockets.delete(socketId);
      logger.error(`[Deriv:${socketId}] Authorization timeout`);
      reject(new Error("Authorization timeout"));

    }, CONNECT_TIMEOUT);

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      ws.removeAllListeners();
    };

    const handleAuthorize = (data) => {
      if (settled) return;

      if (data.error) {
        cleanup();
        sockets.delete(socketId);
        logger.error(`[Deriv:${socketId}] Auth failed: ${data.error.message}`);
        reject(new Error(data.error.message));
        return;
      }

      if (data.msg_type === "authorize") {
        ws.isAuthorized = true;
        ws.loginid = data.authorize.loginid;
        ws.authorizeData = data.authorize;

        cleanup();
        logger.info(`[Deriv:${socketId}] Authorized → ${ws.loginid}`);

        resolve({
          socket: ws,
          loginid: ws.loginid,
          authorize: ws.authorizeData,
          socketId: ws.socketId
        });
      }
    };

    ws.on("open", () => {
      logger.info(`[Deriv:${socketId}] Connected, sending authorize...`);
      ws.send(JSON.stringify({ authorize: decryptedToken }));
    });

    ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        logger.error(`[Deriv:${socketId}] Invalid JSON`);
        return;
      }

      if (data.msg_type === "authorize" || data.error) {
        // ws.off("message", handleAuthorize);
        handleAuthorize(data);
      }
    });

    ws.once("error", (err) => {
      if (settled) return;
      cleanup();
      sockets.delete(socketId);
      logger.error(`[Deriv:${socketId}] WS Error: ${err.message}`);
      reject(err);
    });

    ws.on("close", () => {
      logger.warn(`[Deriv:${socketId}] Connection closed`);
      if (!ws.isAuthorized) {
        sockets.delete(socketId);
      }
    });
  });
};

// Optional: Close specific connection
const closeDeriv = (socketId) => {
  const ws = sockets.get(socketId);
  if (ws) {
    ws.isAuthorized = false;
    ws.close();
    sockets.delete(socketId);
    logger.info(`[Deriv:${socketId}] Closed by request`);
  }
};



//  Heart beat signal gen
const setupHeartbeat = (ws, socketId) => {
  let heartbeatTimeout;

  const ping = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ping: 1 }));
      heartbeatTimeout = setTimeout(() => {
        logger.warn(`[Deriv:${socketId}] Heartbeat missed, terminating socket`);
        ws.terminate();
        sockets.delete(socketId);
      }, HEARTBEAT_TIMEOUT);
    }
  };

  const pongHandler = (data) => {
    if (data.msg_type === "ping") {
      logger.info(`[Deriv:${socketId}] Heartbeat pong received`);
      clearTimeout(heartbeatTimeout);
    }
  };

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw);
      pongHandler(data);
    } catch (err) {}
  });

  logger.info(`[Deriv:${socketId}] Heartbeat setup, interval: ${HEARTBEAT_INTERVAL}ms`);
  const interval = setInterval(ping, HEARTBEAT_INTERVAL);

  ws.on("close", () => clearInterval(interval));
  ws.on("error", () => clearInterval(interval));
};



// Auto Reconnect logic
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const connectDerivWithRetry = async (
  token,
  {
    maxRetries = 5,
    baseDelay = 1000,     
    maxDelay = 10000      
  } = {}
) => {
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    const socketId = `deriv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      logger.info(`[Deriv:${socketId}] Connect attempt ${attempt + 1}/${maxRetries + 1}`);
      return await connectDeriv(token, socketId);
    } catch (err) {
      lastError = err;
      attempt++;

      logger.warn(
        `[Deriv:${socketId}] Connect failed (${err.message})`
      );

      if (attempt > maxRetries) {
        break;
      }

      // Exponential backoff with cap
      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);

      logger.warn(`[Deriv:${socketId}] Retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  logger.error(`Deriv connection failed after ${maxRetries + 1} attempts`);
  throw lastError;
};



module.exports = { connectDeriv, closeDeriv, sockets, setupHeartbeat, connectDerivWithRetry };