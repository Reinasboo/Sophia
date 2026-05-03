/**
 * DeFi Protocol Intent Types
 *
 * Intents for all DeFi operations: swaps, staking, lending, farming, etc.
 */

import type { Transaction, VersionedTransaction } from '@solana/web3.js';

/**
 * Swap intent - route swap through best DEX
 */
export interface SwapIntent {
  type: 'swap';
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  minOutputAmount?: number;
  slippage?: number; // 0.5 = 0.5%
  dexes?: ('jupiter' | 'raydium' | 'orca' | 'serum')[]; // Preferred DEXes
  permitFallback?: boolean; // Allow token wrapping/unwrapping
}

/**
 * Stake intent - delegate SOL to validator
 */
export interface StakeIntent {
  type: 'stake';
  amount: number;
  protocol: 'native' | 'marinade' | 'lido' | 'jito' | 'socean';
  validatorVoteAddress?: string;
  delegateAtEpoch?: number;
}

/**
 * Unstake intent
 */
export interface UnstakeIntent {
  type: 'unstake';
  amount: number;
  protocol: 'native' | 'marinade' | 'lido' | 'jito' | 'socean';
  stakeAccountAddress?: string;
  immediateUnstake?: boolean;
}

/**
 * Liquid staking intent - wrap SOL into liquid staking token
 */
export interface LiquidStakeIntent {
  type: 'liquid_stake';
  amount: number;
  protocol: 'marinade' | 'lido' | 'jito' | 'socean'; // Which liquid staking protocol
  targetToken?: string; // mSOL, stSOL, etc.
}

/**
 * Provide liquidity intent
 */
export interface ProvideLiquidityIntent {
  type: 'provide_liquidity';
  poolId: string;
  tokenA: string;
  tokenB: string;
  amountA: number;
  amountB: number;
  slippage?: number;
  protocol: 'raydium' | 'orca' | 'kamino' | 'marinade_dsol';
}

/**
 * Remove liquidity intent
 */
export interface RemoveLiquidityIntent {
  type: 'remove_liquidity';
  poolId: string;
  lpTokenAmount: number;
  slippage?: number;
  protocol: 'raydium' | 'orca' | 'kamino';
}

/**
 * Deposit collateral into lending market
 */
export interface DepositLendingIntent {
  type: 'deposit_lending';
  mint: string;
  amount: number;
  protocol: 'solend' | 'mango' | 'port_finance' | 'apricot' | 'tulip';
}

/**
 * Withdraw collateral from lending market
 */
export interface WithdrawLendingIntent {
  type: 'withdraw_lending';
  mint: string;
  amount?: number; // Leave empty to withdraw all
  protocol: 'solend' | 'mango' | 'port_finance' | 'apricot' | 'tulip';
}

/**
 * Borrow from lending market
 */
export interface BorrowLendingIntent {
  type: 'borrow_lending';
  mint: string;
  amount: number;
  protocol: 'solend' | 'mango' | 'port_finance' | 'apricot' | 'tulip';
  targetHealthFactor?: number; // Stop borrowing at this health factor
}

/**
 * Repay loan
 */
export interface RepayLendingIntent {
  type: 'repay_lending';
  mint: string;
  amount?: number; // Leave empty to repay all
  protocol: 'solend' | 'mango' | 'port_finance' | 'apricot' | 'tulip';
}

/**
 * Deposit into yield farm
 */
export interface FarmDepositIntent {
  type: 'farm_deposit';
  farmId: string;
  amount: number;
  protocol: 'raydium_fusion' | 'tulip' | 'lifinity_yield' | 'sunny_aggregator';
}

/**
 * Harvest farm rewards
 */
export interface FarmHarvestIntent {
  type: 'farm_harvest';
  farmId: string;
  protocol: 'raydium_fusion' | 'tulip' | 'lifinity_yield' | 'sunny_aggregator';
}

/**
 * Wrap token (e.g., USDC Wormhole -> native USDC)
 */
export interface WrapTokenIntent {
  type: 'wrap_token';
  sourceMint: string;
  targetMint: string;
  amount: number;
  protocol: 'portal_bridge' | 'wormhole' | 'allbridge' | 'native_wrapper';
}

/**
 * Unwrap token
 */
export interface UnwrapTokenIntent {
  type: 'unwrap_token';
  wrappedMint: string;
  targetMint: string;
  amount: number;
  protocol: 'portal_bridge' | 'wormhole' | 'allbridge' | 'native_wrapper';
}

/**
 * Composite DeFi strategy intent
 * (e.g., swap → deposit → borrow loop)
 */
export interface CompositeStrategyIntent {
  type: 'composite_strategy';
  steps: DeFiIntent[];
  description: string;
  stopOnError?: boolean; // Stop if any step fails
  maxSlippage?: number;
  timeout?: number; // Milliseconds
}

/**
 * Union of all DeFi intent types
 */
export type DeFiIntent =
  | SwapIntent
  | StakeIntent
  | UnstakeIntent
  | LiquidStakeIntent
  | ProvideLiquidityIntent
  | RemoveLiquidityIntent
  | DepositLendingIntent
  | WithdrawLendingIntent
  | BorrowLendingIntent
  | RepayLendingIntent
  | FarmDepositIntent
  | FarmHarvestIntent
  | WrapTokenIntent
  | UnwrapTokenIntent
  | CompositeStrategyIntent;

/**
 * Extended intent result with DeFi-specific data
 */
export interface DeFiIntentResult {
  signature?: string;
  type: DeFiIntent['type'];
  inputAmount?: number;
  outputAmount?: number;
  tokenSwapped?: string;
  protocol?: string;
  priceImpact?: number;
  timestamp: Date;
  confirmations: number;
  transaction?: Transaction | VersionedTransaction;
}
