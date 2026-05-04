/**
 * Event Emitter
 *
 * Simple typed event emitter for system-wide events.
 * - Handles errors gracefully without crashing subscribers
 * - Logs errors to structured logger
 * - Scales to 10,000+ concurrent connections
 */

import { createLogger } from '../utils/logger.js';
import { SystemEvent } from '../types/shared.js';

const logger = createLogger('EVENT_BUS');

type EventHandler = (event: SystemEvent) => void;

/**
 * EventBus - Central event dispatcher
 */
class EventBus {
  private handlers: Set<EventHandler> = new Set();
  private eventHistory: SystemEvent[] = [];
  private maxHistorySize: number = 1000;
  private maxSubscribers: number = process.env['MAX_EVENT_SUBSCRIBERS']
    ? parseInt(process.env['MAX_EVENT_SUBSCRIBERS'], 10)
    : 10000;

  /**
   * Subscribe to all events
   */
  subscribe(handler: EventHandler): () => void {
    // H-9 FIX: Warn if approaching limit, but still accept (fail open)
    if (this.handlers.size >= this.maxSubscribers * 0.9) {
      logger.warn('EventBus approaching subscriber limit', {
        current: this.handlers.size,
        limit: this.maxSubscribers,
        percentUsed: Math.round((this.handlers.size / this.maxSubscribers) * 100),
      });
    }

    // Still add the handler even if warning
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Emit an event to all subscribers
   * C-4 FIX: Errors are logged to structured logger, not console
   */
  emit(event: SystemEvent): void {
    // Store in history (M-4: use slice trim instead of O(n) shift)
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize * 1.5) {
      // Trim once we've grown 50% over max — amortized O(1)
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        // C-4 FIX: Log to structured logger instead of console
        logger.error('Event handler threw error - subscriber may be out of sync', {
          handlerName: handler.name || 'anonymous',
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          eventType: event.type,
        });
        // Note: We do NOT stop processing other handlers
        // This ensures one broken handler doesn't break the event bus
      }
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(count: number = 100): SystemEvent[] {
    return this.eventHistory.slice(-count);
  }

  /**
   * Get events for a specific agent
   */
  getAgentEvents(agentId: string, count: number = 50): SystemEvent[] {
    return this.eventHistory
      .filter((e) => {
        if ('agentId' in e) return e.agentId === agentId;
        if ('agent' in e) return e.agent.id === agentId;
        return false;
      })
      .slice(-count);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get current subscriber count (for monitoring)
   */
  getSubscriberCount(): number {
    return this.handlers.size;
  }
}

// Singleton instance
export const eventBus = new EventBus();
