const Exchange = require('../models/Exchange');
require('dotenv').config();
const { encrypt } = require('../utils/encryptions');
const logger = require('../utils/logger');
const { getExchangeProvider } = require('../services/exchanges/factory');



// --- GET: Fetch all exchanges ---
exports.getAllExchanges = async (req, res) => {
    try {
        const exchanges = await Exchange.find(); // Filter by user later

        res.status(200).json(
            exchanges.map(ex => ({
                _id: ex._id,
                name: ex.name,
                platform: ex.platform,
                status: ex.status,
                isTestnet: ex.isTestnet,
                statusCheckedAt: ex.statusCheckedAt,
                createdAt: ex.createdAt,

            }))
        );
    } catch (error) {
        logger.error("Error fetching exchanges", error);
        res.status(500).json({ message: 'Error fetching exchanges', error: error.message });
    }
};


exports.createExchange = async (req, res) => {
    const { platform, name, apiSecret, apiKey, isTestnet = true } = req.body;

    const normalizedPlatform = String(platform || '').trim();
    const isDeriv = normalizedPlatform.toLowerCase() === 'deriv';
    const isBinance = normalizedPlatform.toLowerCase() === 'binance';

    if (!normalizedPlatform || !name) {
        return res.status(400).json({ message: 'Platform and name are required.' });
    }

    if (isDeriv && !apiSecret) {
        return res.status(400).json({ message: 'Deriv token is required.' });
    }

    if (isBinance && (!apiKey || !apiSecret)) {
        return res.status(400).json({ message: 'Binance API key and API secret are required.' });
    }

    try {
        const provider = getExchangeProvider(normalizedPlatform);
        const encryptedToken = isDeriv ? encrypt(apiSecret) : null;
        const encryptedKey = isBinance ? encrypt(apiKey) : null;
        const encryptedSecret = isBinance ? encrypt(apiSecret) : null;

        await provider.validateCredentials({
            apiToken: encryptedToken,
            apiKey: encryptedKey,
            apiSecret: encryptedSecret,
            isTestnet: Boolean(isTestnet),
        });

        const newExchange = new Exchange({
            platform: normalizedPlatform,
            name,
            apiToken: encryptedToken,
            apiKey: encryptedKey,
            apiSecret: encryptedSecret,
            isTestnet: Boolean(isTestnet),
            status: 'Connected',
            statusCheckedAt: new Date(),
        });

        const savedExchange = await newExchange.save();

        res.status(201).json({
            message: `${normalizedPlatform} account connected successfully!`,
            exchange: {
                _id: savedExchange._id,
                platform: savedExchange.platform,
                name: savedExchange.name,
                status: savedExchange.status,
                isTestnet: savedExchange.isTestnet,
            }
        });

    } catch (error) {
        logger.error('[ERROR] Error creating exchange:', error);
        const statusCode = String(error.message || '').includes('Unsupported exchange platform') ? 400 : 500;
        res.status(statusCode).json({ message: 'Error saving exchange', error: error.message });
    }
};


// --- DELETE: Remove exchange connection ---
exports.deleteExchange = async (req, res) => {
    try {
        const exchange = await Exchange.findById(req.params.id);
        if (!exchange) {
            return res.status(404).json({ message: 'Exchange connection not found.' });
        }
        await exchange.deleteOne();
        logger.info(`[INFO] Exchange connection deleted: ${exchange.name}`);
        res.status(200).json({ message: 'Exchange connection deleted successfully.' });
    } catch (error) {
        logger.error('[ERROR] Error deleting exchange:', error);
        res.status(500).json({ message: 'Error deleting exchange', error: error.message });
    }
};


// --- GET: Check the connection status of an exchange ---
exports.checkExchangeStatus = async (req, res) => {
    try {
        const exchange = await Exchange.findById(req.params.id);
        if (!exchange) {
            return res.status(404).json({ message: 'Exchange not found.' });
        }

        logger.info(`[INFO] Checking connection for exchange: ${exchange.name}`);

        const provider = getExchangeProvider(exchange.platform);
        await provider.validateCredentials({
            apiToken: exchange.apiToken,
            apiKey: exchange.apiKey,
            apiSecret: exchange.apiSecret,
            isTestnet: exchange.isTestnet,
        });

        exchange.status = 'Connected';
        exchange.statusCheckedAt = new Date();
        await exchange.save();
        return res.status(200).json({ status: 'ok', message: `${exchange.platform} connection active.` });
    } catch (error) {
        try {
            const exchange = await Exchange.findById(req.params.id);
            if (exchange) {
                exchange.status = 'Disconnected';
                exchange.statusCheckedAt = new Date();
                await exchange.save();
            }
        } catch (saveError) {
            logger.error('[ERROR] Failed updating exchange status after failed check:', saveError);
        }

        logger.error('[ERROR] Checking exchange connection:', error);
        res.status(400).json({ status: 'error', message: error.message || 'Failed to verify exchange connection.' });
    }
};


// get exchange by its id
exports.getExchangeById = async (req, res) => {
    try {
        const exchange = await Exchange.findById(req.params.id);
        if (!exchange) {
            logger.warn('[WARN] Exchange not found with ID:', req.params.id);
            return res.status(404).json({ message: 'Exchange not found.' });
        }
        res.status(200).json(exchange);
    } catch (error) {
        logger.error('[ERROR] Error fetching exchange:', error);
        res.status(500).json({ message: 'Error fetching exchange', error: error.message });
    }
};

