/**
 * Privy Authentication Hook
 *
 * Handles Privy login flow and keeps the server-issued bearer token available
 * for authenticated API requests.
 *
 * Flow:
 * 1. Check if a valid server-issued bearer token exists in localStorage
 * 2. If yes, use it immediately (no Privy re-auth needed)
 * 3. If no, get Privy JWT and exchange it for a server-issued bearer token
 * 4. Store the server-issued bearer token (NOT the Privy token) in localStorage
 * 5. Server-issued tokens persist across sessions and devices
 */

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { getCurrentTenantApiKey, persistTenantSession } from './privy-provider';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://sophia-production-1a83.up.railway.app';

interface AuthenticationState {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

/**
 * Hook to sync Privy authentication with server-issued bearer token storage.
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
      // Check if we already have a valid server-issued bearer token in memory.
      const existingBearerToken = getCurrentTenantApiKey();

      // If we have a bearer token, mark as authenticated immediately.
      if (existingBearerToken) {
        setState({
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
        console.log('[Auth] Using existing server-issued bearer token');
        return;
      }

      // User not logged in via Privy
      if (!authenticated) {
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

        // Exchange Privy JWT for server-issued bearer token
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
        const bearerToken = data?.apiKey;

        if (!data.success || !tenantId || !bearerToken) {
          throw new Error(data.error || 'Invalid authentication response');
        }

        // IMPORTANT: Store the server-issued bearer token (NOT the Privy token)
        // This token is unique, persistent, and never changes for the same user.
        persistTenantSession({ tenantId, apiKey: bearerToken });

        console.log('[Auth] Received and stored server-issued bearer token', { tenantId });

        setState({
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
        console.error('[Auth] Privy authentication error:', errorMessage);

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
