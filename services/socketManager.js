// services/socketManager.js
const logger = require('../utils/logger');

// Store subscriptions: Map<topic, Set<webSocket>>
const subscriptions = new Map();

const socketManager = {
    /**
     * Subscribes a socket to a specific topic
     */
    subscribe: (ws, topic, id) => {
        if (!subscriptions.has(topic)) {
            subscriptions.set(topic, new Set());
        }
        subscriptions.get(topic).add(ws);
        logger.info(`Socket subscribed to: ${topic}`);
    },

    /**
     * Unsubscribes a socket from a specific topic
     */
    unsubscribe: (ws, topic) => {
        if (subscriptions.has(topic)) {
            subscriptions.get(topic).delete(ws);
            if (subscriptions.get(topic).size === 0) {
                subscriptions.delete(topic);
            }
        }
    },

    /**
     * Removes a socket from ALL subscriptions (on disconnect)
     */
    unsubscribeAll: (ws) => {
        subscriptions.forEach((clients, topic) => {
            clients.delete(ws);
            if (clients.size === 0) subscriptions.delete(topic);
        });
        logger.info(`Socket cleared from all subscriptions`);
    },

    /**
     * Sends data only to clients subscribed to a specific topic
     */
    publish: (topic, data) => {
        const clients = subscriptions.get(topic);
        if (clients) {
            const message = JSON.stringify({ topic, data, timestamp: new Date() });
            clients.forEach((client) => {
                if (client.readyState === 1) { 
                    client.send(message);
                }
            });
        }
    }
};

module.exports = socketManager;