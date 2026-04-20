/**
 * Integration Module Exports
 *
 * The Bring-Your-Own-Agent (BYOA) integration layer.
 * External AI agents register here, receive a bound wallet,
 * and interact via high-level intents — never raw transactions.
 */

export {
  AgentRegistry,
  getAgentRegistry,
  ExternalAgentType,
  ExternalAgentStatus,
  SupportedIntentType,
  ExternalAgentRegistration,
  ExternalAgentRecord,
  ExternalAgentInfo,
  RegistrationResult,
} from './agentRegistry.js';

export { WalletBinder, getWalletBinder, WalletBindingResult } from './walletBinder.js';

export {
  IntentRouter,
  getIntentRouter,
  ExternalIntent,
  IntentResult,
  IntentHistoryRecord,
} from './intentRouter.js';

export {
  AgentAdapter,
  getAgentAdapter,
  AgentNotification,
  AgentCallbackResponse,
  LocalAdapterFn,
} from './agentAdapter.js';

// ─── Multi-Tenant (Phase 1) ──────────────────────────────────────────────────

export { TenantDatabase, getTenantDatabase } from './tenant-database.js';

export { verifyTenantToken, extractBearerToken } from './auth-middleware.js';

export {
  PrivyUserInfo,
  verifyPrivyToken,
  getOrCreateTenantForPrivyUser,
} from './privy-integration.js';

export {
  StrategyMarketplace,
  getStrategyMarketplace,
  UserStrategyInstance,
} from './strategy-marketplace.js';
