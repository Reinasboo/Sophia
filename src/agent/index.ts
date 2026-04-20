/**
 * Agent Module Exports
 *
 * This module contains agent implementations.
 * Agents make decisions but have NO access to private keys.
 */

export { BaseAgent, AgentContext, AgentDecision } from './base-agent.js';
export { AccumulatorAgent, AccumulatorParams } from './accumulator-agent.js';
export { DistributorAgent, DistributorParams } from './distributor-agent.js';
export {
  createAgent,
  CreateAgentOptions,
  getAvailableStrategies,
  getStrategyDescription,
} from './agent-factory.js';

export {
  getStrategyRegistry,
  StrategyDefinition,
  StrategyDefinitionDTO,
  ExecutionSettings as StrategyExecutionSettings,
  DEFAULT_EXECUTION_SETTINGS,
  ExecutionSettingsSchema,
} from './strategy-registry.js';
export { BalanceGuardAgent } from './balance-guard-agent.js';
export { ScheduledPayerAgent } from './scheduled-payer-agent.js';
