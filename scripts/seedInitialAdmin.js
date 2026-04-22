require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const dns = require('dns');
const User = require('../models/User');

dns.setServers([
  '1.1.1.1',
  '8.8.8.8',
]);

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

function buildUserId(email) {
  const prefix = String(email || 'admin').split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'admin';
  const tail = Date.now().toString().slice(-6);
  return `CBU${prefix}${tail}`;
}

async function runSeed() {
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is required to run seed.');
  }

  const email = process.env.INIT_ADMIN_EMAIL;
  const password = process.env.INIT_ADMIN_PASSWORD;
  const name = process.env.INIT_ADMIN_NAME || 'Administrator';

  if (!email || !password) {
    throw new Error('INIT_ADMIN_EMAIL and INIT_ADMIN_PASSWORD are required.');
  }

  await mongoose.connect(mongoUri);
  console.log('[seed] Connected to MongoDB');

  const existingByEmail = await User.findOne({ email });
  if (existingByEmail) {
    if (existingByEmail.role !== 'admin') {
      existingByEmail.role = 'admin';
    }
    existingByEmail.isAccountVerified = true;
    existingByEmail.approvalStatus = 'approved';
    existingByEmail.approvedAt = existingByEmail.approvedAt || new Date();
    existingByEmail.rejectedAt = null;
    existingByEmail.rejectionReason = '';
    await existingByEmail.save();
    console.log('[seed] Existing user elevated to admin.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = new User({
    email,
    password: hashedPassword,
    userID: buildUserId(email),
    name,
    profilePicture: `https://api.dicebear.com/7.x/initials/svg?seed=${email}`,
    role: 'admin',
    isAccountVerified: true,
    approvalStatus: 'approved',
    approvedAt: new Date(),
    approvalRequestedAt: new Date(),
    activeSessions: [],
  });

  await adminUser.save();
  console.log('[seed] Initial admin created successfully.');
}

runSeed()
  .catch((error) => {
    if (error?.message?.includes('querySrv') || error?.message?.includes('ENOTFOUND')) {
      console.error('[seed] Failed: DNS/SRV resolution error. Check internet, VPN/firewall, and DNS settings.', error.message);
    } else if (error?.message?.includes('Authentication failed')) {
      console.error('[seed] Failed: MongoDB authentication error. Check username/password and auth database.', error.message);
    } else {
      console.error('[seed] Failed:', error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('[seed] Disconnected from MongoDB');
  });
