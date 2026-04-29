import Head from 'next/head';
import { useRouter } from 'next/router';
import { ArrowRight, Shield, Zap, BarChart3, Code2, Lock, Rocket, LogIn, X } from 'lucide-react';
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

  const handleGetStarted = () => {
    router.push('/');
  };

  const handleLoginClick = () => {
    setIsShowingAuth(true);
  };

  const handleSignupClick = () => {
    setIsShowingAuth(true);
  };

  const handleAuthSuccess = () => {
    setIsShowingAuth(false);
    router.push('/agents');
  };

  return (
    <>
      <Head>
        <title>Sophia | Autonomous Wallet for Solana Agents</title>
        <meta
          name="description"
          content="Enterprise-grade wallet orchestration for autonomous AI agents on Solana. Pay once, agent for life."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-lg">
                Ⓢ
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Sophia
              </span>
            </div>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <button
                  onClick={handleGetStarted}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 font-semibold transition-all duration-300 transform hover:scale-105"
                >
                  Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={handleLoginClick}
                    className="px-6 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 font-semibold transition-all duration-300 flex items-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    Login
                  </button>
                  <button
                    onClick={handleSignupClick}
                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 font-semibold transition-all duration-300 transform hover:scale-105"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="pt-32 pb-20 px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700 text-sm text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Now Live on Solana Devnet
            </div>

            {/* Main Heading */}
            <div className="space-y-6">
              <h1 className="text-6xl lg:text-7xl font-black leading-tight">
                <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-500 bg-clip-text text-transparent">
                  Meet Sophia
                </span>
              </h1>
              <p className="text-xl lg:text-2xl text-slate-300 max-w-3xl mx-auto">
                The autonomous wallet ecosystem where AI agents execute transactions, manage
                finances, and build wealth on Solana—with zero human intervention required.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <button
                onClick={handleGetStarted}
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 font-bold text-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-2 group"
              >
                Get Started Now
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="px-8 py-4 rounded-lg border-2 border-slate-700 hover:border-slate-600 hover:bg-slate-800/50 font-semibold text-lg transition-all duration-300">
                View Docs
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-16 max-w-2xl mx-auto">
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                <div className="text-3xl font-bold text-cyan-400">110</div>
                <div className="text-sm text-slate-400">Tests Passing</div>
              </div>
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                <div className="text-3xl font-bold text-cyan-400">4</div>
                <div className="text-sm text-slate-400">Agent Strategies</div>
              </div>
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
                <div className="text-3xl font-bold text-cyan-400">11</div>
                <div className="text-sm text-slate-400">Intent Types</div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="py-20 px-6 lg:px-8 bg-slate-900/50 border-t border-slate-800">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold">Autonomous. Secure. Unstoppable.</h2>
              <p className="text-slate-400 text-lg">
                Everything an autonomous agent needs to operate independently
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <Zap className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">100% Autonomous</h3>
                <p className="text-slate-400">
                  Agents execute transactions, manage portfolios, and interact with any Solana
                  program—no human required.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <Shield className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Enterprise Security</h3>
                <p className="text-slate-400">
                  AES-256-GCM encryption, scrypt key derivation, and isolated signing—your funds are
                  untouchable.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <Code2 className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Bring Your Own Agent</h3>
                <p className="text-slate-400">
                  Register any external AI agent via REST API. We handle the crypto, you focus on
                  the intelligence.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <Lock className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Policy Engine</h3>
                <p className="text-slate-400">
                  Set spending caps, daily budgets, cooldowns, and allowlists. Agents stay within
                  guardrails—always.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <BarChart3 className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Real-Time Dashboard</h3>
                <p className="text-slate-400">
                  Live agent activity, transaction history, policy monitoring, and WebSocket-powered
                  updates.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300">
                <Rocket className="w-12 h-12 text-cyan-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Scale to Infinity</h3>
                <p className="text-slate-400">
                  Built for 1 agent or 10,000. Horizontal scaling, batched txs, and optimized policy
                  validation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section className="py-20 px-6 lg:px-8">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold">Built for the Autonomous Economy</h2>
              <p className="text-slate-400 text-lg">
                From DeFi strategies to supply chain optimization
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Use Case 1 */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700 rounded-xl p-8">
                <h3 className="text-2xl font-bold mb-3">DeFi Trading Bots</h3>
                <p className="text-slate-300 mb-4">
                  Deploy agents that execute market-making strategies, arbitrage, and yield
                  farming—24/7 with zero downtime.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li>✓ Raydium, Orca, Jupiter integration</li>
                  <li>✓ Real-time price monitoring</li>
                  <li>✓ Automated position management</li>
                </ul>
              </div>

              {/* Use Case 2 */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700 rounded-xl p-8">
                <h3 className="text-2xl font-bold mb-3">API Monetization</h3>
                <p className="text-slate-300 mb-4">
                  Services earn per-call via x402 payment protocol. Agents pay only for what they
                  use, instantly.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li>✓ Per-request pricing</li>
                  <li>✓ Micropayment channels</li>
                  <li>✓ Automated billing</li>
                </ul>
              </div>

              {/* Use Case 3 */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700 rounded-xl p-8">
                <h3 className="text-2xl font-bold mb-3">Autonomous Treasury</h3>
                <p className="text-slate-300 mb-4">
                  DAOs deploy agents to manage funds, vote on proposals, and execute multi-sig
                  transactions.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li>✓ Multi-agent orchestration</li>
                  <li>✓ Hierarchical budgets</li>
                  <li>✓ Policy escalation</li>
                </ul>
              </div>

              {/* Use Case 4 */}
              <div className="bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700 rounded-xl p-8">
                <h3 className="text-2xl font-bold mb-3">Agent Reputation System</h3>
                <p className="text-slate-300 mb-4">
                  On-chain reputation scores unlock lending, insurance, and collateral-free access
                  to capital.
                </p>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li>✓ Reputation oracles</li>
                  <li>✓ Underwritten loans</li>
                  <li>✓ Insurance pools</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Technical Deep Dive */}
        <section className="py-20 px-6 lg:px-8 bg-slate-900/50 border-t border-slate-800">
          <div className="max-w-7xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold">How Sophia Works</h2>
              <p className="text-slate-400 text-lg">
                Enterprise-grade architecture, designed for autonomy
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Architecture Step 1 */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-lg">
                    1
                  </div>
                  <h3 className="text-xl font-bold">Agent Registration</h3>
                </div>
                <p className="text-slate-300 ml-16">
                  Register your AI agent (Claude, GPT-4, or custom) via our REST API. Get instant
                  access to Solana wallet capabilities.
                </p>
              </div>

              {/* Architecture Step 2 */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                  <h3 className="text-xl font-bold">Policy Definition</h3>
                </div>
                <p className="text-slate-300 ml-16">
                  Define spending limits, allowlists, and execution rules. Sophia enforces policies
                  at every transaction.
                </p>
              </div>

              {/* Architecture Step 3 */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-lg">
                    3
                  </div>
                  <h3 className="text-xl font-bold">Intent Emission</h3>
                </div>
                <p className="text-slate-300 ml-16">
                  Agents emit high-level intents (e.g., "swap 100 SOL for USDC"). Sophia validates
                  and executes safely.
                </p>
              </div>

              {/* Architecture Step 4 */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-lg">
                    4
                  </div>
                  <h3 className="text-xl font-bold">On-Chain Settlement</h3>
                </div>
                <p className="text-slate-300 ml-16">
                  Transactions are built, signed, and submitted to Solana. Settlement is instant and
                  immutable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6 lg:px-8">
          <div className="max-w-4xl mx-auto bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/50 rounded-2xl p-12 text-center space-y-8">
            <h2 className="text-4xl font-bold">Ready to Deploy Your Autonomous Agent?</h2>
            <p className="text-xl text-slate-300">
              Join the autonomous economy. Agents earn, agents grow, agents build wealth. No human
              required.
            </p>
            <button
              onClick={handleGetStarted}
              className="px-10 py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 font-bold text-lg transition-all duration-300 transform hover:scale-105 inline-flex items-center gap-2 group"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800 bg-slate-950 py-8 px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center text-slate-400">
            <p>
              © 2026 Sophia. Built for the autonomous economy on Solana.{' '}
              <a
                href="https://github.com/Reinasboo/Sophia"
                className="text-cyan-400 hover:text-cyan-300"
              >
                Open Source
              </a>
            </p>
          </div>
        </footer>

        {/* Auth Modal */}
        {isShowingAuth && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full mx-4">
              <button
                onClick={() => setIsShowingAuth(false)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
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
