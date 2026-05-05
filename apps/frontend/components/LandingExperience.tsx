import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Boxes,
  ChevronRight,
  Cpu,
  Gauge,
  Shield,
  Sparkles,
  Waves,
  Wallet,
  Workflow,
} from 'lucide-react';
import { PrivySignin } from './PrivySignin';
import { usePrivy } from '@privy-io/react-auth';
import { BrandMark } from './BrandMark';

const stats = [
  { label: 'Built-in strategies', value: '4' },
  { label: 'Intent types', value: '15+' },
  { label: 'Tx audited', value: '100%' },
  { label: 'Network', value: 'Mainnet' },
];

const pillars = [
  {
    icon: Bot,
    title: 'Register external agents',
    description:
      'Bring your own AI agents via REST API. We handle Solana execution, signing, and confirmation. You focus on the logic.',
  },
  {
    icon: Wallet,
    title: 'Isolated encryption',
    description:
      'Private keys stay in the wallet layer. Agents never touch them. Signer is isolated from the runtime.',
  },
  {
    icon: Shield,
    title: 'Policy guardrails',
    description:
      'Set spending limits, daily budgets, cooldowns, and allowlists. Agents execute only what you authorize.',
  },
  {
    icon: BarChart3,
    title: 'Live dashboard',
    description:
      'Real-time agent activity, transaction history, performance metrics, and audit trails all in one place.',
  },
  {
    icon: Waves,
    title: 'Solana DeFi ready',
    description:
      'Swap routing via Jupiter, native staking, SOL wrapping, and fail-closed boundaries for unsupported flows.',
  },
  {
    icon: Cpu,
    title: 'Observable system',
    description:
      'Express API, WebSocket updates, indexed events, and telemetry built to be operated, not hidden.',
  },
];

const pipeline = [
  'Authenticate user or agent',
  'Bind wallet and tenant',
  'Validate and route intent',
  'Sign inside wallet layer',
  'Submit, confirm, index, and visualize',
];

const modules = [
  {
    title: 'BYOA console',
    body: 'Register external agents, manage bearer-token access, and control intent execution from one surface.',
  },
  {
    title: 'Monitoring layer',
    body: 'Live performance charts, websocket updates, cache visibility, and operational telemetry.',
  },
  {
    title: 'Execution engine',
    body: 'Build transactions, simulate, sign, submit, and confirm across Solana primitives and DeFi flows.',
  },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

export function LandingExperience() {
  const router = useRouter();
  const { authenticated } = usePrivy();

  const handleRegisterAgentClick = () => {
    if (!authenticated) {
      router.push('/landing#auth');
      return;
    }
    router.push('/byoa-register');
  };

  return (
    <>
      <Head>
        <title>Sophia | Autonomous Wallet Orchestration for Solana</title>
        <meta
          name="description"
          content="Sophia is a Solana-first autonomous wallet orchestration system with BYOA agent support, encrypted signing, indexed telemetry, and DeFi execution."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-black text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(0,217,255,0.16),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.02),_transparent_24%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)]" />

        <nav className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
            <BrandMark
              href="/"
              size="md"
              label="Sophia"
              sublabel="Autonomous control plane for Solana"
              className="rounded-xl px-2 py-1 transition-transform duration-200 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            />

            <div className="hidden items-center gap-3 md:flex">
              <button
                onClick={() => router.push('/landing#auth')}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Login / Register
              </button>
              <button
                onClick={handleRegisterAgentClick}
                className="rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Register Agent
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl bg-gradient-brand-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(37,99,235,0.22)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                Open Dashboard
              </button>
            </div>
          </div>
        </nav>

        <main className="relative mx-auto max-w-7xl px-6 pb-24 pt-16 lg:px-8 lg:pt-24">
          <section className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="space-y-8">
              <SectionLabel>Solana-first autonomy</SectionLabel>

              <div className="space-y-6">
                <h1 className="max-w-4xl text-5xl font-bold leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-8xl">
                  <span className="block">Deploy</span>
                  <span className="block bg-gradient-brand-accent bg-clip-text text-transparent">
                    autonomous
                  </span>
                  <span className="block">agents that execute.</span>
                </h1>

                <p className="max-w-2xl text-lg leading-8 text-white/72 sm:text-xl">
                  Operate AI agents that execute transactions, manage portfolios, and trade on
                  Solana with institutional-grade security. Bring external agents, set guardrails,
                  and watch your capital move 24/7 with full visibility.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <button
                  onClick={() => router.push('/landing#auth')}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-brand-accent px-6 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(37,99,235,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_0_55px_rgba(0,217,255,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  Login / Register
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={handleRegisterAgentClick}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-cyan-400/30 bg-white/5 px-6 py-4 text-base font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  Register New Agent
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-white/[0.07]"
                  >
                    <div className="text-3xl font-bold tracking-tight text-white">{stat.value}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.22em] text-white/45">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-brand-accent/20 blur-3xl" />
              <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                      Live stack
                    </div>
                    <div className="mt-2 text-lg font-semibold">Autonomous execution pipeline</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Healthy
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">Wallet</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">Encrypted signing</div>
                        <div className="text-sm text-white/60">Wallet layer owns the keys</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">Agent</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="rounded-xl bg-fuchsia-400/10 p-2 text-fuchsia-300">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">BYOA routing</div>
                        <div className="text-sm text-white/60">External agent intake</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">Data</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-300">
                        <Gauge className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">Indexed events</div>
                        <div className="text-sm text-white/60">Timeline and history ready</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">DeFi</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300">
                        <Waves className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">Execution boundary</div>
                        <div className="text-sm text-white/60">Real paths, no fake success</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
                    <Workflow className="h-4 w-4" />
                    Pipeline
                  </div>
                  <div className="mt-4 space-y-3">
                    {pipeline.map((step, index) => (
                      <div key={step} className="flex items-center gap-3 text-sm text-white/78">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-cyan-200">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 space-y-8">
            <SectionLabel>Core capabilities</SectionLabel>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    className="group rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.08]"
                  >
                    <div className="flex items-start gap-4">
                      <div className="rounded-2xl border border-white/10 bg-black/35 p-3 text-cyan-300 shadow-[0_0_28px_rgba(0,217,255,0.12)]">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{pillar.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-white/65">{pillar.description}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-24 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[1.8rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.03] p-8 backdrop-blur-2xl">
              <SectionLabel>Operator workflow</SectionLabel>
              <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                Agents execute. You control and observe.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-white/68">
                Register your agent, set policies, and watch it execute transactions autonomously.
                Every decision is audited, every transaction is confirmed, and you have full
                visibility and override control.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  'Register agents (internal or external)',
                  'Define spending policies and guardrails',
                  'Monitor live execution and transaction history',
                  'Audit every decision and override when needed',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-white/78">
                    <div className="h-2.5 w-2.5 rounded-full bg-gradient-brand-accent shadow-[0_0_12px_rgba(0,217,255,0.45)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              id="auth"
              className="rounded-[1.8rem] border border-white/10 bg-black/30 p-8 backdrop-blur-2xl scroll-mt-24"
            >
              <SectionLabel>Login / Register</SectionLabel>
              <div className="mt-5">
                <PrivySignin onSuccess={() => router.push('/dashboard')} />
              </div>
            </div>
          </section>

          <section className="mt-24 rounded-[1.8rem] border border-white/10 bg-black/30 p-8 backdrop-blur-2xl">
            <SectionLabel>System architecture</SectionLabel>
            <div className="mt-6 grid gap-4">
              {modules.map((module, index) => (
                <div
                  key={module.title}
                  className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-accent text-sm font-bold text-black">
                    0{index + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{module.title}</h3>
                    <p className="mt-1 text-sm leading-7 text-white/62">{module.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-24 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-brand-accent-dark p-8 shadow-[0_0_70px_rgba(37,99,235,0.15)] sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
                  <Boxes className="h-3.5 w-3.5" />
                  Start operating now
                </div>
                <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                  Deploy autonomous agents. Control everything.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-8 text-white/78">
                  Register your first agent in minutes. Set guardrails. Watch it execute
                  transactions on Solana 24/7. Full visibility, instant override, complete audit
                  trail.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-base font-semibold text-black transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Manage Agents
                  <ArrowRight className="h-5 w-5" />
                </button>
                <a
                  href="https://github.com/Reinasboo/Sophia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/25 bg-black/15 px-6 py-4 text-base font-semibold text-white transition hover:border-white/50 hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  View Codebase
                  <ChevronRight className="h-5 w-5" />
                </a>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
