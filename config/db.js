const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("MongoDB Connected");
    
  } catch (err) {
    logger.error("MongoDB Error ", err);
    process.exit(1);
  }
};

module.exports = connectDB;
