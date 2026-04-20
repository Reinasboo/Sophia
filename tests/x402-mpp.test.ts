/**
 * x402 and MPP Protocol Tests
 *
 * Tests for HTTP 402 Payment Required and Micropayment Protocol handlers:
 * - x402 payment descriptor generation and validation
 * - MPP message creation and verification
 * - Signature verification
 * - Nonce-based replay prevention
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { X402Handler, getX402Handler } from '../src/rpc/x402-handler';
import { MPPHandler, getMPPHandler } from '../src/rpc/mpp-handler';

describe('x402 Protocol Handler', () => {
  let handler: X402Handler;
  let servicePublicKey: string;

  beforeEach(() => {
    const serviceKeypair = Keypair.generate();
    servicePublicKey = serviceKeypair.publicKey.toBase58();
    handler = new X402Handler(servicePublicKey);
  });

  describe('Payment Descriptor Generation', () => {
    it('should generate valid payment descriptor', () => {
      const descriptor = handler.generatePaymentDescriptor(2_000_000, 300);

      expect(descriptor.paymentAddress).toBe(servicePublicKey);
      expect(descriptor.amount).toBe(2_000_000);
      expect(descriptor.requestId).toMatch(/^[0-9a-f]{8}-/);
      expect(descriptor.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should verify valid descriptor', () => {
      const descriptor = handler.generatePaymentDescriptor(1_000_000, 60);
      const result = handler.verifyDescriptor(descriptor);

      expect(result.ok).toBe(true);
    });

    it('should reject expired descriptor', () => {
      const descriptor = handler.generatePaymentDescriptor(1_000_000, -10); // Already expired
      const result = handler.verifyDescriptor(descriptor);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/expired/i);
    });

    it('should reject descriptor with zero or negative amount', () => {
      const descriptor = handler.generatePaymentDescriptor(0, 300);
      const result = handler.verifyDescriptor(descriptor);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/positive/i);
    });
  });

  describe('x402 Header Encoding/Decoding', () => {
    it('should encode descriptor as base64 x402 header', () => {
      const descriptor = handler.generatePaymentDescriptor(1_000_000, 300);
      const header = X402Handler.encodeX402Header(descriptor);

      expect(header).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64
    });

    it('should decode x402 header back to descriptor', () => {
      const originalDescriptor = handler.generatePaymentDescriptor(1_000_000, 300);
      const header = X402Handler.encodeX402Header(originalDescriptor);

      const result = X402Handler.parseX402Header(header);

      expect(result.ok).toBe(true);
      expect(result.value.paymentAddress).toBe(originalDescriptor.paymentAddress);
      expect(result.value.amount).toBe(originalDescriptor.amount);
      expect(result.value.requestId).toBe(originalDescriptor.requestId);
    });

    it('should reject malformed x402 header', () => {
      const result = X402Handler.parseX402Header('not-valid-base64!!!');

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/parse|decode/i);
    });

    it('should reject header with missing required fields', () => {
      const incomplete = { paymentAddress: servicePublicKey };
      const base64 = Buffer.from(JSON.stringify(incomplete)).toString('base64');

      const result = X402Handler.parseX402Header(base64);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/Missing required fields/i);
    });
  });

  describe('x402 Handler Singleton', () => {
    it('should return same instance for same service key', () => {
      const handler1 = getX402Handler(servicePublicKey);
      const handler2 = getX402Handler(servicePublicKey);

      expect(handler1).toBe(handler2);
    });

    it('should return different instances for different service keys', () => {
      const keypair2 = Keypair.generate();
      const handler1 = getX402Handler(servicePublicKey);
      const handler2 = getX402Handler(keypair2.publicKey.toBase58());

      expect(handler1).not.toBe(handler2);
    });
  });
});

describe('MPP (Micropayment Protocol) Handler', () => {
  let handler: MPPHandler;
  let walletKeypair: Keypair;
  let walletPublicKey: string;

  beforeEach(() => {
    walletKeypair = Keypair.generate();
    walletPublicKey = walletKeypair.publicKey.toBase58();
    handler = new MPPHandler('test-service', walletPublicKey, walletKeypair);
  });

  describe('Payment Request Creation', () => {
    it('should create valid payment request message', () => {
      const message = handler.createPaymentRequest(1_000_000);

      expect(message.version).toBe('1.0');
      expect(message.messageType).toBe('payment_request');
      expect(message.serviceId).toBe('test-service');
      expect(message.walletPublicKey).toBe(walletPublicKey);
      expect(message.amount).toBe(1_000_000);
      expect(message.nonce).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create payment request with description', () => {
      const message = handler.createPaymentRequest(1_000_000, 'Pay for inference');

      expect(message.amount).toBe(1_000_000);
    });
  });

  describe('Message Signing and Verification', () => {
    it('should sign message with keypair', () => {
      const message = handler.createPaymentRequest(1_000_000);
      const signResult = handler.signMessage(message);

      expect(signResult.ok).toBe(true);
      expect(signResult.value.signature).toBeDefined();
      expect(signResult.value.signature).toMatch(/^[0-9a-f]+$/); // Hex string
    });

    it('should verify signed message signature', () => {
      const message = handler.createPaymentRequest(1_000_000);
      const signResult = handler.signMessage(message);

      expect(signResult.ok).toBe(true);

      const verifyResult = handler.verifySignature(
        signResult.value,
        walletPublicKey
      );

      expect(verifyResult.ok).toBe(true);
    });

    it('should reject message without signature', () => {
      const message = handler.createPaymentRequest(1_000_000);

      const result = handler.verifySignature(message, walletPublicKey);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/not signed/i);
    });
  });

  describe('Payment Request Validation', () => {
    it('should validate current payment request', () => {
      const message = handler.createPaymentRequest(1_000_000);
      const result = handler.verifyPaymentRequest(message);

      expect(result.ok).toBe(true);
    });

    it('should reject non-payment-request message', () => {
      const message = handler.createPaymentRequest(1_000_000);
      (message as any).messageType = 'payment_proof';

      const result = handler.verifyPaymentRequest(message);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/not a payment request/i);
    });

    it('should reject expired payment request', () => {
      const message = handler.createPaymentRequest(1_000_000);
      message.timestamp = new Date(Date.now() - 400_000); // 400 seconds ago (> 300s default)

      const result = handler.verifyPaymentRequest(message, 300);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/expired/i);
    });

    it('should reject duplicate nonce (replay)', () => {
      const message = handler.createPaymentRequest(1_000_000);

      const result1 = handler.verifyPaymentRequest(message);
      expect(result1.ok).toBe(true);

      // Try same nonce again
      const result2 = handler.verifyPaymentRequest(message);

      expect(result2.ok).toBe(false);
      expect(result2.error?.message).toMatch(/replay attack/i);
    });

    it('should reject message with mismatched service ID', () => {
      const message = handler.createPaymentRequest(1_000_000);
      (message as any).serviceId = 'another-service';

      const result = handler.verifyPaymentRequest(message);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/Service ID does not match/i);
    });

    it('should reject message with zero or negative amount', () => {
      const message = handler.createPaymentRequest(0);

      const result = handler.verifyPaymentRequest(message);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/positive/i);
    });
  });

  describe('Payment Proof Creation', () => {
    it('should create valid payment proof message', () => {
      const txSignature = 'ValidTransactionSignature1111111111111111111111111111111111111111111111';
      const amount = 1_000_000;
      const requestNonce = 'request-nonce';

      const proofMessage = handler.createPaymentProof(txSignature, amount, requestNonce);

      expect(proofMessage.version).toBe('1.0');
      expect(proofMessage.messageType).toBe('payment_proof');
      expect(proofMessage.amount).toBe(amount);
      expect(proofMessage.nonce).toContain(requestNonce);
      expect(proofMessage.nonce).toContain(txSignature);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize message to JSON', () => {
      const message = handler.createPaymentRequest(1_000_000);
      const json = handler.toJSON(message);

      expect(json).toContain('"version":"1.0"');
      expect(json).toContain('"messageType":"payment_request"');
      expect(json).toContain(`"amount":1000000`);
    });

    it('should deserialize JSON to message', () => {
      const original = handler.createPaymentRequest(1_000_000);
      const json = handler.toJSON(original);

      const result = MPPHandler.fromJSON(json);

      expect(result.ok).toBe(true);
      expect(result.value.version).toBe('1.0');
      expect(result.value.amount).toBe(1_000_000);
      expect(result.value.timestamp).toBeInstanceOf(Date);
    });

    it('should reject malformed JSON', () => {
      const result = MPPHandler.fromJSON('not-valid-json');

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/parse/i);
    });

    it('should reject JSON missing required fields', () => {
      const incomplete = { version: '1.0' };
      const json = JSON.stringify(incomplete);

      const result = MPPHandler.fromJSON(json);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/required fields/i);
    });
  });

  describe('MPP Handler Singleton', () => {
    it('should return same instance for same service and wallet', () => {
      const handler1 = getMPPHandler('service-1', walletPublicKey);
      const handler2 = getMPPHandler('service-1', walletPublicKey);

      expect(handler1).toBe(handler2);
    });

    it('should return different instances for different services', () => {
      const handler1 = getMPPHandler('service-1', walletPublicKey);
      const handler2 = getMPPHandler('service-2', walletPublicKey);

      expect(handler1).not.toBe(handler2);
    });
  });
});
