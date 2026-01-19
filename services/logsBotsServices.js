const LogsBots = require('../models/LogsBots');
const Bot = require('../models/Bot');

async function makelogbot(botId, logType = "info", message, actionRequired = false) {
  // 1. Create and save log entry
  const logEntry = new LogsBots({
    botId,
    logType,
    message,
    actionRequired
  });

  const savedLog = await logEntry.save();

  // 2. Push into bot.logs and keep only last 100
  const bot = await Bot.findByIdAndUpdate(
    botId,
    {
      $push: {
        logs: { $each: [savedLog._id], $slice: -100 }
      }
    },
    { new: true } // returns updated bot with trimmed logs array
  ).lean();

  // 3. Delete log documents not in latest 100 logs
  await LogsBots.deleteMany({
    botId,
    _id: { $nin: bot.logs }
  });

  return savedLog;
}

module.exports = { makelogbot };
