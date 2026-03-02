/**
 * Agent Factory
 * 
 * Creates agents based on strategy type and configuration.
 * Uses the strategy registry for validation and supported strategy discovery.
 */

import { BaseAgent } from './base-agent.js';
import { AccumulatorAgent, AccumulatorParams } from './accumulator-agent.js';
import { DistributorAgent, DistributorParams } from './distributor-agent.js';
import { BalanceGuardAgent, BalanceGuardParams } from './balance-guard-agent.js';
import { ScheduledPayerAgent, ScheduledPayerParams } from './scheduled-payer-agent.js';
import { AgentStrategy, AgentConfig, Result, success, failure } from '../utils/types.js';
import { getStrategyRegistry } from './strategy-registry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AGENT_FACTORY');

export interface CreateAgentOptions {
  config: AgentConfig;
  walletId: string;
  walletPublicKey: string;
  /** When restoring from persisted state, preserve the original agent ID. */
  idOverride?: string;
  /** When restoring from persisted state, preserve the original creation time. */
  createdAtOverride?: Date;
}

/**
 * Create an agent based on configuration
 */
export function createAgent(options: CreateAgentOptions): Result<BaseAgent, Error> {
  const { config, walletId, walletPublicKey } = options;  const registry = getStrategyRegistry();

  logger.info('Creating agent', {
    name: config.name,
    strategy: config.strategy,
    walletId,
  });

  // Validate strategy is registered
  if (!registry.has(config.strategy)) {
    return failure(new Error(`Unknown strategy: ${config.strategy}`));
  }

  // Validate params against schema
  const params = config.strategyParams ?? {};
  const validation = registry.validateParams(config.strategy, params);
  if (!validation.ok) {
    return failure(new Error(`Invalid strategy params: ${validation.error}`));
  }

  const validatedParams = validation.value;

  try {
    let agent: BaseAgent;

    switch (config.strategy) {
      case 'accumulator':
        agent = new AccumulatorAgent(
          config.name,
          walletId,
          walletPublicKey,
          validatedParams as unknown as Partial<AccumulatorParams>,
        );
        break;

      case 'distributor':
        agent = new DistributorAgent(
          config.name,
          walletId,
          walletPublicKey,
          validatedParams as unknown as Partial<DistributorParams>,
        );
        break;

      case 'balance_guard':
        agent = new BalanceGuardAgent(
          config.name,
          walletId,
          walletPublicKey,
          validatedParams as unknown as Partial<BalanceGuardParams>,
        );
        break;

      case 'scheduled_payer':
        agent = new ScheduledPayerAgent(
          config.name,
          walletId,
          walletPublicKey,
          validatedParams as unknown as Partial<ScheduledPayerParams>,
        );
        break;

      default:
        return failure(new Error(`Strategy "${config.strategy}" is registered but has no agent implementation`));
    }

    // Apply execution settings if provided
    if (config.executionSettings) {
      agent.updateExecutionSettings(config.executionSettings);
    }

    // Restore original id/createdAt when loading from persisted state
    if (options.idOverride) {
      Object.assign(agent, { id: options.idOverride });
    }
    if (options.createdAtOverride) {
      Object.assign(agent, { createdAt: options.createdAtOverride });
    }

    logger.info('Agent created successfully', {
      agentId: agent.id,
      name: agent.name,
      strategy: agent.strategy,
    });

    return success(agent);
  } catch (error) {
    logger.error('Failed to create agent', {
      name: config.name,
      error: String(error),
    });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Get available strategies
 */
export function getAvailableStrategies(): string[] {
  return getStrategyRegistry().list();
}

/**
 * Get strategy description
 */
export function getStrategyDescription(strategy: AgentStrategy): string {
  const def = getStrategyRegistry().get(strategy);
  return def?.description ?? 'Unknown strategy';
}
