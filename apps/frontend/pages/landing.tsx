import Head from 'next/head';
import { useRouter } from 'next/router';
import { ArrowRight, Zap, BarChart3, Code2, Lock, Rocket, LogIn, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PrivySignin } from '../components/PrivySignin';

export default function Landing() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isShowingAuth, setIsShowingAuth] = useState(false);

  useEffect(() => {
    const apiKey = localStorage.getItem('sophia_api_key');
    setIsAuthenticated(!!apiKey);
  }, []);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    setIsShowingAuth(false);
    router.push('/agents');
  };

  return (
    <>
      <Head>
        <title>Sophia | Autonomous Wallet Orchestration for Solana</title>
        <meta
          name="description"
          content="Enterprise-grade autonomous wallet orchestration on Solana. Deploy AI agents that execute transactions, manage portfolios, and build wealth 24/7."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Premium Dark Background - Pure Black with gradient brand accents */}
      <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
        {/* NAVIGATION */}
        <nav className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-surface-muted">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
            <div
              className="flex items-center gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg px-2 py-1"
              onClick={() => router.push('/landing')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push('/landing')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-brand-accent flex items-center justify-center font-bold text-base text-black group-hover:shadow-lg group-hover:shadow-primary/50 transition-shadow duration-200">
                Ⓢ
              </div>
              <span className="text-lg font-bold text-white group-hover:text-primary transition-colors duration-200">
                Sophia
              </span>
            </div>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <button
                  onClick={() => router.push('/agents')}
                  className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-600 font-bold text-sm text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
                >
                  Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setIsShowingAuth(true)}
                    className="px-6 py-2.5 rounded-lg border border-secondary hover:bg-surface-elevated/50 font-bold text-sm text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    <LogIn className="w-4 h-4 inline mr-2" />
                    Sign In
                  </button>
                  <button
                    onClick={() => setIsShowingAuth(true)}
                    className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-600 font-bold text-sm text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* HERO SECTION */}
        <section className="relative pt-20 pb-32 px-6 lg:px-8 overflow-hidden">
          {/* Subtle gradient background accent */}
          <div className="absolute inset-0 bg-gradient-brand-subtle opacity-50 pointer-events-none" />

          <div className="max-w-6xl mx-auto space-y-8 relative z-10">
            {/* Animated badge */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-elevated border border-secondary/30 text-sm text-secondary font-mono">
                <Zap className="w-4 h-4" />
                <span>Enterprise agents on Solana</span>
                <ArrowRight className="w-3 h-3 opacity-60" />
              </div>
            </div>

            {/* Hero Headline */}
            <div className="text-center space-y-6 max-w-5xl mx-auto">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
                <span className="block">Autonomous</span>
                <span className="block bg-gradient-brand-accent bg-clip-text text-transparent">
                  Wealth
                </span>
                <span className="block">for Solana</span>
              </h1>
              <p className="text-lg lg:text-xl text-text-secondary leading-relaxed">
                Deploy AI agents that execute transactions, manage portfolios, and build wealth—
                <span className="text-secondary font-semibold">
                  24/7 with institutional security
                </span>
                . No human oversight required.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setIsShowingAuth(true)}
                className="px-8 py-4 rounded-lg bg-primary hover:bg-primary-600 font-bold text-base text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95 flex items-center gap-3 group"
              >
                Start Building Now
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-150" />
              </button>
              <a
                href="https://github.com/Reinasboo/Sophia"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-lg border-2 border-secondary hover:bg-surface-elevated/50 font-bold text-base text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
              >
                View Codebase
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-16 max-w-3xl mx-auto">
              <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 hover:border-secondary/50 transition-colors duration-200 text-center">
                <div className="text-4xl font-bold text-primary">110</div>
                <div className="text-sm text-text-tertiary mt-2 font-mono">Tests Passing</div>
              </div>
              <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 hover:border-secondary/50 transition-colors duration-200 text-center">
                <div className="text-4xl font-bold text-primary">4</div>
                <div className="text-sm text-text-tertiary mt-2 font-mono">Agent Strategies</div>
              </div>
              <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 hover:border-secondary/50 transition-colors duration-200 text-center">
                <div className="text-4xl font-bold text-primary">11</div>
                <div className="text-sm text-text-tertiary mt-2 font-mono">Intent Types</div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES - Grid */}
        <section className="py-32 px-6 lg:px-8 border-t border-surface-muted">
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="text-center space-y-4">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                <span className="block">Enterprise-Grade</span>
                <span className="block bg-gradient-brand-accent bg-clip-text text-transparent">
                  Autonomy
                </span>
              </h2>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                Everything you need to run autonomous agents at scale with institutional-level security.
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">100% Autonomous</h3>
                    <p className="text-text-tertiary">
                      Agents execute transactions, manage portfolios, and interact with any Solana program—no human required.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Enterprise Security</h3>
                    <p className="text-text-tertiary">
                      AES-256-GCM encryption, scrypt key derivation, and isolated signing—your funds are untouchable.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-status-success/20 flex items-center justify-center flex-shrink-0">
                    <Code2 className="w-6 h-6 text-status-success" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Bring Your Own Agent</h3>
                    <p className="text-text-tertiary">
                      Register any external AI agent via REST API. We handle the crypto, you focus on the intelligence.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Policy Engine</h3>
                    <p className="text-text-tertiary">
                      Set spending caps, daily budgets, cooldowns, and allowlists. Agents stay within guardrails—always.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 5 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Real-Time Dashboard</h3>
                    <p className="text-text-tertiary">
                      Live agent activity, transaction history, policy monitoring, and WebSocket-powered updates.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 6 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-status-success/20 flex items-center justify-center flex-shrink-0">
                    <Rocket className="w-6 h-6 text-status-success" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Scale to Infinity</h3>
                    <p className="text-text-tertiary">
                      Built for 1 agent or 10,000. Horizontal scaling, batched txs, and optimized policy validation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="py-20 px-6 lg:px-8">
          <div className="max-w-4xl mx-auto bg-gradient-brand-accent/10 border border-primary/50 rounded-2xl p-12 text-center space-y-8">
            <h2 className="text-4xl font-bold">Ready to Deploy Your Autonomous Agent?</h2>
            <p className="text-xl text-text-secondary">
              Join the autonomous economy. Agents earn, agents grow, agents build wealth. No human required.
            </p>
            <button
              onClick={() => setIsShowingAuth(true)}
              className="px-10 py-4 rounded-lg bg-primary hover:bg-primary-600 font-bold text-lg text-black transition-all duration-200 transform hover:scale-105 inline-flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-150" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-surface-muted bg-black py-8 px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center text-text-tertiary">
            <p>
              © 2026 Sophia. Built for the autonomous economy on Solana.{' '}
              <a
                href="https://github.com/Reinasboo/Sophia"
                className="text-secondary hover:text-secondary-bright transition-colors"
              >
                Open Source
              </a>
            </p>
          </div>
        </footer>

        {/* Auth Modal */}
        {isShowingAuth && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative bg-surface-elevated border border-surface-muted rounded-2xl shadow-2xl max-w-md w-full mx-4">
              <button
                onClick={() => setIsShowingAuth(false)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <X className="w-5 h-5 text-text-tertiary" />
              </button>
              <div className="p-8">
                <PrivySignin onSuccess={handleAuthSuccess} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
