/**
 * x402 Protocol Handler
 *
 * Implements HTTP 402 Payment Required for pay-per-use Solana services.
 * Generates payment descriptors and verifies payment proofs.
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402
 */

import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import { Result, success, failure } from '../types/shared.js';
import { X402PaymentDescriptor } from '../types/internal.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('X402_PROTOCOL');

/**
 * x402 Protocol Handler
 */
export class X402Handler {
  private servicePublicKey: PublicKey;

  constructor(servicePublicKeyOrAddress: string) {
    try {
      this.servicePublicKey = new PublicKey(servicePublicKeyOrAddress);
    } catch (err) {
      throw new Error(`Invalid service public key: ${servicePublicKeyOrAddress}`);
    }
  }

  /**
   * Generate a payment descriptor (x402 Payment-Token header)
   *
   * Returns a descriptor that the client includes in their next request
   * to prove they have paid for access.
   */
  generatePaymentDescriptor(
    amount: number, // Lamports
    durationSeconds: number = 300 // 5 min expiry
  ): X402PaymentDescriptor {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    const descriptor: X402PaymentDescriptor = {
      paymentAddress: this.servicePublicKey.toBase58(),
      amount,
      requestId: uuidv4(),
      expiresAt,
    };

    logger.info('x402 payment descriptor generated', {
      amount,
      requestId: descriptor.requestId,
      expiresAt: expiresAt.toISOString(),
    });

    return descriptor;
  }

  /**
   * Verify payment descriptor is still valid
   */
  verifyDescriptor(descriptor: X402PaymentDescriptor): Result<true, Error> {
    if (descriptor.expiresAt.getTime() < Date.now()) {
      return failure(new Error('Payment descriptor has expired'));
    }

    if (descriptor.amount <= 0) {
      return failure(new Error('Payment amount must be positive'));
    }

    // Verify service address matches
    if (descriptor.paymentAddress !== this.servicePublicKey.toBase58()) {
      return failure(new Error('Payment address does not match service'));
    }

    return success(true);
  }

  /**
   * Parse x402 header from request (base64 JSON)
   */
  static parseX402Header(headerValue: string): Result<X402PaymentDescriptor, Error> {
    try {
      const json = Buffer.from(headerValue, 'base64').toString('utf-8');
      const parsed = JSON.parse(json) as Omit<X402PaymentDescriptor, 'expiresAt'> & { expiresAt: string };

      // Validate required fields
      if (!parsed.paymentAddress || !parsed.requestId || !parsed.amount) {
        throw new Error('Missing required fields');
      }

      const descriptor: X402PaymentDescriptor = {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
      };
      return success(descriptor);
    } catch (err) {
      return failure(
        new Error(`Failed to parse x402 header: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  }

  /**
   * Encode descriptor as x402 header (base64 JSON)
   */
  static encodeX402Header(descriptor: X402PaymentDescriptor): string {
    const json = JSON.stringify({
      paymentAddress: descriptor.paymentAddress,
      amount: descriptor.amount,
      requestId: descriptor.requestId,
      expiresAt: descriptor.expiresAt.toISOString(),
      accessToken: descriptor.accessToken,
    });

    return Buffer.from(json).toString('base64');
  }
}

// Singleton instance per service
const handlers = new Map<string, X402Handler>();

export function getX402Handler(servicePublicKey: string): X402Handler {
  if (!handlers.has(servicePublicKey)) {
    handlers.set(servicePublicKey, new X402Handler(servicePublicKey));
  }
  return handlers.get(servicePublicKey)!;
}
