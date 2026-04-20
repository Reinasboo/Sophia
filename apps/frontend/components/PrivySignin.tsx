/**
 * Privy Signin Component - Phase 1 (Placeholder)
 *
 * ROADMAP:
 * - Phase 1 (Current): Type definitions + layout
 * - Phase 2 (May): Install @privy-io/react-auth + full OAuth2 integration
 * - Phase 3 (June): Passkey + social auth
 *
 * For now, shows the UI structure without Privy SDK dependency.
 */

import React from 'react';
import { useRouter } from 'next/router';

interface PrivySigninProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const PrivySignin: React.FC<PrivySigninProps> = ({ onSuccess }) => {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Phase 2: Replace with real Privy flow
      // For now, create a test tenant
      const response = await fetch('/api/auth/privy-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          provider: 'email',
        }),
      });

      if (!response.ok) {
        throw new Error('Sign up failed');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error('Sign up failed');
      }

      const { tenantId, apiKey } = data.data;
      localStorage.setItem('tenantId', tenantId);
      localStorage.setItem('apiKey', apiKey);

      onSuccess?.();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900/20 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Agentic Wallet</h1>
          <p className="text-slate-400">Autonomous DeFi Agent Infrastructure</p>
        </div>

        {/* Form */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-6">
          {/* Email Input */}
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Signing up...' : 'Sign Up with Email'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-900/50 text-slate-400">or</span>
            </div>
          </div>

          {/* Placeholder for Phase 2 auth methods */}
          <div className="space-y-2 opacity-50 pointer-events-none">
            <button
              disabled
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 font-medium rounded-lg cursor-not-allowed"
            >
              SMS (Phase 2)
            </button>
            <button
              disabled
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 font-medium rounded-lg cursor-not-allowed"
            >
              Wallet Connection (Phase 2)
            </button>
            <button
              disabled
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 font-medium rounded-lg cursor-not-allowed"
            >
              Social Login (Phase 2)
            </button>
          </div>

          {/* SOC 2 Message */}
          <div className="text-center text-xs text-slate-500">
            <p>🔒 SOC 2 Type II Compliant • Enterprise Security</p>
            <p>Your data is encrypted and isolated per tenant</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivySignin;
