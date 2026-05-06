/**
 * Strategy Registry
 *
 * Central registry for all agent strategies.
 * Each strategy declares its name, description, parameter schema,
 * supported intents, and default configuration.
 *
 * Strategies produce intents only — they never sign or send transactions.
 * This registry enables dynamic strategy discovery for both the backend
 * and frontend (via API).
 */

import { z, ZodObject, ZodRawShape } from 'zod';
import type {
  ExecutionSettings as SharedExecutionSettings,
  StrategyFieldDescriptor as SharedStrategyFieldDescriptor,
} from '../types/shared.js';
import { getGmgnSkillsForStrategy } from '../integration/gmgn-skills.js';

// ============================================
// Strategy Definition Types
// ============================================

/**
 * Execution settings that apply to every strategy.
 */
export type ExecutionSettings = SharedExecutionSettings;

export const DEFAULT_EXECUTION_SETTINGS: ExecutionSettings = {
  cycleIntervalMs: 30_000,
  maxActionsPerDay: 100,
  enabled: true,
};

export const ExecutionSettingsSchema = z.object({
  cycleIntervalMs: z.number().int().min(5000).max(3_600_000).default(30_000),
  maxActionsPerDay: z.number().int().min(1).max(10_000).default(100),
  enabled: z.boolean().default(true),
});

/**
 * A strategy definition — registered once, used many times.
 */
export interface StrategyDefinition<TParams extends ZodRawShape = ZodRawShape> {
  /** Unique key, e.g. 'accumulator', 'copy_trader' */
  readonly name: string;
  /** Human-readable label */
  readonly label: string;
  /** Short description */
  readonly description: string;
  /** Intent types this strategy may produce */
  readonly supportedIntents: readonly string[];
  /** Zod schema for strategy-specific parameters */
  readonly paramSchema: ZodObject<TParams>;
  /** Default parameter values */
  readonly defaultParams: Record<string, unknown>;
  /** GMGN skills that best support this strategy */
  readonly gmgnSkills: readonly string[];
  /** Profit orientation for the strategy */
  readonly profitObjective:
    | 'capital_preservation'
    | 'yield_compounding'
    | 'trend_capture'
    | 'spread_capture'
    | 'drawdown_control'
    | 'portfolio_efficiency'
    | 'opportunistic_claims';
  /** Relative risk level used to sort and warn on strategies */
  readonly riskLevel: 'low' | 'medium' | 'high';
  /** Trading risk tier used to order strategies from degen to conservative */
  readonly riskTier: 'degen' | 'high' | 'medium' | 'low';
  /** Built-in guardrails that keep the strategy aligned with the objective */
  readonly guardrails: readonly string[];
  /** Whether this is a built-in or user/custom strategy */
  readonly builtIn: boolean;
  /** Icon hint for the frontend (lucide icon name) */
  readonly icon: string;
  /** Category for grouping in the UI */
  readonly category: 'income' | 'distribution' | 'trading' | 'utility' | 'custom';
}

/**
 * Serializable version of StrategyDefinition for API responses.
 * Replaces the Zod schema with a JSON-friendly field descriptor array.
 */
export interface StrategyDefinitionDTO {
  name: string;
  label: string;
  description: string;
  supportedIntents: string[];
  defaultParams: Record<string, unknown>;
  gmgnSkills: string[];
  profitObjective:
    | 'capital_preservation'
    | 'yield_compounding'
    | 'trend_capture'
    | 'spread_capture'
    | 'drawdown_control'
    | 'portfolio_efficiency'
    | 'opportunistic_claims';
  riskLevel: 'low' | 'medium' | 'high';
  riskTier: 'degen' | 'high' | 'medium' | 'low';
  guardrails: string[];
  builtIn: boolean;
  icon: string;
  category: string;
  fields: SharedStrategyFieldDescriptor[];
}

// ============================================
// Built-in Strategy Definitions
// ============================================

/** DCA Strategy - Dollar Cost Averaging */
export const DCAStrategyDef: StrategyDefinition = {
  name: 'dca',
  label: 'Dollar Cost Averaging',
  description:
    'Buy fixed USDC amount at regular intervals, regardless of price. Reduces timing risk.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    buyAmount: z.number().min(1).max(10000).default(100),
    buyToken: z.string().default('USDC'),
    targetToken: z.string().default('SOL'),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(5).default(0.5),
    frequencyHours: z.number().int().min(1).max(168).default(24),
    maxBuysPerDay: z.number().int().min(1).max(100).default(2),
  }),
  defaultParams: {
    buyAmount: 100,
    buyToken: 'USDC',
    targetToken: 'SOL',
    swapDex: 'jupiter',
    maxSlippage: 0.5,
    frequencyHours: 24,
    maxBuysPerDay: 2,
  },
  gmgnSkills: getGmgnSkillsForStrategy('dca'),
  profitObjective: 'capital_preservation',
  riskLevel: 'low',
  riskTier: 'low',
  guardrails: ['Fixed-size entries', 'Slippage cap', 'Daily buy limit'],
  builtIn: true,
  icon: 'TrendingUp',
  category: 'trading',
};

/** Grid Trading Strategy - Buy low, sell high */
export const GridTradingStrategyDef: StrategyDefinition = {
  name: 'grid_trading',
  label: 'Grid Trading',
  description:
    'Automatically buy at support levels and sell at resistance. Works best in sideways markets.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    targetToken: z.string().default('SOL'),
    gridLevels: z.number().int().min(3).max(50).default(10),
    gridSpread: z.number().min(0.5).max(10).default(2),
    buyAmount: z.number().min(10).max(5000).default(100),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(5).default(0.5),
    priceCheckIntervalMins: z.number().int().min(5).max(1440).default(30),
  }),
  defaultParams: {
    baseToken: 'USDC',
    targetToken: 'SOL',
    gridLevels: 10,
    gridSpread: 2,
    buyAmount: 100,
    swapDex: 'jupiter',
    maxSlippage: 0.5,
    priceCheckIntervalMins: 30,
  },
  gmgnSkills: getGmgnSkillsForStrategy('grid_trading'),
  profitObjective: 'spread_capture',
  riskLevel: 'medium',
  riskTier: 'medium',
  guardrails: ['Trade only in sideways markets', 'Slippage cap', 'Price-check cadence'],
  builtIn: true,
  icon: 'BarChart3',
  category: 'trading',
};

/** Momentum Trading Strategy - Follow price trends */
export const MomentumTradingStrategyDef: StrategyDefinition = {
  name: 'momentum_trading',
  label: 'Momentum Trading',
  description:
    'Buy tokens with positive price momentum, sell on reversal. Rides uptrends and downtrends.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    trackingTokens: z.array(z.string()).default(['SOL', 'JUP', 'ORCA']),
    lookbackPeriodHours: z.number().int().min(1).max(168).default(24),
    momentumThreshold: z.number().min(0.5).max(20).default(5),
    investmentPerToken: z.number().min(10).max(1000).default(50),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(5).default(0.5),
    takeProfit: z.number().min(1).max(50).default(10),
    stopLoss: z.number().min(1).max(20).default(5),
  }),
  defaultParams: {
    baseToken: 'USDC',
    trackingTokens: ['SOL', 'JUP', 'ORCA'],
    lookbackPeriodHours: 24,
    momentumThreshold: 5,
    investmentPerToken: 50,
    swapDex: 'jupiter',
    maxSlippage: 0.5,
    takeProfit: 10,
    stopLoss: 5,
  },
  gmgnSkills: getGmgnSkillsForStrategy('momentum_trading'),
  profitObjective: 'trend_capture',
  riskLevel: 'high',
  riskTier: 'high',
  guardrails: ['Momentum threshold', 'Stop loss', 'Take profit', 'Concentration cap'],
  builtIn: true,
  icon: 'Zap',
  category: 'trading',
};

/** Arbitrage Strategy - Exploit cross-exchange price differences */
export const ArbitrageStrategyDef: StrategyDefinition = {
  name: 'arbitrage',
  label: 'Arbitrage',
  description:
    'Monitor price differences across DEXes (Jupiter, Raydium, Orca) and trade the spread.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    targetToken: z.string().default('SOL'),
    dexPairs: z.array(z.string()).default(['jupiter->raydium', 'raydium->orca']),
    minimumSpread: z.number().min(0.5).max(10).default(2),
    tradeSize: z.number().min(50).max(5000).default(500),
    maxSlippage: z.number().min(0.1).max(3).default(0.3),
    priceCheckIntervalSecs: z.number().int().min(10).max(300).default(60),
    maxTradesPerHour: z.number().int().min(1).max(100).default(10),
  }),
  defaultParams: {
    baseToken: 'USDC',
    targetToken: 'SOL',
    dexPairs: ['jupiter->raydium', 'raydium->orca'],
    minimumSpread: 2,
    tradeSize: 500,
    maxSlippage: 0.3,
    priceCheckIntervalSecs: 60,
    maxTradesPerHour: 10,
  },
  gmgnSkills: getGmgnSkillsForStrategy('arbitrage'),
  profitObjective: 'spread_capture',
  riskLevel: 'high',
  riskTier: 'degen',
  guardrails: ['Minimum spread', 'Slippage cap', 'Hourly trade limit'],
  builtIn: true,
  icon: 'ArrowRightLeft',
  category: 'trading',
};

/** Stop Loss Guard - Protect positions with automated stops */
export const StopLossGuardStrategyDef: StrategyDefinition = {
  name: 'stop_loss_guard',
  label: 'Stop Loss Guard',
  description: 'Automatically sell positions if they drop below a target price to limit losses.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    monitoredToken: z.string().default('SOL'),
    stopLossPercent: z.number().min(1).max(50).default(10),
    checkIntervalMins: z.number().int().min(5).max(1440).default(15),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(5).default(0.7),
  }),
  defaultParams: {
    baseToken: 'USDC',
    monitoredToken: 'SOL',
    stopLossPercent: 10,
    checkIntervalMins: 15,
    swapDex: 'jupiter',
    maxSlippage: 0.7,
  },
  gmgnSkills: getGmgnSkillsForStrategy('stop_loss_guard'),
  profitObjective: 'drawdown_control',
  riskLevel: 'low',
  riskTier: 'low',
  guardrails: ['Immediate exit trigger', 'Conservative slippage', 'Periodic checks'],
  builtIn: true,
  icon: 'AlertTriangle',
  category: 'utility',
};

/** Yield Harvesting Strategy - Claim rewards from protocols */
export const YieldHarvestingStrategyDef: StrategyDefinition = {
  name: 'yield_harvesting',
  label: 'Yield Harvesting',
  description: 'Auto-claim yield from Marinade (mSOL), Lido (stSOL), and other staking protocols.',
  supportedIntents: ['harvest_yield', 'swap'],
  paramSchema: z.object({
    stakedTokens: z.array(z.string()).default(['mSOL', 'stSOL']),
    autoCompound: z.boolean().default(true),
    compoundThreshold: z.number().min(0.1).max(100).default(10),
    swapToToken: z.string().default('SOL'),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(2).default(0.3),
    harvestFrequencyHours: z.number().int().min(1).max(168).default(12),
  }),
  defaultParams: {
    stakedTokens: ['mSOL', 'stSOL'],
    autoCompound: true,
    compoundThreshold: 10,
    swapToToken: 'SOL',
    swapDex: 'jupiter',
    maxSlippage: 0.3,
    harvestFrequencyHours: 12,
  },
  gmgnSkills: getGmgnSkillsForStrategy('yield_harvesting'),
  profitObjective: 'yield_compounding',
  riskLevel: 'low',
  riskTier: 'low',
  guardrails: ['Compound threshold', 'Auto-compound toggle', 'Slippage cap'],
  builtIn: true,
  icon: 'Harvest',
  category: 'income',
};

/** Portfolio Rebalancer - Maintain target allocation percentages */
export const PortfolioRebalancerStrategyDef: StrategyDefinition = {
  name: 'portfolio_rebalancer',
  label: 'Portfolio Rebalancer',
  description: 'Keep your portfolio at target allocations (e.g., 60% SOL, 30% USDC, 10% JUP).',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    portfolio: z
      .array(
        z.object({
          token: z.string(),
          targetPercent: z.number().min(0).max(100),
        })
      )
      .default([
        { token: 'SOL', targetPercent: 60 },
        { token: 'USDC', targetPercent: 30 },
        { token: 'JUP', targetPercent: 10 },
      ]),
    rebalanceThreshold: z.number().min(1).max(20).default(5),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(2).default(0.5),
    rebalanceFrequencyHours: z.number().int().min(24).max(720).default(168),
  }),
  defaultParams: {
    portfolio: [
      { token: 'SOL', targetPercent: 60 },
      { token: 'USDC', targetPercent: 30 },
      { token: 'JUP', targetPercent: 10 },
    ],
    rebalanceThreshold: 5,
    swapDex: 'jupiter',
    maxSlippage: 0.5,
    rebalanceFrequencyHours: 168,
  },
  gmgnSkills: getGmgnSkillsForStrategy('portfolio_rebalancer'),
  profitObjective: 'portfolio_efficiency',
  riskLevel: 'low',
  riskTier: 'low',
  guardrails: ['Drift threshold', 'Scheduled rebalancing', 'Slippage cap'],
  builtIn: true,
  icon: 'PieChart',
  category: 'trading',
};

/** Airdrop Farmer - Track and claim eligible airdrops */
export const AirdropFarmerStrategyDef: StrategyDefinition = {
  name: 'airdrop_farmer',
  label: 'Airdrop Farmer',
  description:
    'Track on-chain governance tokens and claim eligible airdrops. Realistic airdrop farming.',
  supportedIntents: ['harvest_yield', 'swap'],
  paramSchema: z.object({
    trackedTokens: z.array(z.string()).default(['JUP', 'COPE', 'ORCA']),
    autoClaimEligible: z.boolean().default(true),
    minAirdropValue: z.number().min(1).max(1000).default(50),
    sellAirdropImmediately: z.boolean().default(false),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
    maxSlippage: z.number().min(0.1).max(5).default(1),
    checkFrequencyHours: z.number().int().min(1).max(168).default(6),
  }),
  defaultParams: {
    trackedTokens: ['JUP', 'COPE', 'ORCA'],
    autoClaimEligible: true,
    minAirdropValue: 50,
    sellAirdropImmediately: false,
    swapDex: 'jupiter',
    maxSlippage: 1,
    checkFrequencyHours: 6,
  },
  gmgnSkills: getGmgnSkillsForStrategy('airdrop_farmer'),
  profitObjective: 'opportunistic_claims',
  riskLevel: 'high',
  riskTier: 'degen',
  guardrails: ['Minimum claim value', 'Optional immediate sale', 'Slippage cap'],
  builtIn: true,
  icon: 'Gift',
  category: 'income',
};

/** Scalping Strategy - Fast micro-move capture with tight exits */
export const ScalpingStrategyDef: StrategyDefinition = {
  name: 'scalping_trading',
  label: 'Scalping Trading',
  description:
    'Trade tiny intraday moves with strict slippage and fast exits. Highest execution risk.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    targetToken: z.string().default('SOL'),
    entrySpreadBps: z.number().int().min(1).max(500).default(25),
    exitSpreadBps: z.number().int().min(1).max(500).default(20),
    orderSize: z.number().min(10).max(5000).default(100),
    maxSlippage: z.number().min(0.05).max(2).default(0.2),
    maxTradesPerHour: z.number().int().min(1).max(100).default(20),
  }),
  defaultParams: {
    baseToken: 'USDC',
    targetToken: 'SOL',
    entrySpreadBps: 25,
    exitSpreadBps: 20,
    orderSize: 100,
    maxSlippage: 0.2,
    maxTradesPerHour: 20,
  },
  gmgnSkills: getGmgnSkillsForStrategy('scalping_trading'),
  profitObjective: 'spread_capture',
  riskLevel: 'high',
  riskTier: 'degen',
  guardrails: ['Tiny order size', 'Very tight slippage', 'Hourly trade cap'],
  builtIn: true,
  icon: 'TimerReset',
  category: 'trading',
};

/** Breakout Strategy - Trade confirmed breakouts with predefined exits */
export const BreakoutStrategyDef: StrategyDefinition = {
  name: 'breakout_trading',
  label: 'Breakout Trading',
  description: 'Buy strength after a confirmed breakout and use hard stop-losses to cap downside.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    watchTokens: z.array(z.string()).default(['SOL', 'JUP', 'ORCA']),
    breakoutThreshold: z.number().min(0.5).max(20).default(4),
    confirmationWindowMins: z.number().int().min(1).max(240).default(15),
    positionSize: z.number().min(10).max(5000).default(100),
    takeProfit: z.number().min(1).max(100).default(15),
    stopLoss: z.number().min(1).max(50).default(7),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
  }),
  defaultParams: {
    baseToken: 'USDC',
    watchTokens: ['SOL', 'JUP', 'ORCA'],
    breakoutThreshold: 4,
    confirmationWindowMins: 15,
    positionSize: 100,
    takeProfit: 15,
    stopLoss: 7,
    swapDex: 'jupiter',
  },
  gmgnSkills: getGmgnSkillsForStrategy('breakout_trading'),
  profitObjective: 'trend_capture',
  riskLevel: 'high',
  riskTier: 'high',
  guardrails: ['Breakout confirmation', 'Hard stop-loss', 'Take-profit target'],
  builtIn: true,
  icon: 'Rocket',
  category: 'trading',
};

/** Mean Reversion Strategy - Buy oversold dips and sell into recovery */
export const MeanReversionStrategyDef: StrategyDefinition = {
  name: 'mean_reversion_trading',
  label: 'Mean Reversion Trading',
  description: 'Buy when a token deviates from its recent average and exit on recovery.',
  supportedIntents: ['swap'],
  paramSchema: z.object({
    baseToken: z.string().default('USDC'),
    targetToken: z.string().default('SOL'),
    lookbackPeriodHours: z.number().int().min(1).max(168).default(24),
    deviationThreshold: z.number().min(0.5).max(20).default(5),
    positionSize: z.number().min(10).max(5000).default(100),
    takeProfit: z.number().min(1).max(50).default(8),
    stopLoss: z.number().min(1).max(20).default(4),
    swapDex: z.enum(['jupiter', 'raydium', 'orca']).default('jupiter'),
  }),
  defaultParams: {
    baseToken: 'USDC',
    targetToken: 'SOL',
    lookbackPeriodHours: 24,
    deviationThreshold: 5,
    positionSize: 100,
    takeProfit: 8,
    stopLoss: 4,
    swapDex: 'jupiter',
  },
  gmgnSkills: getGmgnSkillsForStrategy('mean_reversion_trading'),
  profitObjective: 'spread_capture',
  riskLevel: 'medium',
  riskTier: 'medium',
  guardrails: ['Deviation threshold', 'Moderate position size', 'Stop-loss and take-profit'],
  builtIn: true,
  icon: 'Waypoints',
  category: 'trading',
};

// ============================================
// Strategy Field Descriptors (for API serialization)
// ============================================

const strategyFieldDescriptors: Record<string, SharedStrategyFieldDescriptor[]> = {
  dca: [
    {
      key: 'buyAmount',
      label: 'Buy Amount (USDC)',
      type: 'number',
      description: 'Amount to buy each cycle',
      required: false,
      default: 100,
    },
    {
      key: 'buyToken',
      label: 'Buy Token',
      type: 'string',
      description: 'Token to spend (USDC, USDT)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'targetToken',
      label: 'Target Token',
      type: 'string',
      description: 'Token to accumulate',
      required: false,
      default: 'SOL',
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.5,
    },
    {
      key: 'frequencyHours',
      label: 'Buy Frequency (Hours)',
      type: 'number',
      description: 'How often to buy',
      required: false,
      default: 24,
    },
    {
      key: 'maxBuysPerDay',
      label: 'Max Buys / Day',
      type: 'number',
      description: 'Daily buy limit',
      required: false,
      default: 2,
    },
  ],
  grid_trading: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token to use for trading (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'targetToken',
      label: 'Target Token',
      type: 'string',
      description: 'Token to trade',
      required: false,
      default: 'SOL',
    },
    {
      key: 'gridLevels',
      label: 'Grid Levels',
      type: 'number',
      description: 'Number of price levels',
      required: false,
      default: 10,
    },
    {
      key: 'gridSpread',
      label: 'Grid Spread (%)',
      type: 'number',
      description: 'Spread between grid levels',
      required: false,
      default: 2,
    },
    {
      key: 'buyAmount',
      label: 'Buy Amount per Level',
      type: 'number',
      description: 'USDC per grid level',
      required: false,
      default: 100,
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.5,
    },
    {
      key: 'priceCheckIntervalMins',
      label: 'Check Interval (Mins)',
      type: 'number',
      description: 'How often to check prices',
      required: false,
      default: 30,
    },
  ],
  momentum_trading: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token to use for trading (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'trackingTokens',
      label: 'Track Tokens',
      type: 'string[]',
      description: 'Tokens to monitor',
      required: false,
      default: ['SOL', 'JUP'],
    },
    {
      key: 'lookbackPeriodHours',
      label: 'Lookback Period (Hours)',
      type: 'number',
      description: 'Historical period for momentum',
      required: false,
      default: 24,
    },
    {
      key: 'momentumThreshold',
      label: 'Momentum Threshold (%)',
      type: 'number',
      description: 'Min % gain to trigger buy',
      required: false,
      default: 5,
    },
    {
      key: 'investmentPerToken',
      label: 'Investment per Token',
      type: 'number',
      description: 'USDC to invest per token',
      required: false,
      default: 50,
    },
    {
      key: 'takeProfit',
      label: 'Take Profit (%)',
      type: 'number',
      description: 'Sell profit target',
      required: false,
      default: 10,
    },
    {
      key: 'stopLoss',
      label: 'Stop Loss (%)',
      type: 'number',
      description: 'Loss limit to exit',
      required: false,
      default: 5,
    },
  ],
  arbitrage: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Trading pair (e.g., USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'targetToken',
      label: 'Target Token',
      type: 'string',
      description: 'Trading pair (e.g., SOL)',
      required: false,
      default: 'SOL',
    },
    {
      key: 'minimumSpread',
      label: 'Min Spread (%)',
      type: 'number',
      description: 'Minimum profitable spread',
      required: false,
      default: 2,
    },
    {
      key: 'tradeSize',
      label: 'Trade Size (USDC)',
      type: 'number',
      description: 'Amount per arbitrage trade',
      required: false,
      default: 500,
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.3,
    },
    {
      key: 'priceCheckIntervalSecs',
      label: 'Check Interval (Secs)',
      type: 'number',
      description: 'How often to check prices',
      required: false,
      default: 60,
    },
    {
      key: 'maxTradesPerHour',
      label: 'Max Trades / Hour',
      type: 'number',
      description: 'Hourly trade limit',
      required: false,
      default: 10,
    },
  ],
  stop_loss_guard: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token for trading (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'monitoredToken',
      label: 'Monitored Token',
      type: 'string',
      description: 'Token to protect',
      required: false,
      default: 'SOL',
    },
    {
      key: 'stopLossPercent',
      label: 'Stop Loss (%)',
      type: 'number',
      description: 'Sell if price drops this much',
      required: false,
      default: 10,
    },
    {
      key: 'checkIntervalMins',
      label: 'Check Interval (Mins)',
      type: 'number',
      description: 'How often to check price',
      required: false,
      default: 15,
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.7,
    },
  ],
  yield_harvesting: [
    {
      key: 'stakedTokens',
      label: 'Staked Tokens',
      type: 'string[]',
      description: 'Tokens to harvest from',
      required: false,
      default: ['mSOL'],
    },
    {
      key: 'autoCompound',
      label: 'Auto Compound',
      type: 'boolean',
      description: 'Reinvest rewards',
      required: false,
      default: true,
    },
    {
      key: 'compoundThreshold',
      label: 'Compound Threshold (USD)',
      type: 'number',
      description: 'Min value to compound',
      required: false,
      default: 10,
    },
    {
      key: 'swapToToken',
      label: 'Swap Rewards To',
      type: 'string',
      description: 'Token to convert rewards to',
      required: false,
      default: 'SOL',
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.3,
    },
    {
      key: 'harvestFrequencyHours',
      label: 'Harvest Frequency (Hours)',
      type: 'number',
      description: 'How often to harvest',
      required: false,
      default: 12,
    },
  ],
  portfolio_rebalancer: [
    {
      key: 'rebalanceThreshold',
      label: 'Rebalance Threshold (%)',
      type: 'number',
      description: 'Drift before rebalancing',
      required: false,
      default: 5,
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 0.5,
    },
    {
      key: 'rebalanceFrequencyHours',
      label: 'Rebalance Frequency (Hours)',
      type: 'number',
      description: 'Max time between rebalances',
      required: false,
      default: 168,
    },
  ],
  airdrop_farmer: [
    {
      key: 'trackedTokens',
      label: 'Track Tokens',
      type: 'string[]',
      description: 'Governance tokens to monitor',
      required: false,
      default: ['JUP', 'ORCA'],
    },
    {
      key: 'autoClaimEligible',
      label: 'Auto Claim',
      type: 'boolean',
      description: 'Automatically claim eligible airdrops',
      required: false,
      default: true,
    },
    {
      key: 'minAirdropValue',
      label: 'Min Airdrop Value (USD)',
      type: 'number',
      description: 'Minimum value to claim',
      required: false,
      default: 50,
    },
    {
      key: 'sellAirdropImmediately',
      label: 'Sell Immediately',
      type: 'boolean',
      description: 'Sell airdrop tokens right away',
      required: false,
      default: false,
    },
    {
      key: 'swapDex',
      label: 'DEX',
      type: 'string',
      description: 'Exchange to use',
      required: false,
      default: 'jupiter',
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Acceptable price slippage',
      required: false,
      default: 1,
    },
    {
      key: 'checkFrequencyHours',
      label: 'Check Frequency (Hours)',
      type: 'number',
      description: 'How often to check for airdrops',
      required: false,
      default: 6,
    },
  ],
  scalping_trading: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token to spend (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'targetToken',
      label: 'Target Token',
      type: 'string',
      description: 'Token to scalp',
      required: false,
      default: 'SOL',
    },
    {
      key: 'entrySpreadBps',
      label: 'Entry Spread (bps)',
      type: 'number',
      description: 'How far price must move before entry',
      required: false,
      default: 25,
    },
    {
      key: 'exitSpreadBps',
      label: 'Exit Spread (bps)',
      type: 'number',
      description: 'Fast exit target',
      required: false,
      default: 20,
    },
    {
      key: 'orderSize',
      label: 'Order Size',
      type: 'number',
      description: 'Per-trade size',
      required: false,
      default: 100,
    },
    {
      key: 'maxSlippage',
      label: 'Max Slippage (%)',
      type: 'number',
      description: 'Very tight slippage control',
      required: false,
      default: 0.2,
    },
    {
      key: 'maxTradesPerHour',
      label: 'Max Trades / Hour',
      type: 'number',
      description: 'Throttle execution frequency',
      required: false,
      default: 20,
    },
  ],
  breakout_trading: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token to spend (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'watchTokens',
      label: 'Watch Tokens',
      type: 'string[]',
      description: 'Tokens to monitor for breakouts',
      required: false,
      default: ['SOL', 'JUP', 'ORCA'],
    },
    {
      key: 'breakoutThreshold',
      label: 'Breakout Threshold (%)',
      type: 'number',
      description: 'Required move before entry',
      required: false,
      default: 4,
    },
    {
      key: 'confirmationWindowMins',
      label: 'Confirmation Window (Mins)',
      type: 'number',
      description: 'Time window to confirm breakout',
      required: false,
      default: 15,
    },
    {
      key: 'positionSize',
      label: 'Position Size',
      type: 'number',
      description: 'Per-trade size',
      required: false,
      default: 100,
    },
    {
      key: 'takeProfit',
      label: 'Take Profit (%)',
      type: 'number',
      description: 'Profit target',
      required: false,
      default: 15,
    },
    {
      key: 'stopLoss',
      label: 'Stop Loss (%)',
      type: 'number',
      description: 'Hard downside cap',
      required: false,
      default: 7,
    },
  ],
  mean_reversion_trading: [
    {
      key: 'baseToken',
      label: 'Base Token',
      type: 'string',
      description: 'Token to spend (USDC)',
      required: false,
      default: 'USDC',
    },
    {
      key: 'targetToken',
      label: 'Target Token',
      type: 'string',
      description: 'Token to trade',
      required: false,
      default: 'SOL',
    },
    {
      key: 'lookbackPeriodHours',
      label: 'Lookback Period (Hours)',
      type: 'number',
      description: 'Recent average window',
      required: false,
      default: 24,
    },
    {
      key: 'deviationThreshold',
      label: 'Deviation Threshold (%)',
      type: 'number',
      description: 'How far from average before entry',
      required: false,
      default: 5,
    },
    {
      key: 'positionSize',
      label: 'Position Size',
      type: 'number',
      description: 'Per-trade size',
      required: false,
      default: 100,
    },
    {
      key: 'takeProfit',
      label: 'Take Profit (%)',
      type: 'number',
      description: 'Recovery target',
      required: false,
      default: 8,
    },
    {
      key: 'stopLoss',
      label: 'Stop Loss (%)',
      type: 'number',
      description: 'Hard downside cap',
      required: false,
      default: 4,
    },
  ],
};

// ============================================
// Registry Class
// ============================================

class StrategyRegistry {
  private strategies: Map<string, StrategyDefinition> = new Map();

  private static readonly riskTierOrder: Record<StrategyDefinition['riskTier'], number> = {
    degen: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  constructor() {
    // Register built-in trading & DeFi strategies (production-ready)
    this.register(ScalpingStrategyDef);
    this.register(BreakoutStrategyDef);
    this.register(MeanReversionStrategyDef);
    this.register(DCAStrategyDef);
    this.register(GridTradingStrategyDef);
    this.register(MomentumTradingStrategyDef);
    this.register(ArbitrageStrategyDef);
    this.register(StopLossGuardStrategyDef);
    this.register(YieldHarvestingStrategyDef);
    this.register(PortfolioRebalancerStrategyDef);
    this.register(AirdropFarmerStrategyDef);
  }

  /**
   * Register a new strategy definition.
   */
  register(definition: StrategyDefinition): void {
    this.strategies.set(definition.name, definition);
  }

  /**
   * Get a strategy definition by name.
   */
  get(name: string): StrategyDefinition | undefined {
    return this.strategies.get(name);
  }

  /**
   * Check if a strategy name is registered.
   */
  has(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * List all registered strategy names.
   */
  list(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Validate strategy params against the registered schema.
   * Returns the parsed (with defaults applied) params if valid.
   */
  validateParams(
    strategyName: string,
    params: Record<string, unknown>
  ): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    const def = this.strategies.get(strategyName);
    if (!def) {
      return { ok: false, error: `Unknown strategy: ${strategyName}` };
    }
    const result = def.paramSchema.safeParse(params);
    if (!result.success) {
      return {
        ok: false,
        error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    return { ok: true, value: result.data as Record<string, unknown> };
  }

  /**
   * Get all strategies as serializable DTOs for API responses.
   */
  getAllDTOs(): StrategyDefinitionDTO[] {
    return Array.from(this.strategies.values())
      .sort(
        (left, right) =>
          StrategyRegistry.riskTierOrder[left.riskTier] -
          StrategyRegistry.riskTierOrder[right.riskTier]
      )
      .map((def) => ({
        name: def.name,
        label: def.label,
        description: def.description,
        supportedIntents: [...def.supportedIntents],
        defaultParams: { ...def.defaultParams },
        gmgnSkills: [...def.gmgnSkills],
        profitObjective: def.profitObjective,
        riskLevel: def.riskLevel,
        riskTier: def.riskTier,
        guardrails: [...def.guardrails],
        builtIn: def.builtIn,
        icon: def.icon,
        category: def.category,
        fields: strategyFieldDescriptors[def.name] ?? [],
      }));
  }

  /**
   * Get a single strategy DTO.
   */
  getDTO(name: string): StrategyDefinitionDTO | undefined {
    const def = this.strategies.get(name);
    if (!def) return undefined;
    return {
      name: def.name,
      label: def.label,
      description: def.description,
      supportedIntents: [...def.supportedIntents],
      defaultParams: { ...def.defaultParams },
      gmgnSkills: [...def.gmgnSkills],
      profitObjective: def.profitObjective,
      riskLevel: def.riskLevel,
      riskTier: def.riskTier,
      guardrails: [...def.guardrails],
      builtIn: def.builtIn,
      icon: def.icon,
      category: def.category,
      fields: strategyFieldDescriptors[def.name] ?? [],
    };
  }
}

// Singleton
let registryInstance: StrategyRegistry | null = null;

export function getStrategyRegistry(): StrategyRegistry {
  if (!registryInstance) {
    registryInstance = new StrategyRegistry();
  }
  return registryInstance;
}
