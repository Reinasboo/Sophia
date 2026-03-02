/**
 * Distributor Agent
 * 
 * Strategy: Automatically distributes SOL to a list of recipients.
 * Cycles through recipients and sends small amounts periodically.
 * 
 * Use case: Automated distribution, rewards, or testing transfers.
 */

import { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
import { createLogger } from '../utils/logger.js';
import { ESTIMATED_SOL_TRANSFER_FEE } from '../utils/config.js';

const logger = createLogger('DISTRIBUTOR');

export interface DistributorParams {
  readonly recipients: string[];        // List of wallet addresses
  readonly amountPerTransfer: number;   // SOL per transfer
  readonly minBalanceToDistribute: number; // SOL - don't distribute below this
  readonly maxTransfersPerDay: number;
  readonly distributionProbability: number; // 0-1, chance to distribute each cycle
}

const DEFAULT_PARAMS: DistributorParams = {
  recipients: [],
  amountPerTransfer: 0.01,
  minBalanceToDistribute: 0.1,
  maxTransfersPerDay: 10,
  distributionProbability: 0.5,
};

export class DistributorAgent extends BaseAgent {
  private params: DistributorParams;
  private transfersToday: number = 0;
  private currentRecipientIndex: number = 0;

  constructor(
    name: string,
    walletId: string,
    walletPublicKey: string,
    params?: Partial<DistributorParams>
  ) {
    super(name, 'distributor', walletId, walletPublicKey);
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  override updateStrategyParams(params: Record<string, unknown>): void {
    super.updateStrategyParams(params);
    this.params = { ...this.params, ...params } as DistributorParams;
  }

  async think(context: AgentContext): Promise<AgentDecision> {
    logger.debug('Distributor thinking', {
      agentId: this.id,
      balance: context.balance.sol,
      recipientCount: this.params.recipients.length,
      transfersToday: this.transfersToday,
    });

    // Check if we have recipients
    if (this.params.recipients.length === 0) {
      return {
        shouldAct: false,
        reasoning: 'No recipients configured',
      };
    }

    // Check daily limit
    if (this.transfersToday >= this.params.maxTransfersPerDay) {
      return {
        shouldAct: false,
        reasoning: `Daily transfer limit reached (${this.params.maxTransfersPerDay})`,
      };
    }

    // Check minimum balance
    const balanceAfterTransfer = context.balance.sol - this.params.amountPerTransfer - ESTIMATED_SOL_TRANSFER_FEE;
    if (balanceAfterTransfer < this.params.minBalanceToDistribute) {
      return {
        shouldAct: false,
        reasoning: `Balance too low to distribute (need ${this.params.minBalanceToDistribute} SOL minimum)`,
      };
    }

    // Probabilistic distribution
    if (Math.random() > this.params.distributionProbability) {
      return {
        shouldAct: false,
        reasoning: 'Skipping this cycle (probability check)',
      };
    }

    // Get next recipient
    const recipient = this.params.recipients[this.currentRecipientIndex];
    if (!recipient) {
      return {
        shouldAct: false,
        reasoning: 'No valid recipient at current index',
      };
    }
    
    // Don't send to self
    if (recipient === this.walletPublicKey) {
      this.currentRecipientIndex = (this.currentRecipientIndex + 1) % this.params.recipients.length;
      return {
        shouldAct: false,
        reasoning: 'Skipping self as recipient',
      };
    }

    logger.info('Distributor initiating transfer', {
      agentId: this.id,
      recipient,
      amount: this.params.amountPerTransfer,
    });

    this.transfersToday++;
    // M-3: Capture current index for reasoning BEFORE incrementing
    const recipientIndex = this.currentRecipientIndex;
    this.currentRecipientIndex = (this.currentRecipientIndex + 1) % this.params.recipients.length;

    return {
      shouldAct: true,
      intent: this.createTransferSolIntent(recipient, this.params.amountPerTransfer),
      reasoning: `Distributing ${this.params.amountPerTransfer} SOL to recipient ${recipientIndex}`,
    };
  }

  /**
   * Add a recipient
   */
  addRecipient(address: string): void {
    if (!this.params.recipients.includes(address)) {
      this.params = {
        ...this.params,
        recipients: [...this.params.recipients, address],
      };
    }
  }

  /**
   * Remove a recipient
   */
  removeRecipient(address: string): void {
    this.params = {
      ...this.params,
      recipients: this.params.recipients.filter(r => r !== address),
    };
  }

  /**
   * Reset daily counter
   */
  resetDailyCounters(): void {
    this.transfersToday = 0;
    logger.debug('Daily counters reset', { agentId: this.id });
  }
}
