/**
 * Tenant Session Provider - Phase 1 (Simplified)
 *
 * ROADMAP:
 * - Phase 1 (Current): Local storage + context
 * - Phase 2 (May): Install @privy-io/react-auth + Privy integration
 * - Phase 3 (June): Token refresh + session persistence
 *
 * For now, manages tenant session without Privy SDK.
 */

import React, { ReactNode, createContext, useContext, useState, useEffect } from 'react';

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

const PrivyContext = createContext<PrivyContextType | undefined>(undefined);

/**
 * Tenant Session Provider - Phase 1
 */
export function PrivyProvider({ children }: { children: ReactNode }) {
  const [tenantSession, setTenantSession] = useState<TenantSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Load from localStorage
    const tenantId = localStorage.getItem('tenantId');
    const apiKey = localStorage.getItem('apiKey');

    if (tenantId && apiKey) {
      setTenantSession({ tenantId, apiKey });
    }

    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('tenantId');
    localStorage.removeItem('apiKey');
    setTenantSession(null);
  };

  return (
    <PrivyContext.Provider value={{ tenantSession, loading, error, logout }}>
      {children}
    </PrivyContext.Provider>
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
