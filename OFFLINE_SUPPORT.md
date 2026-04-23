# Offline Support Guide

The Sophia frontend includes built-in offline capabilities that allow users to continue working with agent configurations and intents even when the network connection is unavailable.

## Features

- **Draft Auto-Save**: Agent configurations are automatically saved to localStorage as users edit them
- **Pending Intent Queue**: Intents submitted while offline are queued and sent when the connection is restored
- **Sync Status Indicator**: Users can see the synchronization status in real-time
- **Automatic Retry**: Pending changes are automatically retried when the network comes back online

## Architecture

### Core Components

1. **OfflineManager** (`lib/offline.ts`)
   - Manages localStorage persistence
   - Handles network state changes (online/offline events)
   - Provides methods for saving drafts and queuing intents
   - Notifies React components of state changes

2. **useOffline Hook** (`lib/useOffline.ts`)
   - React hook for accessing offline state
   - Provides convenient methods for draft management
   - Automatically subscribes to state changes

3. **localStorage Keys**
   - `sophia_agent_drafts`: Stores unsaved agent configuration drafts
   - `sophia_pending_intents`: Stores intents created while offline
   - `sophia_sync_state`: Stores sync metadata

## Usage in Components

### Basic Setup

```typescript
import { useOffline } from '@/lib/useOffline';

export function MyComponent() {
  const {
    isOnline,
    hasPendingChanges,
    saveDraftAgentConfig,
    queuePendingIntent,
  } = useOffline();

  return (
    <>
      <p>Status: {isOnline ? '🟢 Online' : '🔴 Offline'}</p>
      {hasPendingChanges && <SyncIndicator />}
    </>
  );
}
```

### Saving Agent Configuration Drafts

When users edit an agent configuration, save it automatically with debouncing:

```typescript
import { useEffect } from 'react';
import { useOffline } from '@/lib/useOffline';

export function AgentConfigEditor({ agentId, initialConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const { saveDraftAgentConfig } = useOffline();

  // Auto-save on changes with 1-second debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraftAgentConfig({
        id: agentId,
        name: config.name,
        strategy: config.strategy,
        config: config.params,
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [config]);

  return (
    // Configuration form
  );
}
```

### Retrieving Saved Drafts

Load saved drafts when component mounts:

```typescript
export function AgentForm({ agentId }) {
  const { getDraftAgentConfig, clearDraftAgentConfig } = useOffline();
  const [config, setConfig] = useState(initialConfig);

  useEffect(() => {
    // Check for saved draft
    const draft = getDraftAgentConfig(agentId);
    if (draft) {
      setConfig(draft.config);
      // Show user: "Found unsaved draft from [time]"
    }
  }, [agentId]);

  const handleDiscard = () => {
    clearDraftAgentConfig(agentId);
  };

  return (
    // Form with discard button
  );
}
```

### Queuing Intents While Offline

Queue an intent when the user is offline:

```typescript
export function IntentSubmission() {
  const { isOnline, queuePendingIntent } = useOffline();

  const handleSubmit = async (intent) => {
    try {
      if (isOnline) {
        // Send immediately
        await submitIntent(intent);
      } else {
        // Queue for later
        queuePendingIntent(
          intent.agentId,
          intent.intentType,
          intent.amount,
          {
            recipient: intent.recipient,
            mint: intent.mint,
          }
        );
        showToast('Intent queued - will sync when online');
      }
    } catch (error) {
      // Queue if network error
      queuePendingIntent(...);
    }
  };

  return (
    // Submission form
  );
}
```

### Sync Status UI

Show users when changes are being synced:

```typescript
export function SyncIndicator() {
  const {
    isOnline,
    hasPendingChanges,
    syncInProgress,
    lastSyncTime,
  } = useOffline();

  if (!hasPendingChanges) return null;

  return (
    <div className="sync-indicator">
      {syncInProgress ? (
        <div>
          <Spinner />
          Syncing changes...
        </div>
      ) : isOnline ? (
        <div>
          <Badge>Connected</Badge>
          {lastSyncTime && (
            <span>Last sync: {formatTime(lastSyncTime)}</span>
          )}
        </div>
      ) : (
        <div>
          <Badge variant="warning">Offline</Badge>
          {hasPendingChanges && (
            <span>Changes will sync when online</span>
          )}
        </div>
      )}
    </div>
  );
}
```

## Data Storage Specification

### Draft Agent Config Structure

```typescript
interface DraftAgentConfig {
  id: string; // Agent ID
  name: string; // Agent name
  strategy: string; // Strategy type
  config: Record<string, unknown>; // Strategy parameters
  lastModified: number; // Timestamp in ms
  synced: boolean; // Whether successfully synced
}
```

### Pending Intent Structure

```typescript
interface PendingIntent {
  id: string; // Unique intent ID
  agentId: string; // Source agent
  intentType: string; // transfer_sol, transfer_token, etc.
  amount: number; // Amount
  recipient?: string; // Optional recipient address
  mint?: string; // Optional mint address
  data?: Record<string, unknown>; // Optional custom data
  createdAt: number; // Timestamp in ms
  retries: number; // Number of sync attempts
}
```

## Storage Limits

- **localStorage capacity**: ~5MB per domain (browser-dependent)
- **Typical usage**: ~1KB per agent draft, ~2KB per pending intent
- **Practical limits**:
  - ~500 unsaved agent drafts
  - ~1000 pending intents

If storage limits are exceeded, older entries are automatically cleared. Components should monitor the `clearAll()` method for logout scenarios.

## Best Practices

1. **Debounce Saves**: Always debounce draft saves to prevent excessive localStorage writes
2. **User Feedback**: Show clear UI feedback about sync status and pending changes
3. **Confirmation**: Ask for confirmation before discarding unsaved drafts
4. **Cleanup**: Call `clearAll()` on logout to remove sensitive data
5. **Error Handling**: Gracefully handle localStorage quota exceeded errors
6. **Testing**: Test functionality with DevTools offline mode or throttled connections

## Troubleshooting

### Drafts Not Persisting

1. Check localStorage is enabled: `localStorage.setItem('test', '1')`
2. Check for quota exceeded: Browser console will show error
3. Verify components are using `useOffline` hook correctly

### Changes Not Syncing When Online

1. Implement sync logic in components after calling network APIs
2. Call `markDraftSynced()` or `clearPendingIntent()` after successful submission
3. Check DevTools Network tab for failed requests

### localStorage Size Growing

1. Monitor with: `Object.keys(localStorage).reduce((size, key) => size + localStorage.getItem(key).length, 0)`
2. Implement periodic cleanup for old drafts
3. Add UI control to manually clear old entries

## Security Considerations

- **No Sensitive Data**: Never store private keys, seed phrases, or signing credentials
- **Encryption**: For sensitive data, consider encoding before storing
- **Clearing**: Always clear localStorage on logout
- **Browser Context**: Data is visible to all tabs/windows in the same origin
- **Developer Tools**: DevTools can inspect localStorage; inform users appropriately

---

**Last Updated**: April 15, 2026
**Stability**: Production-ready with error handling
