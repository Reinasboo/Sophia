import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * Hook to protect pages with authentication.
 * TODO: Integrate with Privy when App ID is configured
 */
export function useAuthProtected() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // For now, allow access to all pages
    setIsLoading(false);
  }, []);

  return { isLoading, isAuthenticated: true };
}
