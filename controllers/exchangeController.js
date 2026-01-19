const Exchange = require('../models/Exchange');
const crypto = require('crypto');
const WebSocket = require('ws');
require('dotenv').config();
const { encrypt, decrypt } = require('../utils/encryptions');
const logger = require('../utils/logger');
const { connectDeriv } = require('../services/deriv/connect');
const { connect } = require('http2');



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
                statusCheckedAt: ex.statusCheckedAt,
                createdAt: ex.createdAt,

            }))
        );
    } catch (error) {
        logger.error("Error fetching exchanges", error);
        res.status(500).json({ message: 'Error fetching exchanges', error: error.message });
    }
};


// --- POST: Create a new exchange connection (Deriv API token) ---
exports.createExchange = async (req, res) => {
    // platform, name, apiSecret
    const { platform, name, apiSecret } = req.body;

    if (!platform || !name || !apiSecret) {
        return res.status(400).json({ message: 'Platform, name, and Deriv token are required.' });
    }

    try {
        // Encrypt token
        const encryptedToken = encrypt(apiSecret);
        // Step 1 — Test Deriv connection before saving
        const testConnection = await testDerivToken(encryptedToken);
        if (!testConnection.success) {
            return res.status(400).json({ message: 'Invalid Deriv token. Connection failed.' });
        }


        // Step 2 — Encrypt and save
        const newExchange = new Exchange({
            platform,
            name,
            apiToken: encryptedToken,
            status: 'Connected',
            statusCheckedAt: new Date(),
        });

        const savedExchange = await newExchange.save();

        res.status(201).json({
            message: 'Deriv account connected successfully!',
            exchange: {
                _id: savedExchange._id,
                platform: savedExchange.platform,
                name: savedExchange.name,
                status: savedExchange.status,
            }
        });

    } catch (error) {
        logger.error('[ERROR] Error creating exchange:', error);
        res.status(500).json({ message: 'Error saving exchange', error: error.message });
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

        logger.info(`[INFO] Checking Deriv connection for exchange: ${exchange.name}`);

        // const token = decrypt(exchange.apiToken);
        const testConnection = await testDerivToken(exchange.apiToken);
        console.log('Test connection result:', testConnection);

        if (testConnection.success) {
            exchange.status = 'Connected';
            exchange.statusCheckedAt = new Date();
            await exchange.save();
            res.status(200).json({ status: 'ok', message: 'Deriv connection active.' });
        } else {
            exchange.status = 'Disconnected';
            exchange.statusCheckedAt = new Date();
            await exchange.save();
            res.status(400).json({ status: 'error', message: 'Deriv connection failed.' });
        }
    } catch (error) {
        logger.error('[ERROR] Checking Deriv connection:', error);
        res.status(500).json({ status: 'error', message: 'Failed to verify Deriv connection.' });
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

async function testDerivToken(token) {
    try {
        const result = await connectDeriv(token);
        result.socket.close();

        return {
            success: true,
            loginid: result.loginid,
            message: "Token valid"
        };

    } catch (err) {
        console.error('Error testing Deriv token:', err);
        return {
            success: false,
            error: err.message || "Invalid or expired token"
        };
    }
}

