/**
 * DeFi Registry & Executor
 *
 * Central registry managing all protocol adapters and intent execution.
 */

import { PublicKey } from '@solana/web3.js';
import {
  DexAdapter,
  StakingAdapter,
  AmmAdapter,
  LendingAdapter,
  FarmingAdapter,
  WrapperAdapter,
  PriceOracle,
  DeFiRegistry,
} from './adapters.js';
import { JupiterAdapter, RaydiumAdapter, OrcaAdapter } from './dex-adapters.js';
import { MarinadAdapter, LidoAdapter, JitoAdapter } from './staking-adapters.js';
import { SolendAdapter, MangoAdapter, PortFinanceAdapter } from './lending-adapters.js';
import { DeFiIntent, DeFiIntentResult } from './intent-types.js';
import { createLogger } from '../utils/logger.js';
import { Result, success, failure } from '../types/shared.js';

const logger = createLogger('DEFI_REGISTRY');

/**
 * Mock price oracle
 */
class MockPriceOracle implements PriceOracle {
  async getMint(mint: string): Promise<{
    ok: boolean;
    value?: { price: number; lastUpdated: Date; source: string };
    error?: Error;
  }> {
    const prices: Record<string, number> = {
      So11111111111111111111111111111111111111112: 140, // SOL
      EPjFWdd5Au57zLLs2btkQSo3jzSgv91stKL59z8p6vW: 1.0, // USDC
      SRMuApVgqbCVRuKfzvmuUp3Q5wLZnLXp6CNVWYvg5Fj: 8.5, // SRM
      mSoLzYCxHdgqyuwrZgaqMMUQbW39Rk47TCWRaufqgr: 138, // mSOL
      '7dHbWXmCI3dT97a39q38En3MCZ1RA7cLaftQwTalnrA': 135, // stSOL
    };

    const price = prices[mint] ?? 1.0;

    return {
      ok: true,
      value: {
        price,
        lastUpdated: new Date(),
        source: 'mock',
      },
    };
  }

  async getPriceHistory(mint: string, timeframe: '1h' | '1d' | '7d'): Promise<{
    ok: boolean;
    value?: Array<{ timestamp: Date; price: number }>;
    error?: Error;
  }> {
    return {
      ok: true,
      value: [
        { timestamp: new Date(Date.now() - 3600000), price: 140 },
        { timestamp: new Date(), price: 142 },
      ],
    };
  }
}

/**
 * Central DeFi Registry
 */
export class DeFiRegistryImpl implements DeFiRegistry {
  dex: Map<string, DexAdapter> = new Map();
  staking: Map<string, StakingAdapter> = new Map();
  amm: Map<string, AmmAdapter> = new Map();
  lending: Map<string, LendingAdapter> = new Map();
  farming: Map<string, FarmingAdapter> = new Map();
  wrapper: Map<string, WrapperAdapter> = new Map();
  oracle: PriceOracle;

  constructor() {
    this.oracle = new MockPriceOracle();

    // Register DEX adapters
    const jupiterAdapter = new JupiterAdapter();
    const raydiumAdapter = new RaydiumAdapter();
    const orcaAdapter = new OrcaAdapter();

    this.dex.set('jupiter', jupiterAdapter);
    this.dex.set('raydium', raydiumAdapter);
    this.dex.set('orca', orcaAdapter);

    // Register staking adapters
    const marinadAdapter = new MarinadAdapter();
    const lidoAdapter = new LidoAdapter();
    const jitoAdapter = new JitoAdapter();

    this.staking.set('marinade', marinadAdapter);
    this.staking.set('lido', lidoAdapter);
    this.staking.set('jito', jitoAdapter);

    // Register lending adapters
    const solendAdapter = new SolendAdapter();
    const mangoAdapter = new MangoAdapter();
    const portAdapter = new PortFinanceAdapter();

    this.lending.set('solend', solendAdapter);
    this.lending.set('mango', mangoAdapter);
    this.lending.set('port_finance', portAdapter);

    logger.info('DeFi registry initialized with all protocol adapters', {
      dexCount: this.dex.size,
      stakingCount: this.staking.size,
      lendingCount: this.lending.size,
    });
  }

  /**
   * Execute a DeFi intent
   */
  async executeIntent(
    walletAddress: PublicKey,
    intent: DeFiIntent,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      logger.info('Executing DeFi intent', {
        type: intent.type,
        wallet: walletAddress.toBase58(),
        tenant: tenantId,
      });

      switch (intent.type) {
        case 'swap':
          return await this.executeSwap(walletAddress, intent, tenantId);

        case 'stake':
          return await this.executeStake(walletAddress, intent, tenantId);

        case 'liquid_stake':
          return await this.executeLiquidStake(walletAddress, intent, tenantId);

        case 'deposit_lending':
          return await this.executeDepositLending(walletAddress, intent, tenantId);

        case 'borrow_lending':
          return await this.executeBorrowLending(walletAddress, intent, tenantId);

        case 'composite_strategy':
          return await this.executeCompositeStrategy(walletAddress, intent, tenantId);

        default:
          return failure(new Error(`Unsupported intent type: ${(intent as any).type}`));
      }
    } catch (err) {
      logger.error('DeFi intent execution failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeSwap(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      // Try Jupiter first (best routing)
      const jupiter = this.dex.get('jupiter');
      if (jupiter) {
        const quoteResult = await jupiter.routeSwap({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          amount: intent.inputAmount,
          slippage: intent.slippage,
        });

        if (quoteResult.ok) {
          const quote = quoteResult.value!;
          const txResult = await jupiter.buildSwapTx({
            payer: walletAddress,
            quote,
            wrapUnwrap: intent.permitFallback,
          });

          if (txResult.ok) {
            return success({
              signature: 'mock-signature-' + Date.now(),
              type: 'swap',
              inputAmount: intent.inputAmount,
              outputAmount: quote.outputAmount,
              protocol: 'jupiter',
              priceImpact: quote.priceImpact,
              timestamp: new Date(),
              confirmations: 0,
            });
          }
        }
      }

      return failure(new Error('Swap execution failed'));
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeStake(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const protocol = intent.protocol ?? 'native';
      const staking = this.staking.get(protocol);

      if (!staking) {
        return failure(new Error(`Staking protocol not supported: ${protocol}`));
      }

      const txResult = await staking.stake({
        payer: walletAddress,
        amount: intent.amount,
        validatorVoteAddress: intent.validatorVoteAddress,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown stake error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'stake',
        inputAmount: intent.amount,
        protocol,
        timestamp: new Date(),
        confirmations: 0,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeLiquidStake(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const protocol = intent.protocol;
      const staking = this.staking.get(protocol);

      if (!staking) {
        return failure(new Error(`Liquid staking protocol not supported: ${protocol}`));
      }

      const txResult = await staking.deposit({
        payer: walletAddress,
        amount: intent.amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown deposit error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'liquid_stake',
        inputAmount: intent.amount,
        protocol,
        timestamp: new Date(),
        confirmations: 0,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeDepositLending(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const lending = this.lending.get(intent.protocol);

      if (!lending) {
        return failure(new Error(`Lending protocol not supported: ${intent.protocol}`));
      }

      const txResult = await lending.deposit({
        payer: walletAddress,
        mint: intent.mint,
        amount: intent.amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown lending error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'deposit_lending',
        inputAmount: intent.amount,
        protocol: intent.protocol,
        timestamp: new Date(),
        confirmations: 0,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeBorrowLending(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const lending = this.lending.get(intent.protocol);

      if (!lending) {
        return failure(new Error(`Lending protocol not supported: ${intent.protocol}`));
      }

      // Check borrowing power first
      const powerResult = await lending.getBorrowingPower(walletAddress.toBase58());
      if (!powerResult.ok || !powerResult.value || powerResult.value < intent.amount) {
        return failure(new Error('Insufficient borrowing power'));
      }

      const txResult = await lending.borrow({
        payer: walletAddress,
        mint: intent.mint,
        amount: intent.amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown borrow error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'borrow_lending',
        outputAmount: intent.amount,
        protocol: intent.protocol,
        timestamp: new Date(),
        confirmations: 0,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeCompositeStrategy(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      logger.info('Executing composite strategy', {
        stepCount: intent.steps.length,
        description: intent.description,
      });

      for (const step of intent.steps) {
        const result = await this.executeIntent(walletAddress, step, tenantId);

        if (!result.ok) {
          if (intent.stopOnError) {
            return failure(result.error);
          }
          logger.warn('Composite strategy step failed (continuing)', {
            step: step.type,
            error: result.error.message,
          });
        }
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'composite_strategy',
        protocol: 'composite',
        timestamp: new Date(),
        confirmations: 0,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

// Singleton instance
let registryInstance: DeFiRegistryImpl | null = null;

export function getDeFiRegistry(): DeFiRegistry {
  if (!registryInstance) {
    registryInstance = new DeFiRegistryImpl();
  }
  return registryInstance;
}

export function resetDeFiRegistry(): void {
  registryInstance = null;
}
