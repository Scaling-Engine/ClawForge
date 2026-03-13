import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT = 'thepopebot-config-v1'; // keep same salt for migration compat
const ITERATIONS = 100_000;

function getKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET environment variable is required for encryption');
  return pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} JSON string with iv, ciphertext, and auth tag
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

/**
 * Decrypt an encrypted JSON string produced by encrypt().
 * @param {string} encryptedJson
 * @returns {string} Original plaintext
 */
export function decrypt(encryptedJson) {
  const key = getKey();
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
