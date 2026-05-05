/**
 * Privy Authentication Hook
 *
 * Handles Privy login flow and exchanges JWT for API key.
 * When user logs in via Privy, this hook:
 * 1. Gets the Privy JWT access token
 * 2. Exchanges it with the backend for a tenant API key
 * 3. Stores the API key in localStorage for API requests
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
 * Hook to sync Privy authentication with API key.
 * Automatically exchanges Privy JWT for API key and stores it.
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

        // Check if we already have a valid API key
        const existingApiKey =
          typeof window !== 'undefined' ? localStorage.getItem('sophia_api_key') : null;

        if (existingApiKey) {
          // Already have API key, just mark as authenticated
          setState({
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          return;
        }

        // Exchange Privy JWT for API key
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

        if (!data.success || !data.data?.apiKey || !data.data?.tenantId) {
          throw new Error(data.error || 'Invalid authentication response');
        }

        // Store API key and tenant ID in localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('sophia_api_key', data.data.apiKey);
          localStorage.setItem('sophia_tenant_id', data.data.tenantId);
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
