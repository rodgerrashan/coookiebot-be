// services/deriv/ticksService.js
const logger = require('../../utils/logger');
const { connectDeriv } = require('./connect');
// appId in env

const subscribeTicks = (symbol, token,  onTick) => {

    const ws = connectDeriv(token);

    ws.on('open', () => {
        ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    });

    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        logger.info('Tick data received:', data);
        if (data.tick) {
            onTick(data.tick);
        }
    });

    return ws;
};

const unsubscribeTicks = (ws) => {
    ws.send(JSON.stringify({ forget_all: 'ticks' }));
    ws.close();
};

module.exports = { subscribeTicks, unsubscribeTicks };
