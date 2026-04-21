// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const cookie_parser = require('cookie-parser');
const http = require('http');
const dns = require('dns');

dns.setServers([
    '1.1.1.1',
    '8.8.8.8'
])

const {initWebSocket} = require('./ws/socket');


const exchangeRoutes = require('./routes/exchangeRoutes');
const candleRoutes = require('./routes/candleRoutes');
const authRouter = require('./routes/authRoutes');
const botRoutes = require('./routes/botsRoutes');
const playgroundRoutes = require('./routes/playgroundRoutes');
const adminRoutes = require('./routes/adminRoutes');

const { startAllBots } = require('./services/botServices');

const connectDB = require('./config/db');
const logger = require('./utils/logger');


const app = express();
const PORT = process.env.PORT || 5005;

const corsOptions = {
    origin: true,
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookie_parser());

// 🧾 Request Logger Middleware
app.use((req, res, next) => {
    const time = new Date().toLocaleString();
    logger.info(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});


// Connect to MongoDB
connectDB();

const path = require('path');
// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Root endpoint - status page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// Routes
app.use('/api/connections', exchangeRoutes);
app.use('/api', candleRoutes);
app.use('/api/auth', authRouter);
app.use('/api/bots', botRoutes);
app.use('/api/playground', playgroundRoutes);
app.use('/api/admin', adminRoutes);


// Add Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Restart all bots on server start awit until DB is connected
mongoose.connection.once('open', async () => {
    await startAllBots();
});

const server = http.createServer(app);
// Initialize WebSocket server
initWebSocket(server);

server.listen(PORT, () => logger.info(`HTTP Server running on port ${PORT}`));

