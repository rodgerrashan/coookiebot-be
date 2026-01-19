const UAParser = require('ua-parser-js');

const getSessionDetails = (req) => {
    const parser = new UAParser(req.headers['user-agent']);
    const result = parser.getResult();

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    return {
        ip: ip === '::1' ? '127.0.0.1' : ip,
        browser: result.browser.name || 'Unknown Browser',
        os: `${result.os.name || 'Unknown OS'} ${result.os.version || ''}`,
        device: result.device.model || 'Desktop',
        lastLogin: new Date(),
        userAgent: req.headers['user-agent']
    };
};

module.exports = { getSessionDetails };