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
    // Check if we have a stored Privy bearer token.
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('sophia_api_key') : null;
    const tenantId =
      typeof window !== 'undefined' ? localStorage.getItem('sophia_tenant_id') : null;
    const hasJwtBearer = !!apiKey && apiKey.split('.').length === 3;

    // Accept only JWT-shaped bearer tokens for authenticated pages.
    if (hasJwtBearer && tenantId) {
      setIsAuthenticated(true);
      setIsLoading(false);
    } else {
      // Not authenticated - redirect to landing/login
      setIsAuthenticated(false);
      setIsLoading(false);
      // Redirect to landing page if not authenticated
      router.push('/landing');
    }
  }, [router]);

  return { isLoading, isAuthenticated };
}
