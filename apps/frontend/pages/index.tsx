import Head from 'next/head';
import { useRouter } from 'next/router';
import { ArrowRight, Zap, BarChart3, Code2, Lock, Rocket } from 'lucide-react';
import { useState, useEffect } from 'react';

const AnimatedCounter = ({ end, duration = 2000 }: { end: number; duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    const animateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = (timestamp - startTime) / duration;
      if (progress < 1) {
        setCount(Math.floor(end * progress));
        requestAnimationFrame(animateCount);
      } else {
        setCount(end);
      }
    };
    requestAnimationFrame(animateCount);
  }, [end, duration]);

  return <>{count}</>;
};

export default function Home() {
  const router = useRouter();

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
        <nav className="sticky top-0 z-50 bg-black/95 backdrop-blur-sm border-b border-surface-elevated">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg px-2 py-1"
              onClick={() => router.push('/')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push('/')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-brand-accent flex items-center justify-center font-bold text-base text-black group-hover:shadow-lg group-hover:shadow-primary/50 transition-shadow duration-200">
                Ⓢ
              </div>
              <span className="text-lg font-bold text-white group-hover:text-primary transition-colors duration-200">
                Sophia
              </span>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-600 font-bold text-sm text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95"
            >
              Enter Dashboard
            </button>
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
                Deploy AI agents that execute transactions, manage portfolios, and build wealth—<span className="text-secondary font-semibold">24/7 with institutional security</span>. No human oversight required.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => router.push('/dashboard')}
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
                <div className="text-4xl font-bold text-primary">
                  <AnimatedCounter end={110} />
                </div>
                <div className="text-sm text-text-tertiary mt-2 font-mono">Tests Passing</div>
              </div>
              <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 hover:border-secondary/50 transition-colors duration-200 text-center">
                <div className="text-4xl font-bold text-primary">4</div>
                <div className="text-sm text-text-tertiary mt-2 font-mono">Agent Strategies</div>
              </div>
              <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 hover:border-secondary/50 transition-colors duration-200 text-center">
                <div className="text-4xl font-bold text-primary">
                  <AnimatedCounter end={11} />
                </div>
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
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">High-Speed Execution</h3>
                    <p className="text-text-tertiary">Execute transactions instantly with sub-second confirmation across Solana network.</p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Military-Grade Security</h3>
                    <p className="text-text-tertiary">Encrypted keys, policy enforcement, and audit trails for complete control.</p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-status-success/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-6 h-6 text-status-success" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Portfolio Management</h3>
                    <p className="text-text-tertiary">Automated distribution, balance guards, and intelligent strategy orchestration.</p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Rocket className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Deploy in Minutes</h3>
                    <p className="text-text-tertiary">Pre-built agent templates and one-click deployment for rapid scaling.</p>
                  </div>
                </div>
              </div>

              {/* Feature 5 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center flex-shrink-0">
                    <Code2 className="w-6 h-6 text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Developer API</h3>
                    <p className="text-text-tertiary">Powerful REST & WebSocket APIs for custom integrations and workflows.</p>
                  </div>
                </div>
              </div>

              {/* Feature 6 */}
              <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-status-info/20 flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-6 h-6 text-status-info" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg">Real-Time Monitoring</h3>
                    <p className="text-text-tertiary">Live dashboard with transaction history, alerts, and detailed analytics.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Footer */}
        <section className="py-24 px-6 lg:px-8 bg-gradient-brand-accent-dark border-t border-surface-muted">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Ready to deploy intelligent agents?
            </h2>
            <p className="text-lg text-text-secondary">
              Build autonomous wealth management systems on Solana. Start for free, scale to billions.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-8 py-4 rounded-lg bg-primary hover:bg-primary-600 font-bold text-base text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95 inline-flex items-center gap-3"
            >
              Start Now
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

