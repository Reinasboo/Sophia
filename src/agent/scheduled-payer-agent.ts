/**
 * Scheduled Payer Agent
 *
 * Strategy: Sends fixed SOL amounts to a single recipient on a regular schedule.
 * Simpler than Distributor — one recipient, deterministic timing.
 *
 * Use case: Recurring payments, subscriptions, salary-like payouts.
 */

import { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
import { createLogger } from '../utils/logger.js';
import { ESTIMATED_SOL_TRANSFER_FEE } from '../utils/config.js';

const logger = createLogger('SCHEDULED_PAYER');

export interface ScheduledPayerParams {
  readonly recipient: string;
  readonly amount: number;
  readonly maxPaymentsPerDay: number;
  readonly minBalanceToSend: number;
}

const DEFAULT_PARAMS: ScheduledPayerParams = {
  recipient: '',
  amount: 0.01,
  maxPaymentsPerDay: 5,
  minBalanceToSend: 0.1,
};

export class ScheduledPayerAgent extends BaseAgent {
  private params: ScheduledPayerParams;
  private paymentsToday: number = 0;

  constructor(
    name: string,
    walletId: string,
    walletPublicKey: string,
    params?: Partial<ScheduledPayerParams>,
  ) {
    super(name, 'scheduled_payer', walletId, walletPublicKey, params as Record<string, unknown>);
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  override updateStrategyParams(params: Record<string, unknown>): void {
    super.updateStrategyParams(params);
    this.params = { ...this.params, ...params } as ScheduledPayerParams;
  }

  async think(context: AgentContext): Promise<AgentDecision> {
    if (!this.params.recipient) {
      return { shouldAct: false, reasoning: 'No recipient configured' };
    }

    if (this.params.recipient === this.walletPublicKey) {
      return { shouldAct: false, reasoning: 'Cannot pay self' };
    }

    if (this.paymentsToday >= this.params.maxPaymentsPerDay) {
      return { shouldAct: false, reasoning: `Daily payment limit reached (${this.params.maxPaymentsPerDay})` };
    }

    const afterSend = context.balance.sol - this.params.amount - ESTIMATED_SOL_TRANSFER_FEE;
    if (afterSend < this.params.minBalanceToSend) {
      return { shouldAct: false, reasoning: `Balance too low to send (need ${this.params.minBalanceToSend} SOL reserve)` };
    }

    this.paymentsToday++;
    logger.info('Scheduled payment', {
      agentId: this.id,
      recipient: this.params.recipient,
      amount: this.params.amount,
    });

    return {
      shouldAct: true,
      intent: this.createTransferSolIntent(this.params.recipient, this.params.amount),
      reasoning: `Scheduled payment of ${this.params.amount} SOL`,
    };
  }

  resetDailyCounters(): void {
    this.paymentsToday = 0;
  }
}
