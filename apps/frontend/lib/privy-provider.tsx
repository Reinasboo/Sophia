import React, { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PrivyProvider as PrivySdkProvider } from '@privy-io/react-auth';

interface TenantSession {
  tenantId: string;
  apiKey: string;
}

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
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(TENANT_SESSION_KEYS.tenantId, tenantSession.tenantId);
  localStorage.setItem(TENANT_SESSION_KEYS.apiKey, tenantSession.apiKey);
  localStorage.setItem(TENANT_SESSION_KEYS.legacyTenantId, tenantSession.tenantId);
  localStorage.setItem(TENANT_SESSION_KEYS.legacyApiKey, tenantSession.apiKey);
}

export function clearTenantSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(TENANT_SESSION_KEYS.tenantId);
  localStorage.removeItem(TENANT_SESSION_KEYS.apiKey);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyTenantId);
  localStorage.removeItem(TENANT_SESSION_KEYS.legacyApiKey);
}

function readTenantSession(): TenantSession | null {
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

  return { tenantId, apiKey };
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
    setTenantSession(readTenantSession());
    setLoading(false);
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
