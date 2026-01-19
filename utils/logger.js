const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Create logs folder if not exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Helper to format timestamp
const getTimestamp = () => {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
};

// Main logging function
function logMessage(level, message, meta = '') {
    const timestamp = getTimestamp();
    let formattedMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (meta) {
        formattedMsg += ` | ${JSON.stringify(meta)}`;
    }

    // Multi-layer logging: console + file
    switch (level) {
        case 'info':
            console.log(chalk.blue(formattedMsg));
            break;
        case 'warn':
            console.warn(chalk.yellow(formattedMsg));
            break;
        case 'error':
            console.error(chalk.red(formattedMsg));
            break;
        case 'debug':
            console.log(chalk.magenta(formattedMsg));
            break;
        default:
            console.log(formattedMsg);
    }

    // // Write to log file (daily log)
    // const logFile = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
    // fs.appendFileSync(logFile, formattedMsg + '\n');
}

// Export easy-to-use functions
module.exports = {
    info: (msg, meta) => logMessage('info', msg, meta),
    warn: (msg, meta) => logMessage('warn', msg, meta),
    error: (msg, meta) => logMessage('error', msg, meta),
    debug: (msg, meta) => logMessage('debug', msg, meta),
};
