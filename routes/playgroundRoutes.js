const express = require('express');
const router = express.Router();

const {getCandleHistory, getBacktestResults, getPlatforms, getSymbols, getTimeframes,getMultipliers , getAvailablePatterns}  = require('../controllers/playgroundController');


// --- API ROUTES ---

//  GET platorms
router.get('/platforms', getPlatforms);
// POST Symbols
router.post('/symbols', getSymbols);
// POST Multiplers
router.post('/multipliers', getMultipliers);
// GET Patterns
router.get('/patterns', getAvailablePatterns);


// POST historical candles
router.post('/history', getCandleHistory);

// POST Backtest
router.post('/backtest',getBacktestResults);






module.exports = router;


