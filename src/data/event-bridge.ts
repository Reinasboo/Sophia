/**
 * Data Tracker Event Bridge
 *
 * Automatically records system events to the indexing layer
 * whenever they occur in the system.
 */

import { getDataTracker } from './tracker.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DATA_BRIDGE');

/**
 * Attach data tracking to the event bus
 * Call this once during system startup
 */
export function attachDataTracker(eventBus: { subscribe: (handler: (event: any) => void) => () => void }): void {
  eventBus.subscribe(async (event: any) => {
    try {
      const tracker = getDataTracker();

      if (event?.type === 'agent_created') {
        await tracker.recordEvent({
          tenantId: event.agent?.tenantId ?? 'unknown',
          eventType: 'agent_created',
          entityId: event.agent?.id ?? event.id ?? 'unknown',
          entityType: 'agent',
          data: { name: event.agent?.name, type: event.agent?.strategy },
          createdAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        });
        return;
      }

      if (event?.type === 'agent_status_changed') {
        await tracker.recordEvent({
          tenantId: event.agent?.tenantId ?? 'unknown',
          eventType: event.newStatus === 'active' ? 'agent_activated' : 'agent_deactivated',
          entityId: event.agentId,
          entityType: 'agent',
          data: {
            previousStatus: event.previousStatus,
            newStatus: event.newStatus,
          },
          createdAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        });
        return;
      }

      if (event?.type === 'transaction') {
        await tracker.recordEvent({
          tenantId: event.transaction?.tenantId ?? 'unknown',
          eventType: 'transaction_indexed',
          entityId: event.transaction?.signature ?? event.id ?? 'unknown',
          entityType: 'transaction',
          data: {
            status: event.transaction?.status,
            type: event.transaction?.type,
            amount: event.transaction?.amount,
            walletId: event.transaction?.walletId,
          },
          createdAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        });
        return;
      }

      if (event?.type === 'system_error') {
        await tracker.recordEvent({
          tenantId: event.context?.tenantId ?? 'unknown',
          eventType: 'system_alert',
          entityId: event.id ?? 'unknown',
          entityType: 'system',
          data: {
            error: event.error,
            context: event.context,
          },
          createdAt: event.timestamp ? new Date(event.timestamp) : new Date(),
        });
      }
    } catch (err) {
      logger.warn('Failed to track system event', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  logger.info('Data tracker attached to event bus');
}
