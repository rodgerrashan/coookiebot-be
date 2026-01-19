// Mongoose schema and model with built-in encryption for the API secret
const mongoose = require('mongoose');
const crypto = require('crypto');

// This key MUST be 32 characters long for AES-256
const ENCRYPTION_KEY = process.env.CRYPTO_SECRET_KEY; 
const IV_LENGTH = 16; // For AES, this is always 16

// --- Encryption Helper Functions ---
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Note: A decrypt function would be needed if you ever need to USE the key on the server
// function decrypt(text) {
//     const textParts = text.split(':');
//     const iv = Buffer.from(textParts.shift(), 'hex');
//     const encryptedText = Buffer.from(textParts.join(':'), 'hex');
//     const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
//     let decrypted = decipher.update(encryptedText);
//     decrypted = Buffer.concat([decrypted, decipher.final()]);
//     return decrypted.toString();
// }

const exchangeSchema = new mongoose.Schema({
    platform: {
        type: String,
        required: true,
        enum: ['Binance', 'Deriv'], 
    },
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    apiToken: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['Connected', 'Failed', 'unknown','Disconnected'],
        default: 'unknown',
    },
    statusCheckedAt: {
        type: Date,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

// Mongoose 'pre-save' hook to automatically encrypt the secret before saving
exchangeSchema.pre('save', function(next) {
    // Only encrypt the secret if it has been modified (or is new)
    if (!this.isModified('apiSecret')) {
        return next();
    }
    this.apiSecret = encrypt(this.apiSecret);
    next();
});


module.exports = mongoose.model('Exchange', exchangeSchema);
