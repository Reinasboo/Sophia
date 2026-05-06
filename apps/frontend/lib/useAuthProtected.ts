import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

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
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (!ready) {
      setIsLoading(true);
      return;
    }

    setIsLoading(false);

    if (authenticated) {
      setIsAuthenticated(true);
      return;
    }

    setIsAuthenticated(false);
    router.push('/landing');
  }, [authenticated, ready, router]);

  return { isLoading, isAuthenticated };
}
