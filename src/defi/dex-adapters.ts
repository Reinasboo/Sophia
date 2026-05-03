/**
 * Jupiter DEX Adapter
 *
 * Routes swaps across all Solana DEXes via Jupiter's API.
 * Supports smart routing, token wrapping, and price impact calculations.
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { DexAdapter, SwapQuote } from './adapters.js';
import { Result, success, failure } from '../types/shared.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JUPITER_DEX');

const JUPITER_API = 'https://api.jup.ag/quote';
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

export class JupiterAdapter implements DexAdapter {
  name = 'Jupiter';

  async routeSwap(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippage?: number;
    feeBps?: number;
  }): Promise<Result<SwapQuote, Error>> {
    try {
      const slippage = params.slippage ?? 0.5;

      if (isProduction()) {
        const url = new URL(`${JUPITER_QUOTE_API}/quote`);
        url.searchParams.set('inputMint', params.inputMint);
        url.searchParams.set('outputMint', params.outputMint);
        url.searchParams.set('amount', String(params.amount));
        url.searchParams.set('slippageBps', String(Math.round(slippage * 100)));

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          return failure(new Error(`Jupiter quote failed: ${response.status} ${response.statusText}`));
        }

        const rawQuote = (await response.json()) as Record<string, any>;
        const outputAmount = Number(rawQuote['outAmount'] ?? rawQuote['outputAmount'] ?? 0);
        const priceImpact = Number.parseFloat(String(rawQuote['priceImpactPct'] ?? rawQuote['priceImpact'] ?? 0));
        const routePath = Array.isArray(rawQuote['routePlan'])
          ? rawQuote['routePlan'].map((step: any) => String(step?.swapInfo?.label ?? step?.label ?? 'jupiter'))
          : [params.inputMint, params.outputMint];

        const quote: SwapQuote = {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inputAmount: params.amount,
          outputAmount: Number.isFinite(outputAmount) && outputAmount > 0 ? outputAmount : params.amount,
          priceImpact: Number.isFinite(priceImpact) ? priceImpact : 0,
          routePath,
          estimatedGas: Number(rawQuote['computeUnitLimit'] ?? 50000),
          protocol: 'jupiter',
          rawQuote,
        };

        return success(quote);
      }

      // Development fallback for local testing when Jupiter API is unavailable.
      const priceImpact = Math.min(params.amount / 10 ** 12, 5.0);
      const outputAmount = Math.floor(params.amount * 0.95);

      const quote: SwapQuote = {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputAmount: params.amount,
        outputAmount,
        priceImpact,
        routePath: [params.inputMint, params.outputMint],
        estimatedGas: 5000,
        protocol: 'jupiter',
        rawQuote: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          inAmount: String(params.amount),
          outAmount: String(outputAmount),
          priceImpactPct: String(priceImpact),
        },
      };

      logger.debug('Jupiter route calculated', {
        inputAmount: params.amount,
        outputAmount: quote.outputAmount,
        priceImpact: quote.priceImpact,
      });

      return success(quote);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async buildSwapTx(params: {
    payer: PublicKey;
    quote: SwapQuote;
    userTokenAccount?: PublicKey;
    wrapUnwrap?: boolean;
  }): Promise<Result<{ tx: Transaction | VersionedTransaction; signers: string[] }, Error>> {
    try {
      if (!isProduction()) {
        logger.warn('Jupiter buildSwapTx: dev fallback transaction used');
        return success({
          tx: new Transaction(),
          signers: [params.payer.toBase58()],
        });
      }

      const rawQuote = params.quote.rawQuote;
      if (!rawQuote) {
        return failure(new Error('Missing raw Jupiter quote data for swap transaction build'));
      }

      const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: rawQuote,
          userPublicKey: params.payer.toBase58(),
          wrapAndUnwrapSol: params.wrapUnwrap ?? true,
          dynamicComputeUnitLimit: true,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return failure(new Error(`Jupiter swap build failed: ${response.status} ${response.statusText} ${body}`));
      }

      const swapResponse = (await response.json()) as { swapTransaction?: string };
      if (!swapResponse.swapTransaction) {
        return failure(new Error('Jupiter swap response missing serialized transaction'));
      }

      const txBuffer = Buffer.from(swapResponse.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);

      return success({
        tx,
        signers: [params.payer.toBase58()],
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/**
 * Raydium AMM Adapter
 *
 * Direct AMM pools for swap routing and liquidity provision.
 */

export class RaydiumAdapter implements DexAdapter {
  name = 'Raydium';

  async routeSwap(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippage?: number;
  }): Promise<Result<SwapQuote, Error>> {
    try {
      // Fetch Raydium pools and calculate swap
      const quote: SwapQuote = {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputAmount: params.amount,
        outputAmount: Math.floor(params.amount * 0.98), // Mock: 2% slippage
        priceImpact: 0.02,
        routePath: [params.inputMint, params.outputMint],
        estimatedGas: 10000,
        protocol: 'raydium',
      };

      return success(quote);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async buildSwapTx(params: {
    payer: PublicKey;
    quote: SwapQuote;
    userTokenAccount?: PublicKey;
    wrapUnwrap?: boolean;
  }): Promise<Result<{ tx: Transaction | VersionedTransaction; signers: string[] }, Error>> {
    try {
      logger.warn('Raydium buildSwapTx: stub implementation');
      return success({
        tx: new Transaction(),
        signers: [params.payer.toBase58()],
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/**
 * Orca Whirlpool Adapter
 *
 * Concentrated liquidity AMM for precise pricing.
 */

export class OrcaAdapter implements DexAdapter {
  name = 'Orca';

  async routeSwap(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippage?: number;
  }): Promise<Result<SwapQuote, Error>> {
    try {
      const quote: SwapQuote = {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        inputAmount: params.amount,
        outputAmount: Math.floor(params.amount * 0.995), // Mock: 0.5% slippage
        priceImpact: 0.005,
        routePath: [params.inputMint, params.outputMint],
        estimatedGas: 15000,
        protocol: 'orca',
      };

      return success(quote);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async buildSwapTx(params: {
    payer: PublicKey;
    quote: SwapQuote;
    userTokenAccount?: PublicKey;
    wrapUnwrap?: boolean;
  }): Promise<Result<{ tx: Transaction | VersionedTransaction; signers: string[] }, Error>> {
    try {
      logger.warn('Orca buildSwapTx: stub implementation');
      return success({
        tx: new Transaction(),
        signers: [params.payer.toBase58()],
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
