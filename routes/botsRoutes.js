const express = require('express');

const router = express.Router();
const {
  createBot,
  getBots,
  getBotById,
  updateBot,
  deleteBot,
  startBot,
  stopBot,
  getBotStatus,
  getBotLogs,
  getBotCandles,
  getMarkers,
  getBotsSummary,
  getDashboardSummary,
} = require('../controllers/botController');
const { isAuthenticated, requireTradingApproval } = require('../controllers/authController');

router.use(isAuthenticated);

router.post('/', createBot);
router.get('/', getBots);

router.get('/summary', getBotsSummary);
router.get('/dashboard', getDashboardSummary);


router.get('/:id', getBotById);
router.put('/:id', updateBot);
router.delete('/:id', deleteBot);


router.post('/:id/start', requireTradingApproval, startBot);
router.post('/:id/stop', stopBot);
router.get('/:id/status', getBotStatus);

router.get('/:id/logs', getBotLogs);
router.get('/:id/candles', getBotCandles);

router.get('/:id/markers', getMarkers);



module.exports = router;
