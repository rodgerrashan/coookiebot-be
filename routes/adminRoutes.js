const express = require('express');

const router = express.Router();

const {
  getPendingUsers,
  getUsersByApprovalStatus,
  approveUser,
  rejectUser,
  getStats,
} = require('../controllers/adminController');

const { isAuthenticated, requireAdmin } = require('../controllers/authController');

router.use(isAuthenticated, requireAdmin);

router.get('/users/pending', getPendingUsers);
router.get('/users', getUsersByApprovalStatus);
router.get('/stats', getStats);
router.post('/users/:id/approve', approveUser);
router.post('/users/:id/reject', rejectUser);

module.exports = router;
