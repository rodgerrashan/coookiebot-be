const User = require('../models/User').default;
const Bot = require('../models/Bot');
const Exchange = require('../models/Exchange');

const toAdminUserPayload = (user) => ({
  id: user._id,
  userID: user.userID,
  name: user.name,
  email: user.email,
  role: user.role,
  isAccountVerified: user.isAccountVerified,
  approvalStatus: user.approvalStatus,
  approvedAt: user.approvedAt,
  rejectedAt: user.rejectedAt,
  rejectionReason: user.rejectionReason || '',
  approvalRequestedAt: user.approvalRequestedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getPendingUsers = async (req, res) => {
  try {
    const users = await User.find({ approvalStatus: 'pending', role: { $ne: 'admin' } })
      .sort({ approvalRequestedAt: 1, createdAt: 1 })
      .select('-password -verifyOtp -verifyOtpExpireAt -resetOtp -resetOtpExpiredAt');

    return res.json({
      success: true,
      count: users.length,
      users: users.map(toAdminUserPayload),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getUsersByApprovalStatus = async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const query = { role: { $ne: 'admin' } };

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.approvalStatus = status;
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .select('-password -verifyOtp -verifyOtpExpireAt -resetOtp -resetOtpExpiredAt');

    return res.json({
      success: true,
      count: users.length,
      users: users.map(toAdminUserPayload),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveUser = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts do not require approval.' });
    }

    if (!targetUser.isAccountVerified) {
      return res.status(400).json({
        success: false,
        message: 'User email must be verified before approval.',
      });
    }

    targetUser.approvalStatus = 'approved';
    targetUser.approvedAt = new Date();
    targetUser.approvedBy = req.user._id;
    targetUser.rejectedAt = null;
    targetUser.rejectionReason = '';
    await targetUser.save();

    return res.json({
      success: true,
      message: 'User approved successfully.',
      user: toAdminUserPayload(targetUser),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const rejectUser = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be rejected.' });
    }

    targetUser.approvalStatus = 'rejected';
    targetUser.rejectedAt = new Date();
    targetUser.approvedAt = null;
    targetUser.approvedBy = null;
    targetUser.rejectionReason = reason;
    await targetUser.save();

    return res.json({
      success: true,
      message: 'User rejected successfully.',
      user: toAdminUserPayload(targetUser),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      userTotal,
      userPending,
      userApproved,
      userRejected,
      userVerified,
      userNew7d,
      botTotal,
      botActive,
      botPaused,
      botStopped,
      botError,
      botCreated,
      exchangeTotal,
      exchangeConnected,
      exchangeDisconnected,
      exchangeFailed,
      exchangeUnknown,
      exchangePlatformRows,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' }, approvalStatus: 'pending' }),
      User.countDocuments({ role: { $ne: 'admin' }, approvalStatus: 'approved' }),
      User.countDocuments({ role: { $ne: 'admin' }, approvalStatus: 'rejected' }),
      User.countDocuments({ role: { $ne: 'admin' }, isAccountVerified: true }),
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: sevenDaysAgo } }),
      Bot.countDocuments(),
      Bot.countDocuments({ status: 'active' }),
      Bot.countDocuments({ status: 'paused' }),
      Bot.countDocuments({ status: 'stopped' }),
      Bot.countDocuments({ status: 'error' }),
      Bot.countDocuments({ status: 'created' }),
      Exchange.countDocuments(),
      Exchange.countDocuments({ status: 'Connected' }),
      Exchange.countDocuments({ status: 'Disconnected' }),
      Exchange.countDocuments({ status: 'Failed' }),
      Exchange.countDocuments({ status: 'unknown' }),
      Exchange.aggregate([{ $group: { _id: '$platform', count: { $sum: 1 } } }]),
    ]);

    const platformCounts = exchangePlatformRows.reduce((acc, row) => {
      const key = row?._id || 'Unknown';
      acc[key] = Number(row?.count || 0);
      return acc;
    }, {});

    return res.json({
      success: true,
      stats: {
        users: {
          total: userTotal,
          pending: userPending,
          approved: userApproved,
          rejected: userRejected,
          verified: userVerified,
          new7d: userNew7d,
        },
        bots: {
          total: botTotal,
          active: botActive,
          paused: botPaused,
          stopped: botStopped,
          error: botError,
          created: botCreated,
        },
        exchanges: {
          total: exchangeTotal,
          connected: exchangeConnected,
          disconnected: exchangeDisconnected,
          failed: exchangeFailed,
          unknown: exchangeUnknown,
        },
        platformCounts,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPendingUsers,
  getUsersByApprovalStatus,
  approveUser,
  rejectUser,
  getStats,
};
