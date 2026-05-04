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
import { NativeStakeAdapter, NativeWrapperAdapter } from './native-adapters.js';
import { DeFiIntent, DeFiIntentResult } from './intent-types.js';
import { createLogger } from '../utils/logger.js';
import { Result, success, failure } from '../types/shared.js';
import { buildMemoTransaction } from '../rpc/index.js';

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
    const nativeStakeAdapter = new NativeStakeAdapter();
    const marinadAdapter = new MarinadAdapter();
    const lidoAdapter = new LidoAdapter();
    const jitoAdapter = new JitoAdapter();

    this.staking.set('native', nativeStakeAdapter);
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

    const nativeWrapperAdapter = new NativeWrapperAdapter();
    this.wrapper.set('native_wrapper', nativeWrapperAdapter);

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

        case 'unstake':
          return await this.executeUnstake(walletAddress, intent, tenantId);

        case 'wrap_token':
          return await this.executeWrapToken(walletAddress, intent, tenantId);

        case 'unwrap_token':
          return await this.executeUnwrapToken(walletAddress, intent, tenantId);

        case 'liquid_stake':
          return await this.executeLiquidStake(walletAddress, intent, tenantId);

        case 'provide_liquidity':
          return await this.executeLiquidityIntent(walletAddress, intent, tenantId, 'provide_liquidity');

        case 'remove_liquidity':
          return await this.executeLiquidityIntent(walletAddress, intent, tenantId, 'remove_liquidity');

        case 'deposit_lending':
          return await this.executeDepositLending(walletAddress, intent, tenantId);

        case 'withdraw_lending':
          return await this.executeWithdrawLending(walletAddress, intent, tenantId);

        case 'borrow_lending':
          return await this.executeBorrowLending(walletAddress, intent, tenantId);

        case 'repay_lending':
          return await this.executeRepayLending(walletAddress, intent, tenantId);

        case 'farm_deposit':
          return await this.executeFarmIntent(walletAddress, intent, tenantId, 'farm_deposit');

        case 'farm_harvest':
          return await this.executeFarmIntent(walletAddress, intent, tenantId, 'farm_harvest');

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
      const preferredDexes = Array.isArray(intent.dexes) && intent.dexes.length > 0 ? intent.dexes : ['jupiter', 'raydium', 'orca'];

      for (const dexName of preferredDexes) {
        const dex = this.dex.get(dexName);
        if (!dex) {
          continue;
        }

        const quoteResult = await dex.routeSwap({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          amount: intent.inputAmount,
          slippage: intent.slippage,
        });

        if (quoteResult.ok) {
          const quote = quoteResult.value!;
          const txResult = await dex.buildSwapTx({
            payer: walletAddress,
            quote,
            wrapUnwrap: intent.permitFallback,
          });

          if (txResult.ok) {
            const mockSignature = 'mock-signature-' + Date.now();
            return success({
              signature: mockSignature,
              type: 'swap',
              inputAmount: intent.inputAmount,
              outputAmount: quote.outputAmount,
              protocol: quote.protocol,
              priceImpact: quote.priceImpact,
              timestamp: new Date(),
              confirmations: 0,
              transaction: txResult.value!.tx,
            });
          }
        }
      }

      return failure(new Error('Swap execution failed'));
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeUnstake(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const protocol = intent.protocol ?? 'native';
      const staking = this.staking.get(protocol);

      if (!staking) {
        return failure(new Error(`Unstake protocol not supported: ${protocol}`));
      }

      const stakeAccountAddress = intent.stakeAccountAddress ?? '';
      if (!stakeAccountAddress) {
        return failure(new Error('stakeAccountAddress is required for unstake'));
      }

      const txResult = await staking.unstake({
        payer: walletAddress,
        stakeAccountAddress,
        amount: intent.amount,
        immediateUnstake: intent.immediateUnstake,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown unstake error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'unstake',
        inputAmount: intent.amount,
        protocol,
        timestamp: new Date(),
        confirmations: 0,
        transaction: txResult.value,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeWrapToken(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const protocol = intent.protocol ?? 'native_wrapper';
      if (protocol !== 'native_wrapper') {
        return failure(new Error(`Wrap protocol not supported yet: ${protocol}`));
      }

      const wrapper = this.wrapper.get('native_wrapper');
      if (!wrapper) {
        return failure(new Error('Native wrapper adapter not initialized'));
      }

      const txResult = await wrapper.wrap({
        payer: walletAddress,
        sourceMint: intent.sourceMint,
        targetMint: intent.targetMint,
        amount: intent.amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown wrap error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'wrap_token',
        inputAmount: intent.amount,
        protocol,
        timestamp: new Date(),
        confirmations: 0,
        transaction: txResult.value,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeUnwrapToken(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const protocol = intent.protocol ?? 'native_wrapper';
      if (protocol !== 'native_wrapper') {
        return failure(new Error(`Unwrap protocol not supported yet: ${protocol}`));
      }

      const wrapper = this.wrapper.get('native_wrapper');
      if (!wrapper) {
        return failure(new Error('Native wrapper adapter not initialized'));
      }

      const txResult = await wrapper.unwrap({
        payer: walletAddress,
        wrappedMint: intent.wrappedMint,
        targetMint: intent.targetMint,
        amount: intent.amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown unwrap error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'unwrap_token',
        outputAmount: intent.amount,
        protocol,
        timestamp: new Date(),
        confirmations: 0,
        transaction: txResult.value,
      });
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
        transaction: txResult.value,
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

  private async executeWithdrawLending(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const lending = this.lending.get(intent.protocol);

      if (!lending) {
        return failure(new Error(`Lending protocol not supported: ${intent.protocol}`));
      }

      const amount = intent.amount ?? 0;
      const txResult = await lending.withdraw({
        payer: walletAddress,
        mint: intent.mint,
        amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown lending withdraw error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'withdraw_lending',
        outputAmount: amount,
        protocol: intent.protocol,
        timestamp: new Date(),
        confirmations: 0,
        transaction: txResult.value,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeRepayLending(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>> {
    try {
      const lending = this.lending.get(intent.protocol);

      if (!lending) {
        return failure(new Error(`Lending protocol not supported: ${intent.protocol}`));
      }

      const amount = intent.amount ?? 0;
      const txResult = await lending.repay({
        payer: walletAddress,
        mint: intent.mint,
        amount,
      });

      if (!txResult.ok) {
        return failure(txResult.error ?? new Error('Unknown lending repay error'));
      }

      return success({
        signature: 'mock-sig-' + Date.now(),
        type: 'repay_lending',
        inputAmount: amount,
        protocol: intent.protocol,
        timestamp: new Date(),
        confirmations: 0,
        transaction: txResult.value,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async executeLiquidityIntent(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string,
    type: 'provide_liquidity' | 'remove_liquidity'
  ): Promise<Result<DeFiIntentResult, Error>> {
    const memo = `AgenticWallet:${type}:${intent.protocol}:${intent.poolId}:${tenantId}`;
    const memoResult = await buildMemoTransaction(walletAddress, memo);

    if (!memoResult.ok) {
      return failure(memoResult.error ?? new Error(`Failed to build ${type} transaction`));
    }

    return success({
      signature: 'mock-sig-' + Date.now(),
      type,
      inputAmount: type === 'provide_liquidity' ? intent.amountA + intent.amountB : intent.lpTokenAmount,
      protocol: intent.protocol,
      timestamp: new Date(),
      confirmations: 0,
      transaction: memoResult.value,
    });
  }

  private async executeFarmIntent(
    walletAddress: PublicKey,
    intent: any,
    tenantId: string,
    type: 'farm_deposit' | 'farm_harvest'
  ): Promise<Result<DeFiIntentResult, Error>> {
    const memo = `AgenticWallet:${type}:${intent.protocol}:${intent.farmId}:${tenantId}`;
    const memoResult = await buildMemoTransaction(walletAddress, memo);

    if (!memoResult.ok) {
      return failure(memoResult.error ?? new Error(`Failed to build ${type} transaction`));
    }

    return success({
      signature: 'mock-sig-' + Date.now(),
      type,
      inputAmount: type === 'farm_deposit' ? intent.amount : undefined,
      protocol: intent.protocol,
      timestamp: new Date(),
      confirmations: 0,
      transaction: memoResult.value,
    });
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
