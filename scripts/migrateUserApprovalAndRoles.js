require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User').default;

async function runMigration() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to run migration.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[migration] Connected to MongoDB');

  const result = await User.updateMany(
    {
      $or: [
        { role: { $exists: false } },
        { approvalStatus: { $exists: false } },
        { approvalRequestedAt: { $exists: false } },
      ],
    },
    {
      $set: {
        role: 'user',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvalRequestedAt: new Date(),
      },
      $unset: {
        rejectedAt: '',
        rejectionReason: '',
      },
    }
  );

  // Ensure all users already approved get approvedAt set if missing.
  const approvedResult = await User.updateMany(
    { approvalStatus: 'approved', approvedAt: { $exists: false } },
    { $set: { approvedAt: new Date() } }
  );

  console.log(`[migration] Updated users: ${result.modifiedCount}`);
  console.log(`[migration] Backfilled approvedAt: ${approvedResult.modifiedCount}`);
}

runMigration()
  .catch((error) => {
    console.error('[migration] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('[migration] Disconnected from MongoDB');
  });
