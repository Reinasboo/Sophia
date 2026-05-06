/**
 * GMGN Skill Catalog
 *
 * Maps Sophia strategies and BYOA intent mixes to the GMGN skills they rely on.
 * These tags are descriptive metadata only — they do not execute GMGN commands.
 */

import type { SupportedIntentType } from '../types/shared.js';

export type GmgnSkillId =
  | 'gmgn-token'
  | 'gmgn-market'
  | 'gmgn-portfolio'
  | 'gmgn-track'
  | 'gmgn-swap'
  | 'gmgn-cooking';

export interface GmgnSkillDescriptor {
  readonly id: GmgnSkillId;
  readonly label: string;
  readonly purpose: string;
}

export const GMGN_SKILL_CATALOG: Record<GmgnSkillId, GmgnSkillDescriptor> = {
  'gmgn-token': {
    id: 'gmgn-token',
    label: 'Token Research',
    purpose: 'Token info, security, pool, holders, traders',
  },
  'gmgn-market': {
    id: 'gmgn-market',
    label: 'Market Discovery',
    purpose: 'K-line, trending tokens, new launches, signal feeds',
  },
  'gmgn-portfolio': {
    id: 'gmgn-portfolio',
    label: 'Portfolio Intelligence',
    purpose: 'Wallet holdings, activity, stats, created tokens',
  },
  'gmgn-track': {
    id: 'gmgn-track',
    label: 'Smart Money Tracking',
    purpose: 'KOL, smart money, and follow-wallet flows',
  },
  'gmgn-swap': {
    id: 'gmgn-swap',
    label: 'Swap Execution',
    purpose: 'Swaps, limit orders, and exit order orchestration',
  },
  'gmgn-cooking': {
    id: 'gmgn-cooking',
    label: 'Cooking / Bundled Orders',
    purpose: 'Buy + take-profit/stop-loss bundled execution',
  },
};

const STRATEGY_SKILL_MAP: Record<string, GmgnSkillId[]> = {
  dca: ['gmgn-token', 'gmgn-portfolio', 'gmgn-swap'],
  grid_trading: ['gmgn-market', 'gmgn-token', 'gmgn-swap'],
  momentum_trading: ['gmgn-market', 'gmgn-token', 'gmgn-track', 'gmgn-swap'],
  arbitrage: ['gmgn-market', 'gmgn-token', 'gmgn-swap'],
  stop_loss_guard: ['gmgn-token', 'gmgn-swap', 'gmgn-cooking'],
  yield_harvesting: ['gmgn-portfolio', 'gmgn-token', 'gmgn-swap'],
  portfolio_rebalancer: ['gmgn-portfolio', 'gmgn-token', 'gmgn-swap'],
  airdrop_farmer: ['gmgn-market', 'gmgn-track', 'gmgn-portfolio'],
  scalping_trading: ['gmgn-market', 'gmgn-track', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking'],
  breakout_trading: ['gmgn-market', 'gmgn-track', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking'],
  mean_reversion_trading: ['gmgn-market', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking'],
};

function uniqueSkills(skills: readonly GmgnSkillId[]): GmgnSkillId[] {
  return Array.from(new Set(skills));
}

export function getGmgnSkillsForStrategy(strategyName: string): GmgnSkillId[] {
  return uniqueSkills(STRATEGY_SKILL_MAP[strategyName] ?? []);
}

export function getGmgnSkillsForSupportedIntents(
  supportedIntents: readonly SupportedIntentType[]
): GmgnSkillId[] {
  const skills: GmgnSkillId[] = [];

  if (supportedIntents.includes('QUERY_BALANCE')) {
    skills.push('gmgn-portfolio');
  }

  if (
    supportedIntents.some((intent) =>
      [
        'TRANSFER_SOL',
        'TRANSFER_TOKEN',
        'SERVICE_PAYMENT',
        'swap',
        'stake',
        'unstake',
        'liquid_stake',
        'provide_liquidity',
        'remove_liquidity',
        'deposit_lending',
        'withdraw_lending',
        'borrow_lending',
        'repay_lending',
        'farm_deposit',
        'farm_harvest',
        'wrap_token',
        'unwrap_token',
        'composite_strategy',
      ].includes(intent)
    )
  ) {
    skills.push('gmgn-swap');
  }

  if (supportedIntents.includes('REQUEST_AIRDROP')) {
    skills.push('gmgn-market', 'gmgn-token');
  }

  if (supportedIntents.includes('AUTONOMOUS')) {
    skills.push('gmgn-market', 'gmgn-token', 'gmgn-track', 'gmgn-portfolio', 'gmgn-swap');
  }

  return uniqueSkills(skills);
}
