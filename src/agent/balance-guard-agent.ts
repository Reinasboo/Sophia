/**
 * Balance Guard Agent
 *
 * Strategy: Monitors balance and requests airdrops only when critically low.
 * Lighter-touch than Accumulator — acts only under emergency conditions.
 *
 * Use case: Fee-reserve safety net.
 */

import { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BALANCE_GUARD');

export interface BalanceGuardParams {
  readonly criticalBalance: number;
  readonly airdropAmount: number;
  readonly maxAirdropsPerDay: number;
}

const DEFAULT_PARAMS: BalanceGuardParams = {
  criticalBalance: 0.05,
  airdropAmount: 0.5,
  maxAirdropsPerDay: 3,
};

export class BalanceGuardAgent extends BaseAgent {
  private params: BalanceGuardParams;
  private airdropsToday: number = 0;

  constructor(
    name: string,
    walletId: string,
    walletPublicKey: string,
    params?: Partial<BalanceGuardParams>,
    executionSettings?: Record<string, unknown>,
    idOverride?: string,
    tenantId?: string
  ) {
    super(name, 'balance_guard', walletId, walletPublicKey, params, executionSettings, idOverride, tenantId);
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  override updateStrategyParams(params: Record<string, unknown>): void {
    super.updateStrategyParams(params);
    this.params = { ...this.params, ...params } as BalanceGuardParams;
  }

  async think(context: AgentContext): Promise<AgentDecision> {
    if (this.airdropsToday >= this.params.maxAirdropsPerDay) {
      return {
        shouldAct: false,
        reasoning: `Daily airdrop limit reached (${this.params.maxAirdropsPerDay})`,
      };
    }

    if (context.balance.sol < this.params.criticalBalance) {
      this.airdropsToday++;
      logger.info('Balance critically low, requesting airdrop', {
        agentId: this.id,
        balance: context.balance.sol,
        critical: this.params.criticalBalance,
      });
      return {
        shouldAct: true,
        intent: this.createAirdropIntent(this.params.airdropAmount),
        reasoning: `Balance (${context.balance.sol} SOL) below critical threshold (${this.params.criticalBalance} SOL)`,
      };
    }

    return {
      shouldAct: false,
      reasoning: `Balance (${context.balance.sol} SOL) is above critical threshold`,
    };
  }

  resetDailyCounters(): void {
    this.airdropsToday = 0;
  }
}
