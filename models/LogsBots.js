const mongoose = require('mongoose');

const LogsBotsSchema = new mongoose.Schema({
    botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    logType: { type: String, required: true, enum: ['info', 'warning', 'error', 'trade', 'status'] }, 
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actionRequired: { type: Boolean, default: false },

});



module.exports = mongoose.model('LogsBots', LogsBotsSchema);
