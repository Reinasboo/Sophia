/**
 * Strategy Marketplace - Phase 1 (Architecture)
 *
 * ROADMAP:
 * - Phase 1 (Current): Type definitions + routing
 * - Phase 2 (May): Full StrategyRegistry integration
 * - Phase 3 (June): User-submitted strategies
 *
 * Shared strategy catalog for all users.
 * Per-user agent instances that use strategies from catalog.
 */

import type { StrategyDefinitionDTO } from '../agent/strategy-registry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('STRATEGY_MARKETPLACE');

/**
 * User strategy instance
 */
export interface UserStrategyInstance {
  agentId: string;
  agentName: string;
  strategyName: string;
  strategyLabel: string;
  strategyParams: Record<string, unknown>;
  status: 'running' | 'stopped' | 'error';
  createdAt: Date;
}

/**
 * Strategy Marketplace - Shared catalog for all tenants
 */
export class StrategyMarketplace {
  /**
   * List all available strategies (shared catalog)
   */
  listAvailableStrategies(): StrategyDefinitionDTO[] {
    logger.debug('Listing available strategies');
    // TODO: Implement in Phase 2
    return [];
  }

  /**
   * Get strategy details
   */
  getStrategyDetails(strategyName: string): StrategyDefinitionDTO | null {
    logger.debug(`Getting strategy details: ${strategyName}`);
    // TODO: Implement in Phase 2
    return null;
  }

  /**
   * List user's strategy instances
   */
  listUserStrategyInstances(tenantId: string): UserStrategyInstance[] {
    logger.debug(`Listing strategy instances for tenant: ${tenantId}`);
    // TODO: Implement in Phase 2
    return [];
  }

  /**
   * Get featured strategies for homepage
   */
  getFeaturedStrategies(): StrategyDefinitionDTO[] {
    logger.debug('Getting featured strategies');
    // TODO: Implement in Phase 2
    return [];
  }
}

let instance: StrategyMarketplace | null = null;

export function getStrategyMarketplace(): StrategyMarketplace {
  if (!instance) {
    instance = new StrategyMarketplace();
  }
  return instance;
}

logger.info('Strategy Marketplace loaded (Phase 1: stubs only)');
