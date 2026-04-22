const mongoose = require('mongoose');
const dns = require('dns');
const logger = require('../utils/logger');

dns.setServers([
  '1.1.1.1',
  '8.8.8.8',
]);

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    logger.error('MongoDB URI is missing. Set MONGO_URI or MONGODB_URI.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    logger.info("MongoDB Connected");
    
  } catch (err) {
    if (err?.message?.includes('querySrv') || err?.message?.includes('ENOTFOUND')) {
      logger.error('MongoDB DNS/SRV resolution error. Check network/VPN/firewall and DNS settings.', err.message);
    } else if (err?.message?.includes('Authentication failed')) {
      logger.error('MongoDB authentication error. Check credentials and auth DB.', err.message);
    } else {
      logger.error("MongoDB Error ", err);
    }
    process.exit(1);
  }
};

module.exports = connectDB;
