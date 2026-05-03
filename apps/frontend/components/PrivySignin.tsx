/**
 * Privy Signin Component - Phase 1 (Placeholder)
 * Brand-compliant: Uses magenta (#ff0080) and cyan (#00d9ff)
 */
import React from 'react';

interface PrivySigninProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const PrivySignin: React.FC<PrivySigninProps> = ({ onSuccess }) => {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/privy-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: email }),
      });

      if (!response.ok) throw new Error('Sign up failed');

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Sign up failed');

      const { tenantId } = result;
      localStorage.setItem('sophia_tenant_id', tenantId);

      // Let parent handle navigation
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Agentic Wallet</h1>
        <p className="text-text-secondary">Autonomous DeFi Agent Infrastructure</p>
      </div>

      <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 space-y-6">
        <form onSubmit={handleEmailSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
              className="w-full px-4 py-2 bg-surface-muted border border-surface-muted rounded-lg text-white placeholder-text-tertiary focus:outline-none focus:border-secondary disabled:opacity-50 transition-colors"
            />
          </div>
          {error && <div className="text-sm text-status-error">{error}</div>}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full px-4 py-2 bg-primary hover:bg-primary-600 text-black font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? 'Signing up...' : 'Sign Up with Email'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-muted" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-surface-elevated text-text-tertiary">or</span>
          </div>
        </div>

        <div className="space-y-2 opacity-50 pointer-events-none">
          <button disabled className="w-full px-4 py-2 bg-surface-muted border border-surface-muted text-text-tertiary font-medium rounded-lg cursor-not-allowed">
            SMS (Phase 2)
          </button>
          <button disabled className="w-full px-4 py-2 bg-surface-muted border border-surface-muted text-text-tertiary font-medium rounded-lg cursor-not-allowed">
            Wallet Connection (Phase 2)
          </button>
          <button disabled className="w-full px-4 py-2 bg-surface-muted border border-surface-muted text-text-tertiary font-medium rounded-lg cursor-not-allowed">
            Social Login (Phase 2)
          </button>
        </div>

        <div className="text-center text-xs text-text-tertiary">
          <p>🔒 SOC 2 Type II Compliant • Enterprise Security</p>
          <p>Your data is encrypted and isolated per tenant</p>
        </div>
      </div>
    </div>
  );
};

export default PrivySignin;
