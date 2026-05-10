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
import { StrategyDrivenAgent } from './strategy-driven-agent.js';
import { AgentStrategy, Result, success, failure } from '../types/shared.js';
import { AgentConfig } from '../types/internal.js';
import { getStrategyRegistry } from './strategy-registry.js';
import { createLogger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

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
  const { config, walletId, walletPublicKey } = options;
  const registry = getStrategyRegistry();
  const runtimeConfig = getConfig();

  logger.info('Creating agent', {
    name: config.name,
    strategy: config.strategy,
    walletId,
  });

  // Validate strategy is registered
  if (!registry.has(config.strategy)) {
    return failure(new Error(`Unknown strategy: ${config.strategy}`));
  }

  const strategyDef = registry.get(config.strategy);
  if (
    process.env['NODE_ENV'] === 'production' &&
    runtimeConfig.SOLANA_NETWORK === 'mainnet-beta' &&
    strategyDef?.supportedIntents.includes('REQUEST_AIRDROP')
  ) {
    return failure(
      new Error(
        `Strategy "${config.strategy}" is not allowed in mainnet production (REQUEST_AIRDROP).`
      )
    );
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
      // Legacy agents (maintained for backward compatibility)
      case 'accumulator': {
        const params: Partial<AccumulatorParams> = validatedParams;
        agent = new AccumulatorAgent(
          config.name,
          walletId,
          walletPublicKey,
          params,
          undefined,
          undefined,
          config.tenantId
        );
        break;
      }
      case 'distributor': {
        const params: Partial<DistributorParams> = validatedParams;
        agent = new DistributorAgent(
          config.name,
          walletId,
          walletPublicKey,
          params,
          undefined,
          undefined,
          config.tenantId
        );
        break;
      }
      case 'balance_guard': {
        const params: Partial<BalanceGuardParams> = validatedParams;
        agent = new BalanceGuardAgent(
          config.name,
          walletId,
          walletPublicKey,
          params,
          undefined,
          undefined,
          config.tenantId
        );
        break;
      }
      case 'scheduled_payer': {
        const params: Partial<ScheduledPayerParams> = validatedParams;
        agent = new ScheduledPayerAgent(
          config.name,
          walletId,
          walletPublicKey,
          params,
          undefined,
          undefined,
          config.tenantId
        );
        break;
      }

      // 11 Realistic Mainnet Trading Strategies (StrategyDrivenAgent-backed)
      case 'scalping_trading':
      case 'breakout_trading':
      case 'mean_reversion_trading':
      case 'dca':
      case 'grid_trading':
      case 'momentum_trading':
      case 'arbitrage':
      case 'stop_loss_guard':
      case 'yield_harvesting':
      case 'portfolio_rebalancer':
      case 'airdrop_farmer': {
        agent = new StrategyDrivenAgent(
          config.name,
          config.strategy,
          walletId,
          walletPublicKey,
          validatedParams,
          strategyDef?.supportedIntents ?? [],
          undefined, // executionSettings override
          undefined, // idOverride
          config.tenantId // MULTI-TENANT: Pass tenant context
        );
        break;
      }

      default:
        // Fallback for any unknown strategy
        return failure(
          new Error(
            `Strategy "${config.strategy}" has no agent implementation. ` +
              `Known strategies: ${registry.list().join(', ')}`
          )
        );
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
