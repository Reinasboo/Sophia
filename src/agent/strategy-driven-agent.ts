/**
 * Strategy-Driven Agent
 *
 * Generic implementation for strategy-registry backed strategies.
 * Emits autonomous intents that include the strategy key and validated params.
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('STRATEGY_DRIVEN_AGENT');

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export class StrategyDrivenAgent extends BaseAgent {
  private readonly supportedIntents: readonly string[];

  constructor(
    name: string,
    strategy: string,
    walletId: string,
    walletPublicKey: string,
    strategyParams: Record<string, unknown>,
    supportedIntents: readonly string[],
    executionSettings?: Record<string, unknown>,
    idOverride?: string,
    tenantId?: string // MULTI-TENANT: Pass tenant context to parent
  ) {
    super(
      name,
      strategy,
      walletId,
      walletPublicKey,
      strategyParams,
      executionSettings,
      idOverride,
      tenantId
    );
    this.supportedIntents = [...supportedIntents];
  }

  async think(context: AgentContext): Promise<AgentDecision> {
    if (this.supportedIntents.length === 0) {
      return {
        shouldAct: false,
        reasoning: `Strategy ${this.strategy} has no supported intents configured`,
      };
    }

    if (this.actionCount >= this.executionSettings.maxActionsPerDay) {
      return {
        shouldAct: false,
        reasoning: `Daily action limit reached (${this.executionSettings.maxActionsPerDay})`,
      };
    }

    const minIntervalMs = this.getStrategyIntervalMs(this.strategyParams);
    if (this.lastActionAt && minIntervalMs > 0) {
      const elapsedMs = Date.now() - this.lastActionAt.getTime();
      if (elapsedMs < minIntervalMs) {
        const remainingSeconds = Math.ceil((minIntervalMs - elapsedMs) / 1000);
        return {
          shouldAct: false,
          reasoning: `Waiting for strategy interval (${remainingSeconds}s remaining)`,
        };
      }
    }

    const primaryIntent = this.supportedIntents[0] ?? 'AUTONOMOUS';

    logger.debug('Strategy-driven agent emitting autonomous intent', {
      agentId: this.id,
      strategy: this.strategy,
      primaryIntent,
    });

    return {
      shouldAct: true,
      intent: {
        id: uuidv4(),
        agentId: this.id,
        timestamp: new Date(),
        type: 'autonomous',
        action: primaryIntent,
        params: {
          strategy: this.strategy,
          strategyParams: this.strategyParams,
          walletPublicKey: context.walletPublicKey,
          balanceSol: context.balance.sol,
          tokenBalances: context.tokenBalances,
        },
      },
      reasoning: `Executing ${this.strategy} via ${primaryIntent} intent`,
    };
  }

  private getStrategyIntervalMs(params: Record<string, unknown>): number {
    const hours =
      this.toNumber(params['frequencyHours']) ?? this.toNumber(params['rebalanceIntervalHours']);
    if (hours && hours > 0) {
      return hours * HOUR_MS;
    }

    const minutes = this.toNumber(params['priceCheckIntervalMins']);
    if (minutes && minutes > 0) {
      return minutes * MINUTE_MS;
    }

    const seconds = this.toNumber(params['priceCheckIntervalSecs']);
    if (seconds && seconds > 0) {
      return seconds * 1000;
    }

    return 0;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value !== 'number') {
      return undefined;
    }
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value;
  }
}
