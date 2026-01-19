const crypto = require('crypto');
require('dotenv').config();

const algorithm = 'aes-256-ctr';
const secretKey = process.env.CRYPTO_SECRET_KEY;

// Validate secret key
if (!secretKey || secretKey.length !== 32) {
  throw new Error('CRYPTO_SECRET_KEY must be a 32-character string in .env file.');
}

/**
 * Encrypt text using AES-256-CTR.
 * @param {string} text - Plaintext string to encrypt.
 * @returns {string} Encrypted string in format: iv:encrypted
 */
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypt an AES-256-CTR encrypted string.
 * @param {string} hash - Encrypted string in format iv:encrypted.
 * @returns {string} Decrypted plaintext.
 */
const decrypt = (hash) => {
  const [ivHex, encryptedHex] = hash.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
