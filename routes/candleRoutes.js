// routes/candleRoutes.js
const express = require('express');
const { getCandles } = require('../services/candleService');
const { analyzeStrategy } = require('../services/strategyService');

const router = express.Router();

router.get('/candles', (req, res) => {
  res.json({ candles: getCandles() });
});


router.get('/signal', (req, res) => {
  const result = analyzeStrategy();
  res.json(result);
});

module.exports = router;
