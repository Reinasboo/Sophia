/**
 * Data Tracker Event Bridge
 *
 * Automatically records intents and events to the indexing layer
 * whenever they occur in the system.
 */

import { EventEmitter } from 'events';
import { getDataTracker } from './tracker.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DATA_BRIDGE');

/**
 * Attach data tracking to the event bus
 * Call this once during system startup
 */
export function attachDataTracker(eventBus: EventEmitter): void {
  // Track intent submissions
  eventBus.on('intent:submitted', async (data: any) => {
    try {
      const tracker = getDataTracker();
      await tracker.recordIntent({
        id: data.intentId,
        tenantId: data.tenantId,
        agentId: data.agentId,
        intentType: data.type,
        status: 'pending',
        params: data.params || {},
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn('Failed to track intent submission', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Track intent execution
  eventBus.on('intent:executed', async (data: any) => {
    try {
      const tracker = getDataTracker();
      if (data.intentId) {
        await tracker.updateIntentResult(data.intentId, {
          status: 'executed',
          result: data.result,
          signature: data.signature,
        });
      }
    } catch (err) {
      logger.warn('Failed to track intent execution', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Track intent failures
  eventBus.on('intent:failed', async (data: any) => {
    try {
      const tracker = getDataTracker();
      if (data.intentId) {
        await tracker.updateIntentResult(data.intentId, {
          status: 'failed',
          error: data.error,
        });
      }
    } catch (err) {
      logger.warn('Failed to track intent failure', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Track agent events
  eventBus.on('agent:created', async (data: any) => {
    try {
      const tracker = getDataTracker();
      await tracker.recordEvent({
        tenantId: data.tenantId,
        eventType: 'agent_created',
        entityId: data.agentId,
        entityType: 'agent',
        data: { name: data.name, type: data.type },
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn('Failed to track agent creation', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  eventBus.on('agent:deactivated', async (data: any) => {
    try {
      const tracker = getDataTracker();
      await tracker.recordEvent({
        tenantId: data.tenantId,
        eventType: 'agent_deactivated',
        entityId: data.agentId,
        entityType: 'agent',
        data: { reason: data.reason },
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn('Failed to track agent deactivation', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  logger.info('Data tracker attached to event bus');
}
