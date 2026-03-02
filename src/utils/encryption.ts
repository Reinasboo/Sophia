/**
 * Encryption utilities for secure key storage
 * 
 * Uses AES-256-GCM for authenticated encryption.
 * Keys are encrypted at rest and only decrypted when signing.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Derives an encryption key from a passphrase using scrypt
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH, {
    N: 32768,
    r: 8,
    p: 1,
  });
}

/**
 * Encrypts data using AES-256-GCM
 * Returns base64 encoded string: salt:iv:authTag:ciphertext
 */
export function encrypt(data: Uint8Array, passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(data)),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  
  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts data encrypted with encrypt()
 */
export function decrypt(encryptedData: string, passphrase: string): Uint8Array {
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  const key = deriveKey(passphrase, salt);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return new Uint8Array(decrypted);
}

/**
 * Securely compares two strings in constant time
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  // Pad to equal length to avoid leaking length via timing
  if (bufA.length !== bufB.length) {
    // Compare bufA against itself so we still do constant-time work,
    // then return false. Avoids leaking length difference via timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  
  return timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure random ID
 */
export function generateSecureId(prefix: string = ''): string {
  const bytes = randomBytes(16);
  const id = bytes.toString('hex');
  return prefix ? `${prefix}_${id}` : id;
}
