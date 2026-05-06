import React, { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PrivyProvider as PrivySdkProvider } from '@privy-io/react-auth';

interface TenantSession {
  tenantId: string;
  apiKey: string;
}

const TENANT_SESSION_EVENT = 'sophia-tenant-session-changed';

let currentTenantSession: TenantSession | null = null;

interface PrivyContextType {
  tenantSession: TenantSession | null;
  loading: boolean;
  error: Error | null;
  logout: () => void;
}

const TENANT_SESSION_KEYS = {
  tenantId: 'sophia_tenant_id',
  apiKey: 'sophia_api_key',
  legacyTenantId: 'tenantId',
  legacyApiKey: 'apiKey',
} as const;

export function persistTenantSession(tenantSession: TenantSession): void {
  currentTenantSession = tenantSession;

  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(TENANT_SESSION_KEYS.tenantId, tenantSession.tenantId);
  localStorage.setItem(TENANT_SESSION_KEYS.legacyTenantId, tenantSession.tenantId);
  localStorage.removeItem(TENANT_SESSION_KEYS.apiKey);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyApiKey);

  window.dispatchEvent(new Event(TENANT_SESSION_EVENT));
}

export function clearTenantSession(): void {
  currentTenantSession = null;

  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(TENANT_SESSION_KEYS.tenantId);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyTenantId);
  localStorage.removeItem(TENANT_SESSION_KEYS.apiKey);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyApiKey);

  window.dispatchEvent(new Event(TENANT_SESSION_EVENT));
}

function readTenantSession(): TenantSession | null {
  if (currentTenantSession) {
    return currentTenantSession;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const tenantId =
    localStorage.getItem(TENANT_SESSION_KEYS.tenantId) ??
    localStorage.getItem(TENANT_SESSION_KEYS.legacyTenantId);
  const apiKey =
    localStorage.getItem(TENANT_SESSION_KEYS.apiKey) ??
    localStorage.getItem(TENANT_SESSION_KEYS.legacyApiKey);

  if (!tenantId || !apiKey) {
    return null;
  }

  currentTenantSession = { tenantId, apiKey };
  localStorage.removeItem(TENANT_SESSION_KEYS.apiKey);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyApiKey);
  return currentTenantSession;
}

export function getCurrentTenantApiKey(): string | null {
  return currentTenantSession?.apiKey ?? null;
}

const PrivyContext = createContext<PrivyContextType | undefined>(undefined);

/**
 * Tenant Session Provider wired to the Privy SDK.
 */
export function PrivyProvider({ children }: { children: ReactNode }) {
  const appId = process.env['NEXT_PUBLIC_PRIVY_APP_ID'];
  const [tenantSession, setTenantSession] = useState<TenantSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const syncTenantSession = () => {
      setTenantSession(readTenantSession());
    };

    const bootstrapTenantSession = async () => {
      syncTenantSession();

      if (currentTenantSession) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            success?: boolean;
            tenantId?: string;
            apiKey?: string;
          };

          if (payload.success && payload.tenantId && payload.apiKey) {
            persistTenantSession({ tenantId: payload.tenantId, apiKey: payload.apiKey });
          }
        }
      } catch {
        // No persistent session available; login flow will bootstrap again.
      } finally {
        if (!cancelled) {
          setTenantSession(readTenantSession());
          setLoading(false);
        }
      }
    };

    void bootstrapTenantSession();
    window.addEventListener(TENANT_SESSION_EVENT, syncTenantSession);

    return () => {
      cancelled = true;
      window.removeEventListener(TENANT_SESSION_EVENT, syncTenantSession);
    };
  }, []);

  const logout = () => {
    clearTenantSession();
    setTenantSession(null);
  };

  const contextValue = useMemo(
    () => ({ tenantSession, loading, error, logout }),
    [tenantSession, loading, error]
  );

  if (!appId) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is required to initialize Privy.');
  }

  return (
    <PrivySdkProvider appId={appId}>
      <PrivyContext.Provider value={contextValue}>{children}</PrivyContext.Provider>
    </PrivySdkProvider>
  );
}

/**
 * Hook to access tenant session
 */
export function useTenantSession(): PrivyContextType {
  const context = useContext(PrivyContext);
  if (!context) {
    throw new Error('useTenantSession must be used within PrivyProvider');
  }
  return context;
}
