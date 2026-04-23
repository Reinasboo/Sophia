/**
 * useOffline Hook
 *
 * React hook for accessing offline state and managing drafts/pending intents.
 * Automatically updates when network status changes.
 *
 * Usage:
 * ```tsx
 * const { isOnline, hasPendingChanges, saveDraft, queueIntent } = useOffline();
 *
 * // Auto-save draft whenever config changes
 * useEffect(() => {
 *   const timer = setTimeout(() => {
 *     saveDraft({ id, name, strategy, config });
 *   }, 1000); // Debounce
 *   return () => clearTimeout(timer);
 * }, [config]);
 *
 * // Show sync indicator
 * {hasPendingChanges && <SyncIndicator />}
 * ```
 */

'use client';

import { useEffect, useState } from 'react';
import {
  offlineManager,
  type OfflineState,
  type DraftAgentConfig,
  type PendingIntent,
} from './offline';

export interface UseOfflineReturn {
  // State
  isOnline: boolean;
  hasPendingChanges: boolean;
  syncInProgress: boolean;
  lastSyncTime: number | null;

  // Agent config drafts
  saveDraftAgentConfig: (config: DraftAgentConfig) => void;
  getDraftAgentConfig: (agentId: string) => DraftAgentConfig | null;
  getAllDraftAgentConfigs: () => DraftAgentConfig[];
  clearDraftAgentConfig: (agentId: string) => void;

  // Pending intents
  queuePendingIntent: (
    agentId: string,
    intentType: string,
    amount: number,
    options?: {
      recipient?: string;
      mint?: string;
      data?: Record<string, unknown>;
    }
  ) => void;
  getPendingIntents: () => PendingIntent[];
  clearPendingIntent: (intentId: string) => void;

  // Utilities
  clearAll: () => void;
}

export function useOffline(): UseOfflineReturn {
  const [offlineState, setOfflineState] = useState<OfflineState>(offlineManager.getState());

  useEffect(() => {
    // Subscribe to offline state changes
    const unsubscribe = offlineManager.subscribe((state) => {
      setOfflineState(state);
    });

    return unsubscribe;
  }, []);

  return {
    // State
    isOnline: offlineState.isOnline,
    hasPendingChanges: offlineState.hasPendingChanges,
    syncInProgress: offlineState.syncInProgress,
    lastSyncTime: offlineState.lastSyncTime,

    // Agent config drafts
    saveDraftAgentConfig: (config: DraftAgentConfig) => {
      offlineManager.saveDraftAgentConfig(config);
    },
    getDraftAgentConfig: (agentId: string) => {
      return offlineManager.getDraftAgentConfig(agentId);
    },
    getAllDraftAgentConfigs: () => {
      return offlineManager.getDraftAgentConfigs();
    },
    clearDraftAgentConfig: (agentId: string) => {
      offlineManager.clearDraftAgentConfig(agentId);
    },

    // Pending intents
    queuePendingIntent: (agentId, intentType, amount, options) => {
      offlineManager.queuePendingIntent(agentId, intentType, amount, options);
    },
    getPendingIntents: () => {
      return offlineManager.getPendingIntents();
    },
    clearPendingIntent: (intentId: string) => {
      offlineManager.clearPendingIntent(intentId);
    },

    // Utilities
    clearAll: () => {
      offlineManager.clearAll();
    },
  };
}
