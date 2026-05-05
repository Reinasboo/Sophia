import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/router';
import { persistTenantSession } from '@/lib/privy-provider';
import { BrandMark } from './BrandMark';

interface PrivySigninProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const PrivySignin: React.FC<PrivySigninProps> = ({ onSuccess, onError }) => {
  const router = useRouter();
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const exchangeInFlight = React.useRef(false);

  const exchangePrivyToken = React.useCallback(async () => {
    if (!ready || !authenticated || exchangeInFlight.current) {
      return;
    }

    exchangeInFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Unable to read the Privy access token. Please try again.');
      }

      const response = await fetch('/api/auth/privy-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Privy sign-in failed');
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Privy sign-in failed');

      const { tenantId } = result;
      persistTenantSession({ tenantId, apiKey: accessToken });

      // Let parent handle navigation
      onSuccess?.();
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Privy sign-in failed';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
    } finally {
      setLoading(false);
      exchangeInFlight.current = false;
    }
  }, [authenticated, getAccessToken, onError, onSuccess, ready, router]);

  React.useEffect(() => {
    void exchangePrivyToken();
  }, [exchangePrivyToken]);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      await login();
      if (!authenticated) {
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to open Privy login';
      setError(message);
      setLoading(false);
      onError?.(err instanceof Error ? err : new Error(message));
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <BrandMark href="/" size="md" label="Sophia" sublabel="Agentic Wallet" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">Agentic Wallet</h1>
        <p className="text-text-secondary">Login or register to access your control plane</p>
      </div>

      <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 space-y-6">
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading || !ready}
            className="w-full px-4 py-2 bg-primary hover:bg-primary-600 text-black font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? 'Opening Privy...' : 'Continue with Privy'}
          </button>

          <p className="text-xs text-text-tertiary text-center">
            Use Privy to sign in with email, wallet, or social login. Your returned tenant session
            is stored locally after verification.
          </p>
          {error && <div className="text-sm text-status-error">{error}</div>}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-muted" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-surface-elevated text-text-tertiary">or</span>
          </div>
        </div>

        <div className="space-y-2 text-center text-sm text-text-tertiary">
          <p>
            Privy handles the login UI, and the access token is exchanged for your tenant session.
          </p>
          <p>Connected user: {user?.email?.address ?? 'not signed in'}</p>
        </div>

        <div className="text-center text-xs text-text-tertiary">
          <p>Encrypted tenant session • Privy-backed authentication</p>
          <p>Your data is isolated per tenant after the callback verifies your access token</p>
        </div>
      </div>
    </div>
  );
};

export default PrivySignin;
