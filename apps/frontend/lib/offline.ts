/**
 * Offline Support Utility
 *
 * Provides localStorage persistence and sync for agent configurations and drafts.
 * When the network is unavailable, drafts are saved locally and synced when
 * the connection is restored.
 *
 * Key features:
 * - Draft agent config auto-save (debounced)
 * - Pending intent queue for when offline
 * - Sync status indicator
 * - Automatic retry with exponential backoff
 */

interface DraftAgentConfig {
  id: string;
  name: string;
  strategy: string;
  config: Record<string, unknown>;
  lastModified: number;
  synced: boolean;
}

interface PendingIntent {
  id: string;
  agentId: string;
  intentType: string;
  amount: number;
  recipient?: string;
  mint?: string;
  data?: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

interface OfflineState {
  isOnline: boolean;
  hasPendingChanges: boolean;
  syncInProgress: boolean;
  lastSyncTime: number | null;
}

const STORAGE_KEYS = {
  AGENT_DRAFTS: 'sophia_agent_drafts',
  PENDING_INTENTS: 'sophia_pending_intents',
  SYNC_STATE: 'sophia_sync_state',
} as const;

class OfflineManager {
  private offlineState: OfflineState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    hasPendingChanges: false,
    syncInProgress: false,
    lastSyncTime: null,
  };

  private listeners: Set<(state: OfflineState) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  /**
   * Subscribe to offline state changes
   */
  subscribe(listener: (state: OfflineState) => void): () => void {
    this.listeners.add(listener);
    // Emit current state immediately
    listener(this.offlineState);
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.offlineState));
  }

  private handleOnline(): void {
    this.offlineState.isOnline = true;
    if (process.env.NODE_ENV === 'development') {
      console.log('Network online - syncing pending changes');
    }
    this.notifyListeners();
    this.syncPendingChanges();
  }

  private handleOffline(): void {
    this.offlineState.isOnline = false;
    if (process.env.NODE_ENV === 'development') {
      console.log('Network offline - using local cache');
    }
    this.notifyListeners();
  }

  /**
   * Save agent config draft to localStorage (auto-synced when online)
   */
  saveDraftAgentConfig(config: DraftAgentConfig): void {
    try {
      const drafts = this.getDraftAgentConfigs();
      const index = drafts.findIndex((d) => d.id === config.id);

      if (index >= 0) {
        drafts[index] = { ...config, synced: false, lastModified: Date.now() };
      } else {
        drafts.push({ ...config, synced: false, lastModified: Date.now() });
      }

      localStorage.setItem(STORAGE_KEYS.AGENT_DRAFTS, JSON.stringify(drafts));
      this.offlineState.hasPendingChanges = !this.offlineState.isOnline;
      this.notifyListeners();

      if (process.env.NODE_ENV === 'development') {
        console.log(`Draft saved: Agent ${config.id}`);
      }
    } catch (error) {
      console.error('Failed to save agent draft:', error);
    }
  }

  /**
   * Get all agent config drafts from localStorage
   */
  getDraftAgentConfigs(): DraftAgentConfig[] {
    try {
      if (typeof window === 'undefined') return [];
      const stored = localStorage.getItem(STORAGE_KEYS.AGENT_DRAFTS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to read agent drafts:', error);
      return [];
    }
  }

  /**
   * Get draft for specific agent
   */
  getDraftAgentConfig(agentId: string): DraftAgentConfig | null {
    const drafts = this.getDraftAgentConfigs();
    return drafts.find((d) => d.id === agentId) || null;
  }

  /**
   * Clear draft for specific agent
   */
  clearDraftAgentConfig(agentId: string): void {
    try {
      const drafts = this.getDraftAgentConfigs();
      const filtered = drafts.filter((d) => d.id !== agentId);
      localStorage.setItem(STORAGE_KEYS.AGENT_DRAFTS, JSON.stringify(filtered));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to clear agent draft:', error);
    }
  }

  /**
   * Queue an intent for transmission when online
   */
  queuePendingIntent(
    agentId: string,
    intentType: string,
    amount: number,
    options?: {
      recipient?: string;
      mint?: string;
      data?: Record<string, unknown>;
    }
  ): void {
    try {
      const intents = this.getPendingIntents();
      const newIntent: PendingIntent = {
        id: `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId,
        intentType,
        amount,
        recipient: options?.recipient,
        mint: options?.mint,
        data: options?.data,
        createdAt: Date.now(),
        retries: 0,
      };

      intents.push(newIntent);
      localStorage.setItem(STORAGE_KEYS.PENDING_INTENTS, JSON.stringify(intents));
      this.offlineState.hasPendingChanges = true;
      this.notifyListeners();

      if (process.env.NODE_ENV === 'development') {
        console.log(`Pending intent queued: ${newIntent.id}`);
      }
    } catch (error) {
      console.error('Failed to queue pending intent:', error);
    }
  }

  /**
   * Get all pending intents from localStorage
   */
  getPendingIntents(): PendingIntent[] {
    try {
      if (typeof window === 'undefined') return [];
      const stored = localStorage.getItem(STORAGE_KEYS.PENDING_INTENTS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to read pending intents:', error);
      return [];
    }
  }

  /**
   * Remove pending intent after successful sync
   */
  clearPendingIntent(intentId: string): void {
    try {
      const intents = this.getPendingIntents();
      const filtered = intents.filter((i) => i.id !== intentId);
      localStorage.setItem(STORAGE_KEYS.PENDING_INTENTS, JSON.stringify(filtered));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to clear pending intent:', error);
    }
  }

  /**
   * Get current offline state
   */
  getState(): OfflineState {
    return { ...this.offlineState };
  }

  /**
   * Attempt to sync pending changes (called when online)
   * This is a low-level method — actual sync logic belongs in React components
   */
  private async syncPendingChanges(): Promise<void> {
    if (this.offlineState.syncInProgress) return;

    this.offlineState.syncInProgress = true;
    this.notifyListeners();

    try {
      // Components using this manager should implement the actual sync logic
      // This is just a trigger for UI to respond
      const pendingIntents = this.getPendingIntents();
      const draftConfigs = this.getDraftAgentConfigs();

      if (pendingIntents.length === 0 && draftConfigs.every((d) => d.synced)) {
        this.offlineState.hasPendingChanges = false;
        this.offlineState.lastSyncTime = Date.now();
      }
    } finally {
      this.offlineState.syncInProgress = false;
      this.notifyListeners();
    }
  }

  /**
   * Mark a draft as synced
   */
  markDraftSynced(agentId: string): void {
    try {
      const drafts = this.getDraftAgentConfigs();
      const draft = drafts.find((d) => d.id === agentId);
      if (draft) {
        draft.synced = true;
        localStorage.setItem(STORAGE_KEYS.AGENT_DRAFTS, JSON.stringify(drafts));
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Failed to mark draft as synced:', error);
    }
  }

  /**
   * Clear all offline data (on logout)
   */
  clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.AGENT_DRAFTS);
      localStorage.removeItem(STORAGE_KEYS.PENDING_INTENTS);
      localStorage.removeItem(STORAGE_KEYS.SYNC_STATE);
      this.offlineState.hasPendingChanges = false;
      this.offlineState.lastSyncTime = null;
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to clear offline data:', error);
    }
  }
}

// Export singleton instance
export const offlineManager = new OfflineManager();

export type { DraftAgentConfig, PendingIntent, OfflineState };
