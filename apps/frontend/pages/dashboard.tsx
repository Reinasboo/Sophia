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
import {
  Plus,
  LogOut,
  Home,
  TrendingUp,
  ArrowRightLeft,
  Layers,
  Plug,
  UserPlus,
  ScrollText,
} from 'lucide-react';
import { PageLayout, StatsCards, AgentList, ActivityFeed, CreateAgentModal } from '@/components';
import { useAgents, useStats, useEvents } from '@/lib/hooks';

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { agents, refetch } = useAgents();
  const { stats } = useStats();
  const { events } = useEvents(10);
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

      <PageLayout title="Overview" subtitle="System status, agents, and recent activity">
        <div className="space-y-8">
            {/* Stats Cards */}
            <section>
              <div className="grid md:grid-cols-4 gap-6">
                {!stats ? (
                  <>
                    <div className="bg-gradient-brand-subtle rounded-lg border border-surface-muted p-6 animate-pulse">
                      <div className="h-4 bg-surface-muted rounded w-3/4 mb-4" />
                      <div className="h-8 bg-surface-muted rounded w-1/2" />
                    </div>
                  </>
                ) : (
                  [
                    {
                      label: 'Active Agents',
                      value: stats.activeAgents?.toString() || '0',
                      change: 'Running now',
                    },
                    {
                      label: 'Total Transactions',
                      value: stats.totalTransactions?.toString() || '0',
                      change: 'All time',
                    },
                    {
                      label: 'Network Status',
                      value: stats.networkStatus === 'healthy' ? 'Healthy' : 'Warning',
                      change: 'Real-time',
                    },
                    {
                      label: 'Sol Managed',
                      value: (stats.totalSolManaged || 0).toFixed(2),
                      change: 'Total',
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200"
                    >
                      <p className="text-sm text-text-tertiary font-mono uppercase tracking-wider">
                        {stat.label}
                      </p>
                      <p className="text-4xl font-bold text-white mt-3">{stat.value}</p>
                      <p className="text-xs text-secondary mt-3 font-mono">{stat.change}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Agents List */}
              <section className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Active Agents</h2>
                  <span className="text-sm text-text-tertiary font-mono">
                    {agents.length || 0} agents
                  </span>
                </div>
                {agents.length === 0 ? (
                  <div className="bg-surface-elevated rounded-lg border border-surface-muted p-8 text-center">
                    <p className="text-text-tertiary">No agents created yet</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="mt-4 px-4 py-2 rounded-lg bg-primary hover:bg-primary-600 font-bold text-sm text-black transition-all"
                    >
                      Create First Agent
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => router.push(`/agents/${agent.id}`)}
                        className="w-full bg-surface-elevated rounded-lg border border-surface-muted hover:border-secondary/50 p-4 transition-all duration-200 group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-bold text-white group-hover:text-primary transition-colors duration-150">
                              {agent.name}
                            </p>
                            <p className="text-sm text-text-tertiary mt-2 font-mono">
                              Strategy: {agent.strategy || 'Unknown'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  agent.status === 'executing'
                                    ? 'bg-status-success'
                                    : agent.status === 'error'
                                      ? 'bg-status-error'
                                      : agent.status === 'waiting'
                                        ? 'bg-yellow-500'
                                        : 'bg-gray-500'
                                }`}
                              />
                              <span className="text-sm text-text-tertiary font-mono">
                                {agent.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Activity Feed */}
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                  <p className="text-sm text-text-tertiary mt-1 font-mono">Last 24 hours</p>
                </div>
                {events.length === 0 ? (
                  <div className="bg-surface-elevated border border-surface-muted rounded-lg p-6 text-center">
                    <p className="text-text-tertiary text-sm">No activity yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event, i) => {
                      let displayText = 'System event';
                      if (event.type === 'agent_created') {
                        displayText = `Agent created: ${event.agent?.name || 'Unknown'}`;
                      } else if (event.type === 'agent_status_changed') {
                        displayText = `Agent status: ${event.newStatus}`;
                      } else if (event.type === 'agent_action') {
                        displayText = `Agent action: ${event.action}`;
                      } else if (event.type === 'transaction') {
                        displayText = `Transaction: ${event.transaction?.type || 'Unknown'} (${event.transaction?.status || 'pending'})`;
                      } else if (event.type === 'balance_changed') {
                        displayText = `Balance changed: ${event.previousBalance} → ${event.newBalance}`;
                      } else if (event.type === 'system_error') {
                        displayText = `Error: ${event.error}`;
                      }

                      return (
                        <div
                          key={i}
                          className="bg-surface-elevated border border-surface-muted rounded-lg p-3 text-sm hover:border-secondary/30 transition-colors duration-200"
                        >
                          <p className="text-text-secondary">{displayText}</p>
                          <p className="text-xs text-text-muted mt-2 font-mono">
                            {event.timestamp
                              ? new Date(event.timestamp).toLocaleTimeString()
                              : 'Just now'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
        </div>
      </PageLayout>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refetch}
      />
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  href,
  router,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  router?: any;
}) {
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
