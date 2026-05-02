/**
 * DeFi Protocol Integrations
 *
 * Complete multi-protocol support for Solana DeFi:
 * - Swaps: Jupiter, Raydium, Orca, Serum
 * - Staking: Marinade, Lido, Jito, Socean
 * - Lending: Solend, Mango, Port Finance, Apricot, Tulip
 * - Farming: Raydium Fusion, Tulip, Lifinity, Sunny Aggregator
 * - Wrapping: Portal Bridge, Wormhole, Allbridge
 */

export type { DexAdapter, StakingAdapter, AmmAdapter, LendingAdapter, FarmingAdapter, WrapperAdapter, PriceOracle, DeFiRegistry } from './adapters.js';
export { JupiterAdapter, RaydiumAdapter, OrcaAdapter } from './dex-adapters.js';
export { MarinadAdapter, LidoAdapter, JitoAdapter } from './staking-adapters.js';
export { SolendAdapter, MangoAdapter, PortFinanceAdapter } from './lending-adapters.js';
export type {
  SwapIntent,
  StakeIntent,
  UnstakeIntent,
  LiquidStakeIntent,
  ProvideLiquidityIntent,
  RemoveLiquidityIntent,
  DepositLendingIntent,
  WithdrawLendingIntent,
  BorrowLendingIntent,
  RepayLendingIntent,
  FarmDepositIntent,
  FarmHarvestIntent,
  WrapTokenIntent,
  UnwrapTokenIntent,
  CompositeStrategyIntent,
  DeFiIntent,
  DeFiIntentResult,
} from './intent-types.js';
export { getDeFiRegistry, resetDeFiRegistry } from './registry.js';
