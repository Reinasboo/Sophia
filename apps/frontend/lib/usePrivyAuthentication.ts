/**
 * Privy Authentication Hook
 *
 * Handles Privy login flow and keeps the Privy access token available
 * for authenticated API requests.
 * When user logs in via Privy, this hook:
 * 1. Gets the Privy JWT access token
 * 2. Exchanges it with the backend for tenant provisioning
 * 3. Stores the Privy bearer token in localStorage for API requests
 */

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://sophia-production-1a83.up.railway.app';

interface AuthenticationState {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Hook to sync Privy authentication with API bearer token storage.
 */
export function usePrivyAuthentication(): AuthenticationState {
  const { authenticated, getAccessToken } = usePrivy();
  const [state, setState] = useState<AuthenticationState>({
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  useEffect(() => {
    const syncAuthentication = async () => {
      if (!authenticated) {
        // User not logged in via Privy
        setState({
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
        return;
      }

      try {
        // Get Privy JWT token
        const accessToken = await getAccessToken();

        if (!accessToken) {
          throw new Error('Failed to get Privy access token');
        }

        // Check if we already have the same bearer token
        const existingApiKey =
          typeof window !== 'undefined' ? localStorage.getItem('sophia_api_key') : null;

        if (existingApiKey === accessToken) {
          // Already synced, just mark as authenticated
          setState({
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          return;
        }

        // Exchange Privy JWT for backend tenant provisioning
        const response = await fetch(`${API_BASE}/api/auth/privy-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accessToken,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to authenticate with backend');
        }

        const data = await response.json();

        const tenantId = data?.tenantId ?? data?.data?.tenantId;

        if (!data.success || !tenantId) {
          throw new Error(data.error || 'Invalid authentication response');
        }

        // Store the Privy bearer token and tenant ID in localStorage.
        // The backend validates the Privy JWT directly for protected routes.
        if (typeof window !== 'undefined') {
          localStorage.setItem('sophia_api_key', accessToken);
          localStorage.setItem('sophia_tenant_id', tenantId);
        }

        setState({
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
        console.error('Privy authentication error:', errorMessage);

        setState({
          isLoading: false,
          isAuthenticated: false,
          error: errorMessage,
        });
      }
    };

    syncAuthentication();
  }, [authenticated, getAccessToken]);

  return state;
}

/**
 * Get current Privy access token if user is authenticated.
 * Used for API requests that need user authentication.
 */
export async function getPrivyAccessToken(): Promise<string | null> {
  // This must be called from within a Privy-authenticated context
  // Use the usePrivy hook in components instead
  return null;
}
