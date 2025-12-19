const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

class EncryptionService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    if (!this.encryptionKey) {
      console.warn('ENCRYPTION_KEY not set - credential encryption will not be available');
    }
  }

  /**
   * Derive a key from the encryption key using PBKDF2
   */
  deriveKey(salt) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    return crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha256');
  }

  /**
   * Encrypt data (string or object)
   * Returns base64-encoded string containing salt, IV, auth tag, and ciphertext
   */
  encrypt(data) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    // Convert object to string if needed
    const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = this.deriveKey(salt);

    // Encrypt
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Combine salt + IV + authTag + ciphertext
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt data
   * Returns the original string or parsed object
   */
  decrypt(encryptedData) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from salt
    const key = this.deriveKey(salt);

    // Decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const plaintext = decrypted.toString('utf8');

    // Try to parse as JSON
    try {
      return JSON.parse(plaintext);
    } catch {
      return plaintext;
    }
  }

  /**
   * Check if encryption is available
   */
  isConfigured() {
    return !!this.encryptionKey;
  }

  /**
   * Securely compare two strings (timing-safe)
   */
  secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}

module.exports = new EncryptionService();
