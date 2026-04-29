'use client';

/**
 * Agents Page - Premium Redesign
 *
 * Dashboard for all built-in and created agents with:
 * - Real-time statistics and health overview
 * - Advanced search and status filtering
 * - Rich agent cards with inline controls
 * - Create agent modal with guided setup
 * - Performance metrics and activity tracking
 */

import { useState, useMemo } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  TrendingUp,
  Activity,
  AlertCircle,
  Power,
  Settings,
  Eye,
  MoreVertical,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useAuthProtected } from '@/lib/useAuthProtected';
import { Sidebar, Header, CreateAgentModal, AgentCard } from '@/components';
import { useAgents } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { Agent } from '@/lib/types';

export default function AgentsPage() {
  const { isLoading, isAuthenticated } = useAuthProtected();
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { agents, loading: agentsLoading, refetch } = useAgents();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const filteredAgents = useMemo(() => {
    return agents.filter((agent: Agent) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && agent.status !== 'stopped') ||
        (filter === 'stopped' && agent.status === 'stopped');

      const matchesSearch =
        search === '' || agent.name.toLowerCase().includes(search.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [agents, filter, search]);

  // Statistics
  const stats = useMemo(() => {
    const total = agents.length;
    const active = (agents as Agent[]).filter((a: Agent) => a.status !== 'stopped').length;
    const stopped = (agents as Agent[]).filter((a: Agent) => a.status === 'stopped').length;

    return { total, active, stopped };
  }, [agents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-lg bg-gradient-brand-accent flex items-center justify-center font-bold text-base mx-auto text-black"
          >
            Ⓢ
          </motion.div>
          <p className="text-text-secondary">Loading Sophia agents…</p>
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
        <title>Agents | Agentic Wallet</title>
      </Head>

      <div className="flex min-h-screen bg-black">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header title="Agents" subtitle="Manage your autonomous agents and monitor activity" />

          <main className="px-8 lg:px-12 pb-12 space-y-6">
            {/* Statistics Row */}
            {!agentsLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
              >
                {[
                  {
                    label: 'Total Agents',
                    value: stats.total,
                    icon: Zap,
                    color: 'text-primary',
                  },
                  {
                    label: 'Active',
                    value: stats.active,
                    icon: Activity,
                    color: 'text-status-success',
                  },
                  {
                    label: 'Stopped',
                    value: stats.stopped,
                    icon: Power,
                    color: 'text-text-muted',
                  },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-brand-subtle rounded-lg border border-surface-muted p-4 flex items-center gap-3 hover:border-secondary/50 transition-colors duration-200"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Icon className={cn('w-5 h-5', stat.color)} />
                      </div>
                      <div>
                        <p className="text-xs text-text-tertiary font-mono uppercase">
                          {stat.label}
                        </p>
                        <p className="text-lg font-bold text-white">{stat.value}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Controls */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search agents by name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-surface-elevated border border-surface-muted hover:border-secondary/50 focus:border-secondary text-white placeholder:text-text-muted rounded-lg px-4 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  />
                </div>

                {/* Filter */}
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-surface-elevated border border-surface-muted hover:border-secondary/50 text-white rounded-lg px-3 py-2 text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <option value="all">All Agents</option>
                  <option value="active">Active Only</option>
                  <option value="stopped">Stopped Only</option>
                </select>

                {/* Refresh */}
                <button
                  onClick={refetch}
                  disabled={agentsLoading}
                  className="px-4 py-2 text-sm font-medium bg-surface-elevated hover:bg-surface-muted border border-surface-muted text-text-secondary hover:text-text-secondary rounded-lg transition-all inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                >
                  <RefreshCw className={cn('w-4 h-4', agentsLoading && 'animate-spin')} />
                </button>

                {/* Create */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 hover:border-primary/50 text-primary rounded-lg transition-all inline-flex items-center gap-2 hover:bg-primary/30"
                >
                  <Plus className="w-4 h-4" />
                  New Agent
                </button>
              </div>

              <p className="text-xs text-text-secondary">
                {filteredAgents.length === agents.length
                  ? `${agents.length} agents`
                  : `${filteredAgents.length} of ${agents.length} agents`}
              </p>
            </motion.div>

            {/* Content */}
            {agentsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-surface-elevated border-t-primary mx-auto mb-4" />
                  <p className="text-text-secondary">Loading agents…</p>
                </div>
              </div>
            ) : filteredAgents.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16 bg-surface-elevated/50 border border-primary/20 rounded-xl backdrop-blur-sm"
              >
                {agents.length === 0 ? (
                  <>
                    <Zap className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" />
                    <p className="text-text-secondary mb-2">No agents yet</p>
                    <p className="text-xs text-text-muted mb-6">
                      Create your first agent to get started
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 hover:border-primary/50 text-primary rounded-lg transition-all inline-flex items-center gap-2 hover:bg-primary/30"
                    >
                      <Plus className="w-4 h-4" />
                      Create Agent
                    </button>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-12 h-12 mx-auto text-slate-500 mb-4 opacity-50" />
                    <p className="text-slate-400">No agents match your filters</p>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {filteredAgents.map((agent: Agent, idx: number) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <AgentCard agent={agent} onUpdate={refetch} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </main>
        </div>
      </div>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          refetch();
          setShowCreateModal(false);
        }}
      />
    </>
  );
}
