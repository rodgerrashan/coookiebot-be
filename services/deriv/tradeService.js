const { connectDeriv,connectDerivWithRetry } = require('./connect');
const logger = require('../../utils/logger');
const { makelogbot } = require('../../services/logsBotsServices');

/**
 * Place a trade with proper PROPOSAL -> BUY
 * Supports:
 * - CALL / PUT
 * - MULTUP / MULTDOWN (Multipliers)
 */
const placeTrade = async (token, botId, payload) => {
    return new Promise(async (resolve, reject) => {
        try {

            logger.debug(`Payload`, payload);
            const ws = await connectDerivWithRetry(token);

            const send = (data) => {
                if (ws.socket.readyState === ws.socket.OPEN) ws.socket.send(JSON.stringify(data));
                else ws.socket.onopen = () => ws.socket.send(JSON.stringify(data));
            };

            // 1️⃣ Send proposal first
            const proposalRequest = payload.parameters;
            logger.info(`[Trade] Sending Proposal: ${JSON.stringify(proposalRequest)}`);
            send(proposalRequest);

            ws.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                // logger.debug(`[Trade] WS Message: ${JSON.stringify(data)}`);

                // 2️⃣ Proposal received → execute BUY
                if (data.proposal) {
                    const proposal_id = data.proposal.id;
                    logger.info(`[Trade] Proposal OK | proposal_id: ${proposal_id}`);

                    const buyRequest = {
                        buy: proposal_id,
                        price: data.proposal.ask_price,   // stake / max cost
                    };

                    logger.info(`[Trade] Sending BUY: ${JSON.stringify(buyRequest)}`);
                    send(buyRequest);
                }

                // 3️⃣ Buy executed
                if (data.buy) {
                    logger.info(`[Trade] BUY EXECUTED ✅ Contract ID: ${data.buy.contract_id}`);
                    makelogbot(botId, 'trade', `Placed BUY trade: ${data.buy.contract_id}`);
                    return resolve(data.buy);
                }

                // 4️⃣ Buy failed
                if (data.buy && data.buy.error) {
                    logger.warn(`[Trade] BUY FAILED ❌ ${data.buy.error.message}`);
                    return reject(data.buy.error);
                }

                // //  subscription response
                // if (data.subscription) {
                //     logger.info(`[Trade] Subscription update: ${JSON.stringify(data)}`);
                // }

                // ❌ Error handling
                if (data.error) {
                    logger.warn(`[Trade] FAILED ❌ ${data.error.message}`);
                    return reject(data.error);
                }
            };

            ws.socket.onerror = (err) => reject(err);
            ws.socket.onclose = () => logger.warn('[Trade] WS Closed');

        } catch (err) {
            reject(err);
        }
    });
};


/**
 * SELL contract (Multiplier close OR Binary close before expiration)
 */
const sellContract = async (token, botId, contract_id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const ws = await connectDeriv(token);

            const send = (data) => {
                if (ws.socket.readyState === ws.socket.OPEN) ws.socket.send(JSON.stringify(data));
                else ws.socket.onopen = () => ws.socket.send(JSON.stringify(data));
            };

            const sellRequest = { sell: contract_id, price: 0 };
            logger.info(`[Trade] Sending SELL: ${JSON.stringify(sellRequest)}`);
            send(sellRequest);

            ws.socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.sell) {
                    logger.info(`[Trade] SELL EXECUTED ✅ Payout: ${data.sell.payout}`);
                    makelogbot(botId, 'trade', `Placed SELL trade: ${data.sell.contract_id}`);
                    resolve(data.sell);
                }

                if (data.error) {
                    logger.error(`[Trade] SELL FAILED ❌ ${data.error.message}`);
                    reject(data.error);
                }
            };

            ws.socket.onerror = (err) => reject(err);

        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { placeTrade, sellContract };
