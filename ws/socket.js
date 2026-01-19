// socket.js
const WebSocket = require('ws');
const socketManager = require('../services/socketManager');
const logger = require('../utils/logger');

const initWebSocket = (server) => {
    const wss = new WebSocket.Server({ server });

    logger.info('WebSocket server initialized');

    wss.on('connection', (ws) => {
        ws.isAlive = true;

        ws.on('message', (message) => {
            try {
                const { action, topic, id } = JSON.parse(message);
                logger.debug(`WS Message Received: action=${action}, topic=${topic}, id=${id}`);
                const fullTopic = id ? `${topic}-${id}` : topic;

                switch (action) {
                    case 'SUBSCRIBE':
                        socketManager.subscribe(ws, fullTopic);
                        break;
                    case 'UNSUBSCRIBE':
                        socketManager.unsubscribe(ws, fullTopic);
                        break;
                }
            } catch (err) {
                logger.error('WS Message Error:', err.message);
            }
        });

        ws.on('close', () => socketManager.unsubscribeAll(ws));
        ws.on('pong', () => { ws.isAlive = true; });
    });

    return wss;
};

module.exports = { initWebSocket };