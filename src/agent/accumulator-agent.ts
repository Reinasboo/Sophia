/**
 * Accumulator Agent
 *
 * Strategy: Automatically requests airdrops to maintain a minimum balance.
 * This agent monitors its balance and requests devnet SOL when below threshold.
 *
 * Use case: Ensuring the wallet always has SOL for transaction fees.
 */

import { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ACCUMULATOR');

export interface AccumulatorParams {
  readonly targetBalance: number; // SOL - try to maintain this balance
  readonly minBalance: number; // SOL - request airdrop below this
  readonly airdropAmount: number; // SOL - amount to request per airdrop
  readonly maxAirdropsPerDay: number;
}

const DEFAULT_PARAMS: AccumulatorParams = {
  targetBalance: 2.0,
  minBalance: 0.5,
  airdropAmount: 1.0,
  maxAirdropsPerDay: 5,
};

export class AccumulatorAgent extends BaseAgent {
  private params: AccumulatorParams;
  private airdropsToday: number = 0;

  constructor(
    name: string,
    walletId: string,
    walletPublicKey: string,
    params?: Partial<AccumulatorParams>
  ) {
    super(name, 'accumulator', walletId, walletPublicKey);
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  override updateStrategyParams(params: Record<string, unknown>): void {
    super.updateStrategyParams(params);
    this.params = { ...this.params, ...params } as AccumulatorParams;
  }

  async think(context: AgentContext): Promise<AgentDecision> {
    logger.debug('Accumulator thinking', {
      agentId: this.id,
      balance: context.balance.sol,
      target: this.params.targetBalance,
      min: this.params.minBalance,
    });

    // Check if we've hit daily limit
    if (this.airdropsToday >= this.params.maxAirdropsPerDay) {
      return {
        shouldAct: false,
        reasoning: `Daily airdrop limit reached (${this.params.maxAirdropsPerDay})`,
      };
    }

    // Check if balance is below minimum
    if (context.balance.sol < this.params.minBalance) {
      const airdropAmount = Math.min(
        this.params.airdropAmount,
        this.params.targetBalance - context.balance.sol
      );

      logger.info('Accumulator requesting airdrop', {
        agentId: this.id,
        currentBalance: context.balance.sol,
        requestAmount: airdropAmount,
      });

      this.airdropsToday++;

      return {
        shouldAct: true,
        intent: this.createAirdropIntent(airdropAmount),
        reasoning: `Balance (${context.balance.sol} SOL) below minimum (${this.params.minBalance} SOL)`,
      };
    }

    // Check if we're below target (but above minimum)
    if (context.balance.sol < this.params.targetBalance * 0.8) {
      // Only airdrop occasionally when between min and target
      if (Math.random() < 0.3) {
        const airdropAmount = Math.min(
          this.params.airdropAmount,
          this.params.targetBalance - context.balance.sol
        );

        this.airdropsToday++;

        return {
          shouldAct: true,
          intent: this.createAirdropIntent(airdropAmount),
          reasoning: `Topping up balance toward target (${this.params.targetBalance} SOL)`,
        };
      }
    }

    return {
      shouldAct: false,
      reasoning: `Balance (${context.balance.sol} SOL) is sufficient`,
    };
  }

  /**
   * Reset daily counter (called by scheduler)
   */
  resetDailyCounters(): void {
    this.airdropsToday = 0;
    logger.debug('Daily counters reset', { agentId: this.id });
  }
}
