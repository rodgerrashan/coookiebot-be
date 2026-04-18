const Exchange = require('../models/Exchange');
require('dotenv').config();
const { encrypt } = require('../utils/encryptions');
const logger = require('../utils/logger');
const { getExchangeProvider } = require('../services/exchanges/factory');

const isOwnerOrUnassigned = (ownerUserId, user) => !ownerUserId || String(ownerUserId) === String(user?._id || '');

const MAX_ACTIVITY_ITEMS = 50;

function toMaskedValue(value) {
    if (!value) return null;
    return '******';
}

function serializeExchange(exchange) {
    return {
        _id: exchange._id,
        name: exchange.name,
        platform: exchange.platform,
        status: exchange.status,
        isTestnet: Boolean(exchange.isTestnet),
        statusCheckedAt: exchange.statusCheckedAt,
        createdAt: exchange.createdAt,
        updatedAt: exchange.updatedAt,
        permissions: Array.isArray(exchange.permissions) ? exchange.permissions : [],
        credentialMeta: {
            hasApiKey: Boolean(exchange.apiKey),
            hasApiSecret: Boolean(exchange.apiSecret),
            hasApiToken: Boolean(exchange.apiToken),
            maskedKey: toMaskedValue(exchange.apiKey),
            maskedSecret: toMaskedValue(exchange.apiSecret),
            maskedToken: toMaskedValue(exchange.apiToken),
        },
        lastError: exchange.lastError || null,
        activitySummary: {
            count: Array.isArray(exchange.activityLog) ? exchange.activityLog.length : 0,
            latest: Array.isArray(exchange.activityLog) && exchange.activityLog.length
                ? exchange.activityLog[exchange.activityLog.length - 1]
                : null,
        }
    };
}

function pushActivity(exchange, entry) {
    const current = Array.isArray(exchange.activityLog) ? exchange.activityLog : [];
    const next = [...current, {
        action: entry.action,
        level: entry.level || 'info',
        message: entry.message,
        createdAt: entry.createdAt || new Date(),
    }];

    exchange.activityLog = next.slice(-MAX_ACTIVITY_ITEMS);
}



// --- GET: Fetch all exchanges ---
exports.getAllExchanges = async (req, res) => {
    try {
        const query = req.user?.role === 'admin' ? {} : { userId: req.user?._id };
        const exchanges = await Exchange.find(query);

        res.status(200).json(exchanges.map((ex) => serializeExchange(ex)));
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
            userId: req.user?._id,
            platform: normalizedPlatform,
            name,
            apiToken: encryptedToken,
            apiKey: encryptedKey,
            apiSecret: encryptedSecret,
            isTestnet: Boolean(isTestnet),
            status: 'Connected',
            statusCheckedAt: new Date(),
            lastError: null,
            permissions: isDeriv ? ['read', 'trade'] : ['read', 'trade'],
        });

        pushActivity(newExchange, {
            action: 'connection.created',
            level: 'success',
            message: `${normalizedPlatform} connection created.`,
        });

        const savedExchange = await newExchange.save();

        res.status(201).json({
            message: `${normalizedPlatform} account connected successfully!`,
            exchange: serializeExchange(savedExchange),
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

        if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(exchange.userId, req.user)) {
            return res.status(403).json({ message: 'You are not allowed to delete this exchange.' });
        }

        const deletedName = exchange.name;
        await exchange.deleteOne();
        logger.info(`[INFO] Exchange connection deleted: ${deletedName}`);
        res.status(200).json({
            message: 'Exchange connection deleted successfully.',
            deletedId: req.params.id,
        });
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

        if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(exchange.userId, req.user)) {
            return res.status(403).json({ message: 'You are not allowed to access this exchange.' });
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
        exchange.lastError = null;
        pushActivity(exchange, {
            action: 'connection.recheck',
            level: 'success',
            message: `${exchange.platform} connection check succeeded.`,
        });
        await exchange.save();
        return res.status(200).json({
            status: 'ok',
            message: `${exchange.platform} connection active.`,
            exchange: serializeExchange(exchange),
        });
    } catch (error) {
        try {
            const exchange = await Exchange.findById(req.params.id);
            if (exchange) {
                exchange.status = 'Disconnected';
                exchange.statusCheckedAt = new Date();
                exchange.lastError = error.message || 'Failed to verify exchange connection.';
                pushActivity(exchange, {
                    action: 'connection.recheck',
                    level: 'error',
                    message: exchange.lastError,
                });
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

        if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(exchange.userId, req.user)) {
            return res.status(403).json({ message: 'You are not allowed to access this exchange.' });
        }
        res.status(200).json(serializeExchange(exchange));
    } catch (error) {
        logger.error('[ERROR] Error fetching exchange:', error);
        res.status(500).json({ message: 'Error fetching exchange', error: error.message });
    }
};

// --- PATCH: Update exchange configuration ---
exports.updateExchange = async (req, res) => {
    const { name, apiSecret, apiKey, isTestnet } = req.body;

    try {
        const exchange = await Exchange.findById(req.params.id);
        if (!exchange) {
            return res.status(404).json({ message: 'Exchange not found.' });
        }

        if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(exchange.userId, req.user)) {
            return res.status(403).json({ message: 'You are not allowed to update this exchange.' });
        }

        if (name && name !== exchange.name) {
            exchange.name = String(name).trim();
        }

        if (typeof isTestnet === 'boolean') {
            exchange.isTestnet = isTestnet;
        }

        const isDeriv = exchange.platform.toLowerCase() === 'deriv';
        const isBinance = exchange.platform.toLowerCase() === 'binance';

        if (isDeriv && apiSecret) {
            exchange.apiToken = encrypt(apiSecret);
        }

        if (isBinance) {
            if (apiKey) {
                exchange.apiKey = encrypt(apiKey);
            }
            if (apiSecret) {
                exchange.apiSecret = encrypt(apiSecret);
            }
        }

        const provider = getExchangeProvider(exchange.platform);
        await provider.validateCredentials({
            apiToken: exchange.apiToken,
            apiKey: exchange.apiKey,
            apiSecret: exchange.apiSecret,
            isTestnet: exchange.isTestnet,
        });

        exchange.status = 'Connected';
        exchange.statusCheckedAt = new Date();
        exchange.lastError = null;
        pushActivity(exchange, {
            action: 'connection.updated',
            level: 'success',
            message: `${exchange.platform} connection updated.`,
        });

        await exchange.save();

        res.status(200).json({
            message: 'Exchange updated successfully.',
            exchange: serializeExchange(exchange),
        });
    } catch (error) {
        logger.error('[ERROR] Error updating exchange:', error);
        res.status(400).json({ message: 'Error updating exchange', error: error.message });
    }
};

// --- GET: exchange activity entries ---
exports.getExchangeActivity = async (req, res) => {
    try {
        const exchange = await Exchange.findById(req.params.id);
        if (!exchange) {
            return res.status(404).json({ message: 'Exchange not found.' });
        }

        if (req.user?.role !== 'admin' && !isOwnerOrUnassigned(exchange.userId, req.user)) {
            return res.status(403).json({ message: 'You are not allowed to access this exchange activity.' });
        }

        const items = Array.isArray(exchange.activityLog) ? [...exchange.activityLog].reverse() : [];
        return res.status(200).json({
            exchangeId: exchange._id,
            items,
        });
    } catch (error) {
        logger.error('[ERROR] Error fetching exchange activity:', error);
        res.status(500).json({ message: 'Error fetching exchange activity', error: error.message });
    }
};

