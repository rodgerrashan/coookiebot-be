const express = require('express');
const router = express.Router();
const { 
    getAllExchanges, 
    createExchange,
    deleteExchange,
    checkExchangeStatus,
    getExchangeById,
    updateExchange,
    getExchangeActivity,
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

// GET recent activity entries for one exchange
router.get('/:id/activity', getExchangeActivity);

// GET details for one exchange
router.get('/:id', getExchangeById);

// PATCH update one exchange
router.patch('/:id', updateExchange);

module.exports = router;

