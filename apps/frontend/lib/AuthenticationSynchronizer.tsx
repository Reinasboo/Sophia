/**
 * Authentication Synchronizer
 *
 * Manages Privy login flow and synchronizes with backend API key storage.
 * Must be inside PrivyProvider to access usePrivy hook.
 */

import { usePrivyAuthentication } from '@/lib/usePrivyAuthentication';
import React, { ReactNode } from 'react';

interface AuthSyncProps {
  children: ReactNode;
}

/**
 * Component that syncs Privy authentication with API key storage.
 * Should wrap all app content after PrivyProvider.
 */
export function AuthenticationSynchronizer({ children }: AuthSyncProps) {
  // This hook automatically exchanges Privy JWT for API key when user logs in
  usePrivyAuthentication();

  return <>{children}</>;
}
