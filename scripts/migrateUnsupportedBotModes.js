require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('../models/Bot');

const LEGACY_MODES = ['DCA', 'RSI', 'Orion'];

const resolveMode = (bot) => {
  if (String(bot?.strategy || '').toUpperCase() === 'GRID_RANGE') {
    return 'Grid';
  }

  return 'Pattern Trading';
};

async function runMigration() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to run migration.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[migration] Connected to MongoDB');

  const legacyBots = await Bot.find(
    { botMode: { $in: LEGACY_MODES } },
    { _id: 1, botMode: 1, strategy: 1, botName: 1 }
  ).lean();

  if (!legacyBots.length) {
    console.log('[migration] No legacy botMode values found.');
    return;
  }

  const ops = legacyBots.map((bot) => {
    const mappedMode = resolveMode(bot);

    return {
      updateOne: {
        filter: { _id: bot._id },
        update: { $set: { botMode: mappedMode } },
      },
    };
  });

  const result = await Bot.bulkWrite(ops, { ordered: false });

  console.log(`[migration] Matched: ${result.matchedCount}`);
  console.log(`[migration] Modified: ${result.modifiedCount}`);
  console.log('[migration] Mapping summary: DCA/RSI/Orion -> Pattern Trading (or Grid when strategy=GRID_RANGE)');
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
