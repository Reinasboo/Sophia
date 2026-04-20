'use client';

/**
 * Dashboard Page
 *
 * Premium dashboard with professional design system.
 * Designed for autonomous agent orchestration.
 */

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuthProtected } from '@/lib/useAuthProtected';
import { Plus, LogOut, Home, TrendingUp, ArrowRightLeft, Layers, Plug, UserPlus, ScrollText } from 'lucide-react';
import {
  Sidebar,
  Header,
  StatsCards,
  AgentList,
  ActivityFeed,
  CreateAgentModal,
} from '@/components';
import { useAgents } from '@/lib/hooks';

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { refetch } = useAgents();
  const { isLoading, isAuthenticated } = useAuthProtected();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-brand-accent flex items-center justify-center font-bold text-base text-black mx-auto animate-pulse">
            Ⓢ
          </div>
          <p className="text-text-secondary">Loading Sophia...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Dashboard | Sophia</title>
      </Head>

      <div className="flex min-h-screen bg-black">
        {/* Premium Sidebar */}
        <div className="fixed left-0 top-0 h-full w-60 bg-surface-elevated border-r border-surface-muted flex flex-col z-40">
          {/* Logo */}
          <div className="p-6 border-b border-surface-muted">
            <div className="flex items-center gap-3 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-lg px-2 py-1" onClick={() => router.push('/')}>
              <div className="w-10 h-10 rounded-lg bg-gradient-brand-accent flex items-center justify-center font-bold text-base text-black group-hover:shadow-lg group-hover:shadow-primary/50 transition-shadow duration-200">
                Ⓢ
              </div>
              <span className="font-bold text-lg text-white group-hover:text-primary transition-colors duration-200">
                Sophia
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-6 space-y-3 overflow-y-auto">
            <NavItem 
              icon={<Home className="w-5 h-5" />} 
              label="Overview" 
              href="/dashboard"
              router={router}
              active={router.pathname === '/dashboard'}
            />
            <NavItem 
              icon={<TrendingUp className="w-5 h-5" />} 
              label="Agents"
              href="/agents"
              router={router}
              active={router.pathname === '/agents'}
            />
            <NavItem 
              icon={<Plug className="w-5 h-5" />} 
              label="Connected Agents"
              href="/connected-agents"
              router={router}
              active={router.pathname === '/connected-agents'}
            />
            <NavItem 
              icon={<UserPlus className="w-5 h-5" />} 
              label="Register BYOA"
              href="/byoa-register"
              router={router}
              active={router.pathname === '/byoa-register'}
            />
            <NavItem 
              icon={<Layers className="w-5 h-5" />} 
              label="Strategies"
              href="/strategies"
              router={router}
              active={router.pathname === '/strategies'}
            />
            <NavItem 
              icon={<ScrollText className="w-5 h-5" />} 
              label="Intent History"
              href="/intent-history"
              router={router}
              active={router.pathname === '/intent-history'}
            />
            <NavItem 
              icon={<ArrowRightLeft className="w-5 h-5" />} 
              label="Transactions"
              href="/transactions"
              router={router}
              active={router.pathname === '/transactions'}
            />
          </nav>

          {/* Logout */}
          <div className="p-6 border-t border-surface-muted">
            <button
              onClick={() => router.push('/')}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-muted transition-all text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <LogOut className="w-4 h-4" />
              Exit Dashboard
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 ml-60 flex flex-col">
          {/* Premium Header */}
          <header className="border-b border-surface-muted bg-surface-secondary backdrop-blur-sm sticky top-0 z-30">
            <div className="px-8 lg:px-12 py-6 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white">Overview</h1>
                <p className="text-sm text-text-secondary mt-1">Monitor your autonomous agents in real-time</p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-600 font-bold text-sm text-black transition-all duration-200 transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Agent
              </button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 px-8 lg:px-12 py-8 lg:py-12 overflow-y-auto space-y-8">
            {/* Stats Cards */}
            <section>
              <div className="grid md:grid-cols-4 gap-6">
                {[
                  { label: 'Active Agents', value: '4', change: '+2 this week' },
                  { label: 'Total Volume', value: '$2.4M', change: '+12% this month' },
                  { label: 'Policies Enforced', value: '156', change: 'All compliant' },
                  { label: 'Avg Gas Saved', value: '34%', change: 'vs manual ops' },
                ].map((stat, i) => (
                  <div key={i} className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200">
                    <p className="text-sm text-text-tertiary font-mono uppercase tracking-wider">{stat.label}</p>
                    <p className="text-4xl font-bold text-white mt-3">{stat.value}</p>
                    <p className="text-xs text-secondary mt-3 font-mono">{stat.change}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Agents List */}
              <section className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Active Agents</h2>
                  <span className="text-sm text-text-tertiary font-mono">4 agents running</span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: 'DeFi Arbitrage Bot', status: 'running', tvl: '$1.2M', apr: '24%' },
                    { name: 'Yield Optimizer', status: 'running', tvl: '$890K', apr: '18%' },
                    { name: 'Market Maker', status: 'running', tvl: '$456K', apr: '12%' },
                    { name: 'Treasury Manager', status: 'running', tvl: '$854K', apr: '16%' },
                  ].map((agent, i) => (
                    <button
                      key={i}
                      className="w-full bg-surface-elevated rounded-lg border border-surface-muted hover:border-secondary/50 p-4 transition-all duration-200 group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-white group-hover:text-primary transition-colors duration-150">
                            {agent.name}
                          </p>
                          <p className="text-sm text-text-tertiary mt-2 font-mono">TVL: {agent.tvl} • APR: {agent.apr}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-status-success" />
                            <span className="text-sm text-text-tertiary font-mono">{agent.status}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Activity Feed */}
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                  <p className="text-sm text-text-tertiary mt-1 font-mono">Last 24 hours</p>
                </div>
                <div className="space-y-2">
                  {[
                    { type: 'txn', msg: 'Swap 100 SOL → USDC', time: '2 min ago' },
                    { type: 'policy', msg: 'Budget reset (daily)', time: '1 hour ago' },
                    { type: 'txn', msg: 'Deposit to Raydium', time: '3 hours ago' },
                    { type: 'alert', msg: 'Daily cap near limit', time: '5 hours ago' },
                    { type: 'txn', msg: 'Compound yield farming', time: '8 hours ago' },
                  ].map((item, i) => (
                    <div key={i} className="bg-surface-elevated border border-surface-muted rounded-lg p-3 text-sm hover:border-secondary/30 transition-colors duration-200">
                      <p className="text-text-secondary">{item.msg}</p>
                      <p className="text-xs text-text-muted mt-2 font-mono">{item.time}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refetch}
      />
    </>
  );
}

function NavItem({ icon, label, active, href, router }: { icon: React.ReactNode; label: string; active?: boolean; href?: string; router?: any }) {
  return (
    <button
      onClick={() => href && router?.push(href)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
        active
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
