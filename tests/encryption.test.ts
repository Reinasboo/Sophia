/**
 * Encryption Module Tests
 *
 * Validates AES-256-GCM encrypt/decrypt, key derivation, tamper detection,
 * and the constant-time comparison utility.
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, secureCompare, generateSecureId } from '../src/utils/encryption.js';

describe('encrypt / decrypt', () => {
  const passphrase = 'test-passphrase-min-16-chars!!';

  it('round-trips arbitrary binary data', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const encrypted = encrypt(original, passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toEqual(original);
  });

  it('round-trips a 64-byte Solana secret key', () => {
    // Solana Keypair.secretKey is 64 bytes
    const secretKey = new Uint8Array(64);
    for (let i = 0; i < 64; i++) secretKey[i] = i;

    const encrypted = encrypt(secretKey, passphrase);
    const decrypted = decrypt(encrypted, passphrase);
    expect(decrypted).toEqual(secretKey);
  });

  it('produces different ciphertext each time (random salt+IV)', () => {
    const data = new Uint8Array([42, 42, 42]);
    const a = encrypt(data, passphrase);
    const b = encrypt(data, passphrase);
    expect(a).not.toBe(b);
  });

  it('fails with the wrong passphrase', () => {
    const data = new Uint8Array([10, 20, 30]);
    const encrypted = encrypt(data, passphrase);
    expect(() => decrypt(encrypted, 'wrong-passphrase-1234')).toThrow();
  });

  it('fails on tampered ciphertext (auth tag check)', () => {
    const data = new Uint8Array([99, 100]);
    const encrypted = encrypt(data, passphrase);

    // Flip a byte in the middle of the base64 payload
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');

    expect(() => decrypt(tampered, passphrase)).toThrow();
  });
});

describe('secureCompare', () => {
  it('returns true for equal strings', () => {
    expect(secureCompare('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(secureCompare('abc', 'xyz')).toBe(false);
  });

  it('returns false for strings of different length', () => {
    expect(secureCompare('short', 'longer-string')).toBe(false);
  });
});

describe('generateSecureId', () => {
  it('produces a prefixed string', () => {
    const id = generateSecureId('wallet');
    expect(id).toMatch(/^wallet_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSecureId('test')));
    expect(ids.size).toBe(100);
  });
});
