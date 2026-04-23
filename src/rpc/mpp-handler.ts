/**
 * MPP (Micropayment Protocol) Handler
 *
 * Implements lightweight micropayment messaging with Ed25519 signatures
 * for Solana-based pay-per-use services.
 *
 * Supports:
 * - Payment request/proof/refund messaging
 * - Nonce-based replay attack prevention
 * - Ed25519 signature verification
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import { randomBytes } from 'crypto';
import * as nacl from 'tweetnacl';
import { Result, success, failure } from '../types/shared.js';
import { MPPMessage } from '../types/internal.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MPP_PROTOCOL');

/**
 * MPP Message Builder and Verifier
 */
export class MPPHandler {
  private readonly serviceId: string;
  private readonly walletPublicKey: PublicKey;
  private readonly keypair?: Keypair; // Optional, for signing payments
  private nonces: Set<string> = new Set();
  private maxNonces: number = 5000;

  constructor(serviceId: string, walletPublicKeyOrAddress: string, keypair?: Keypair) {
    this.serviceId = serviceId;
    try {
      this.walletPublicKey = new PublicKey(walletPublicKeyOrAddress);
    } catch (err) {
      throw new Error(`Invalid wallet public key: ${walletPublicKeyOrAddress}`);
    }
    this.keypair = keypair;
  }

  /**
   * Create a payment request message
   */
  createPaymentRequest(
    amount: number // Lamports
  ): MPPMessage {
    const nonce = randomBytes(32).toString('hex');

    const message: MPPMessage = {
      version: '1.0',
      messageType: 'payment_request',
      serviceId: this.serviceId,
      walletPublicKey: this.walletPublicKey.toBase58(),
      amount,
      nonce,
      timestamp: new Date(),
    };

    logger.debug('MPP payment request created', {
      serviceId: this.serviceId,
      amount,
      nonce: nonce.slice(0, 8),
    });

    return message;
  }

  /**
   * Sign a message with the wallet keypair (if available)
   * Uses Ed25519 signing via tweetnacl
   */
  signMessage(message: MPPMessage): Result<MPPMessage, Error> {
    if (!this.keypair) {
      return failure(new Error('Keypair not available for signing'));
    }

    try {
      const messageJson = this.encodeMessage(message);
      const messageBytes = Buffer.from(messageJson, 'utf-8');

      // Sign using the keypair's secret key and Ed25519
      const signature = nacl.sign.detached(messageBytes, this.keypair.secretKey);

      const signed: MPPMessage = {
        ...message,
        signature: Buffer.from(signature).toString('hex'),
      };

      logger.debug('MPP message signed');
      return success(signed);
    } catch (err) {
      return failure(
        new Error(`Failed to sign message: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }

  /**
   * Verify message signature using Ed25519
   */
  verifySignature(message: MPPMessage, publicKeyHex: string): Result<true, Error> {
    if (!message.signature) {
      return failure(new Error('Message is not signed'));
    }

    try {
      const publicKey = new PublicKey(publicKeyHex);
      const { signature: _, ...messageWithoutSignature } = message;
      const messageJson = this.encodeMessage(messageWithoutSignature);
      const messageBytes = Buffer.from(messageJson, 'utf-8');
      const signatureBytes = Buffer.from(message.signature, 'hex');

      // Verify Ed25519 signature
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());

      if (!isValid) {
        return failure(new Error('Invalid signature'));
      }

      logger.debug('MPP message signature verified');
      return success(true);
    } catch (err) {
      return failure(
        new Error(`Failed to verify signature: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }

  /**
   * Verify payment request is valid (not expired, unique nonce)
   */
  verifyPaymentRequest(message: MPPMessage, maxAgeSeconds: number = 300): Result<true, Error> {
    if (message.messageType !== 'payment_request') {
      return failure(new Error('Not a payment request'));
    }

    // Validate required fields
    if (!message.nonce) {
      return failure(new Error('Nonce is required'));
    }

    // Check age
    const ageSeconds = (Date.now() - message.timestamp.getTime()) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      return failure(new Error(`Payment request expired (age: ${ageSeconds}s)`));
    }

    // Check nonce (replay prevention)
    if (this.nonces.has(message.nonce)) {
      return failure(new Error('Nonce already used (replay attack detected)'));
    }

    // Validate service and wallet
    if (message.serviceId !== this.serviceId) {
      return failure(new Error('Service ID does not match'));
    }

    if (message.amount <= 0) {
      return failure(new Error('Amount must be positive'));
    }

    // Record nonce
    if (message.nonce) {
      this.nonces.add(message.nonce);
      if (this.nonces.size > this.maxNonces) {
        const noncesArr = Array.from(this.nonces);
        for (let i = 0; i < 500; i++) {
          const nonce = noncesArr[i];
          if (nonce) this.nonces.delete(nonce);
        }
      }
    }

    logger.debug('MPP payment request verified', {
      serviceId: this.serviceId,
      nonce: message.nonce?.slice(0, 8) ?? 'undefined',
    });

    return success(true);
  }

  /**
   * Create a payment proof message (proof of payment over Solana)
   */
  createPaymentProof(txSignature: string, amount: number, requestNonce: string): MPPMessage {
    const nonce = randomBytes(32).toString('hex');

    return {
      version: '1.0',
      messageType: 'payment_proof',
      serviceId: this.serviceId,
      walletPublicKey: this.walletPublicKey.toBase58(),
      amount,
      nonce: `${requestNonce}:${txSignature}:${nonce}`, // Correlate with request
      timestamp: new Date(),
    };
  }

  /**
   * Serialize message to JSON for signing
   */
  private encodeMessage(message: Omit<MPPMessage, 'signature'>): string {
    return JSON.stringify({
      version: message.version,
      messageType: message.messageType,
      serviceId: message.serviceId,
      walletPublicKey: message.walletPublicKey,
      amount: message.amount,
      nonce: message.nonce,
      timestamp: message.timestamp.toISOString(),
    });
  }

  /**
   * Serialize message to transportable JSON
   */
  toJSON(message: MPPMessage): string {
    return JSON.stringify({
      version: message.version,
      messageType: message.messageType,
      serviceId: message.serviceId,
      walletPublicKey: message.walletPublicKey,
      amount: message.amount,
      nonce: message.nonce,
      ...(message.signature && { signature: message.signature }),
      timestamp: message.timestamp.toISOString(),
    });
  }

  /**
   * Parse JSON back to MPPMessage
   */
  static fromJSON(json: string): Result<MPPMessage, Error> {
    try {
      const parsed = JSON.parse(json) as Omit<MPPMessage, 'timestamp'> & { timestamp: string };
      const message: MPPMessage = {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };

      if (!message.version || !message.messageType || !message.serviceId) {
        throw new Error('Missing required fields');
      }

      return success(message);
    } catch (err) {
      return failure(
        new Error(
          `Failed to parse MPP message: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }
}

// Per-service MPP handler registry
const handlers = new Map<string, MPPHandler>();

export function getMPPHandler(
  serviceId: string,
  walletPublicKey: string,
  keypair?: Keypair
): MPPHandler {
  const key = `${serviceId}:${walletPublicKey}`;

  if (!handlers.has(key)) {
    handlers.set(key, new MPPHandler(serviceId, walletPublicKey, keypair));
  }

  return handlers.get(key)!;
}
