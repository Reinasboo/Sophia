/**
 * DeFi Protocol Adapters
 *
 * Unified interfaces for all major Solana DeFi protocols.
 * Supports: Jupiter, Raydium, Lido, Marinade, Solend, Mango, Port Finance,
 * Kamino, Orca, Serum, Magic Eden, Civic, and others.
 */

import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import type { Result } from '../types/shared.js';
import type { DeFiIntent, DeFiIntentResult } from './intent-types.js';

/**
 * Swap quote from DEX routers
 */
export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  routePath: string[]; // Token mints in swap path
  estimatedGas: number;
  protocol: 'jupiter' | 'raydium' | 'orca' | 'serum' | 'other';
}

/**
 * DEX routing adapter (Jupiter, Raydium, Orca, Serum)
 */
export interface DexAdapter {
  name: string;
  routeSwap(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippage?: number;
    feeBps?: number;
  }): Promise<{ ok: boolean; value?: SwapQuote; error?: Error }>;

  buildSwapTx(params: {
    payer: PublicKey;
    quote: SwapQuote;
    userTokenAccount?: PublicKey;
    wrapUnwrap?: boolean;
  }): Promise<{ ok: boolean; value?: { tx: Transaction; signers: string[] }; error?: Error }>;
}

/**
 * Staking reward account from Lido, Marinade
 */
export interface StakingReward {
  validatorVoteAddress: string;
  apr: number;
  commission: number;
  delegatedStake: number;
  activatedEpoch: number;
}

/**
 * Staking & liquid staking adapter
 */
export interface StakingAdapter {
  name: string;
  protocol: 'lido' | 'marinade' | 'jito' | 'socean' | 'sanctum';

  // Query staking opportunities
  getValidators(): Promise<{ ok: boolean; value?: StakingReward[]; error?: Error }>;

  // Delegate SOL to validator
  stake(params: {
    payer: PublicKey;
    validatorVoteAddress?: string;
    amount: number;
    delegateAtEpoch?: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Unstake (warm or immediate)
  unstake(params: {
    payer: PublicKey;
    stakeAccountAddress: string;
    amount?: number;
    immediateUnstake?: boolean;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // For liquid staking: wrap SOL -> stSOL
  deposit(params: {
    payer: PublicKey;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // For liquid staking: unwrap stSOL -> SOL
  withdraw(params: {
    payer: PublicKey;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Query APY
  getApy(): Promise<{ ok: boolean; value?: number; error?: Error }>;
}

/**
 * Liquidity pool position
 */
export interface LpPosition {
  poolId: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAAmount: number;
  tokenBAmount: number;
  lpTokenAmount: number;
  shareOfPool: number;
  protocol: 'raydium' | 'orca' | 'marinade' | 'other';
}

/**
 * AMM/Liquidity provider adapter
 */
export interface AmmAdapter {
  name: string;
  protocol: 'raydium' | 'orca' | 'marinade_dsol' | 'kamino';

  // Query pool info
  getPool(poolId: string): Promise<{ ok: boolean; value?: any; error?: Error }>;

  // Provide liquidity
  addLiquidity(params: {
    payer: PublicKey;
    poolId: string;
    tokenAAmount: number;
    tokenBAmount: number;
    slippage?: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Remove liquidity
  removeLiquidity(params: {
    payer: PublicKey;
    poolId: string;
    lpTokenAmount: number;
    slippage?: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Query user's LP positions
  getUserPositions(walletAddress: string): Promise<{ ok: boolean; value?: LpPosition[]; error?: Error }>;

  // Get pool APY
  getPoolApy(poolId: string): Promise<{ ok: boolean; value?: number; error?: Error }>;
}

/**
 * Lending market reserve
 */
export interface LendingReserve {
  mint: string;
  depositApy: number;
  borrowApy: number;
  totalDeposits: number;
  totalBorrows: number;
  utilizationRate: number;
  liquidationThreshold: number;
}

/**
 * Lending protocol adapter (Solend, Mango, Port Finance)
 */
export interface LendingAdapter {
  name: string;
  protocol: 'solend' | 'mango' | 'port_finance' | 'apricot' | 'tulip';

  // Query reserve information
  getReserves(): Promise<{ ok: boolean; value?: LendingReserve[]; error?: Error }>;

  // Deposit collateral
  deposit(params: {
    payer: PublicKey;
    mint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Withdraw collateral
  withdraw(params: {
    payer: PublicKey;
    mint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Borrow asset
  borrow(params: {
    payer: PublicKey;
    mint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Repay loan
  repay(params: {
    payer: PublicKey;
    mint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Get user's deposit & borrow balance
  getUserBalance(walletAddress: string): Promise<{
    ok: boolean;
    value?: { deposits: Record<string, number>; borrows: Record<string, number> };
    error?: Error;
  }>;

  // Get borrowing power
  getBorrowingPower(walletAddress: string): Promise<{ ok: boolean; value?: number; error?: Error }>;
}

/**
 * Yield farming opportunity
 */
export interface FarmingOpportunity {
  farmId: string;
  protocol: string;
  lpToken: string;
  rewardTokens: string[];
  apr: number;
  tvl: number;
  dailyReward: number;
  lockupPeriod?: number;
}

/**
 * Yield farming adapter
 */
export interface FarmingAdapter {
  name: string;
  protocol: 'raydium_fusion' | 'tulip' | 'lifinity_yield' | 'sunny_aggregator';

  // List available farms
  getFarms(): Promise<{ ok: boolean; value?: FarmingOpportunity[]; error?: Error }>;

  // Deposit LP tokens into farm
  depositFarm(params: {
    payer: PublicKey;
    farmId: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Withdraw LP tokens from farm
  withdrawFarm(params: {
    payer: PublicKey;
    farmId: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Harvest rewards
  harvest(params: { payer: PublicKey; farmId: string }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Get user's farm positions
  getUserFarms(walletAddress: string): Promise<{
    ok: boolean;
    value?: { farmId: string; stakedAmount: number; pendingRewards: Record<string, number> }[];
    error?: Error;
  }>;
}

/**
 * Token wrapper for bridged/wrapped assets
 */
export interface WrapperAdapter {
  name: string;
  protocol: 'portal_bridge' | 'wormhole' | 'allbridge' | 'native_wrapper';

  // Wrap token
  wrap(params: {
    payer: PublicKey;
    sourceMint: string;
    targetMint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Unwrap token
  unwrap(params: {
    payer: PublicKey;
    wrappedMint: string;
    targetMint: string;
    amount: number;
  }): Promise<{ ok: boolean; value?: Transaction; error?: Error }>;

  // Get exchange rate
  getExchangeRate(sourceMint: string, targetMint: string): Promise<{ ok: boolean; value?: number; error?: Error }>;
}

/**
 * Oracle for price feeds
 */
export interface PriceOracle {
  getMint(mint: string): Promise<{
    ok: boolean;
    value?: { price: number; lastUpdated: Date; source: string };
    error?: Error;
  }>;

  getPriceHistory(mint: string, timeframe: '1h' | '1d' | '7d'): Promise<{
    ok: boolean;
    value?: Array<{ timestamp: Date; price: number }>;
    error?: Error;
  }>;
}

/**
 * Registry of all protocol adapters
 */
export interface DeFiRegistry {
  dex: Map<string, DexAdapter>; // jupiter, raydium, orca, serum
  staking: Map<string, StakingAdapter>; // lido, marinade, jito, socean
  amm: Map<string, AmmAdapter>; // raydium, orca, kamino
  lending: Map<string, LendingAdapter>; // solend, mango, port
  farming: Map<string, FarmingAdapter>; // raydium_fusion, tulip
  wrapper: Map<string, WrapperAdapter>; // portal, wormhole
  oracle: PriceOracle;
  executeIntent(
    walletAddress: PublicKey,
    intent: DeFiIntent,
    tenantId: string
  ): Promise<Result<DeFiIntentResult, Error>>;
}
