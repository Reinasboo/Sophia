import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * Hook to protect pages with authentication.
 * 
 * H-2 FIX: Phase 1 implementation - checks for stored auth token.
 * Phase 2: Will integrate with Privy SDK for full OAuth2 flow.
 */
export function useAuthProtected() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if we have stored auth credentials from Privy callback
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('sophia_api_key') : null;
    const tenantId = typeof window !== 'undefined' ? localStorage.getItem('sophia_tenant_id') : null;
    
    // Phase 1: Accept if both are present
    // Phase 2: Will verify token with backend
    if (apiKey && tenantId) {
      setIsAuthenticated(true);
      setIsLoading(false);
    } else {
      // Not authenticated - redirect to landing/login
      setIsAuthenticated(false);
      setIsLoading(false);
      // Don't redirect on mount to avoid race conditions
      // Let page handle redirect based on isAuthenticated
    }
  }, []);

  return { isLoading, isAuthenticated };
}
