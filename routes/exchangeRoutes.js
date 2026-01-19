const express = require('express');
const router = express.Router();
const { 
    getAllExchanges, 
    createExchange,
    deleteExchange,
    checkExchangeStatus
} = require('../controllers/exchangeController');

// --- API ROUTES ---

// GET all saved exchange connections
router.get('/', getAllExchanges);

// POST a new exchange connection
router.post('/', createExchange);

// DELETE an exchange connection by ID
router.delete('/:id', deleteExchange);

// POST to check the connection status of an exchange by ID
router.get('/status/:id', checkExchangeStatus);

module.exports = router;

