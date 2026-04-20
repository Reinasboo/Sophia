'use client';

import Head from 'next/head';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  ChevronRight,
  Shield,
  Activity,
  Plug,
  Zap,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Sidebar, Header } from '@/components';
import { useConnectedAgents } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { ExternalAgent } from '@/lib/types';

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  active: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    label: 'Active',
  },
  registered: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    label: 'Registered',
  },
  inactive: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    label: 'Inactive',
  },
  revoked: {
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    border: 'border-red-500/30',
    label: 'Revoked',
  },
};

interface AgentRowProps {
  agent: ExternalAgent & { lastSeen?: string };
  onSelect: (agent: ExternalAgent) => void;
  onRevoke: (agent: ExternalAgent) => void;
}

function AgentRow({ agent, onSelect, onRevoke }: AgentRowProps) {
  const status = statusConfig[agent.status] || statusConfig.inactive;
  const lastSeen = agent.lastSeen
    ? new Date(agent.lastSeen).toLocaleString()
    : 'Never';

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="hover:bg-slate-800/30 transition-colors border-b border-slate-700/50"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-3 h-3 rounded-full flex-shrink-0',
              (agent.status === 'active')
                ? 'bg-cyan-500'
                : (agent.status === 'inactive')
                  ? 'bg-red-500'
                  : 'bg-blue-500'
            )}
          />
          <div className="min-w-0">
            <p className="font-medium text-slate-50 truncate">
              {agent.name}
            </p>
            <p className="text-xs text-slate-500 font-mono truncate">
              {agent.id}
            </p>
          </div>
        </div>
      </td>

      <td className="px-6 py-4">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
            status.bg,
            status.text,
            status.border
          )}
        >
          <Activity className="w-3 h-3" />
          {status.label}
        </span>
      </td>

      <td className="px-6 py-4 text-sm text-slate-300">{agent.type}</td>

      <td className="px-6 py-4">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">{lastSeen}</span>
        </div>
      </td>

      <td className="px-6 py-4">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => onSelect(agent)}
            className="text-slate-400 hover:text-cyan-300 transition-colors p-1 hover:bg-slate-700/50 rounded"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRevoke(agent)}
            className="text-slate-400 hover:text-red-300 transition-colors p-1 hover:bg-slate-700/50 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

export default function ConnectedAgentsPage() {
  const { agents, loading, error, refresh, revoke } = useConnectedAgents();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<ExternalAgent | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState<ExternalAgent | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const filteredAgents = useMemo(() => {
    if (!agents) return [];

    let result = [...agents];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (agent: ExternalAgent) =>
          agent.name.toLowerCase().includes(q) ||
          agent.id.toLowerCase().includes(q) ||
          agent.type.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((agent: ExternalAgent) => agent.status === statusFilter);
    }

    return result;
  }, [agents, search, statusFilter]);

  const stats = useMemo(() => {
    if (!agents) return { total: 0, active: 0, registered: 0, suspended: 0 };

    return {
      total: agents.length,
      active: agents.filter((a: ExternalAgent) => a.status === 'active').length,
      registered: agents.filter((a: ExternalAgent) => a.status === 'registered').length,
      inactive: agents.filter((a: ExternalAgent) => a.status === 'inactive').length,
    };
  }, [agents]);

  const handleRevoke = async () => {
    if (!showRevokeModal) return;

    setIsRevoking(true);
    setRevokeError(null);
    try {
      await revoke(showRevokeModal.id);
      setShowRevokeModal(null);
      setSelectedAgent(null);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke agent';
      setRevokeError(message);
      console.error('Failed to revoke agent', err);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <>
      <Head>
        <title>Connected Agents | Sophia</title>
      </Head>

      <div className="flex min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header
            title="Connected Agents"
            subtitle="Manage external agents and integrations"
          />

          <main className="px-8 lg:px-12 pb-12 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ staggerChildren: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-slate-700/50 hover:border-cyan-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Total Agents</p>
                <p className="text-2xl font-bold text-cyan-300">{stats.total}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-blue-500/10 to-transparent border border-slate-700/50 hover:border-blue-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Active</p>
                <p className="text-2xl font-bold text-blue-300">{stats.active}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-blue-500/10 to-transparent border border-slate-700/50 hover:border-blue-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Registered</p>
                <p className="text-2xl font-bold text-blue-300">{stats.registered}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-red-500/10 to-transparent border border-slate-700/50 hover:border-red-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Suspended</p>
                <p className="text-2xl font-bold text-red-300">{stats.suspended}</p>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 flex-wrap"
            >
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search agentsâ€¦"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-4 py-2.5 text-sm transition-all backdrop-blur-sm"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-50 rounded-lg px-3 py-2.5 text-sm transition-all backdrop-blur-sm cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="error">Error</option>
              </select>

              <button
                onClick={() => refresh()}
                disabled={loading}
                className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                Refresh
              </button>

              <Link
                href="/byoa-register"
                className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30"
              >
                <Plus className="w-4 h-4" />
                Connect Agent
              </Link>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-cyan-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading agentsâ€¦</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
                {error}
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-16 bg-gradient-brand-subtle border border-surface-muted rounded-lg">
                <Plug className="w-12 h-12 mx-auto text-slate-500 mb-4 opacity-50" />
                <p className="text-slate-400 mb-2">No agents connected</p>
                <p className="text-sm text-slate-500 mb-4">
                  Get started by registering a new agent
                </p>
                <Link
                  href="/byoa-register"
                  className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30"
                >
                  <Plus className="w-4 h-4" />
                  Connect Your First Agent
                </Link>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 overflow-hidden transition-colors duration-200"
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-800/50 border-b border-slate-700/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Agent
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Last Seen
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <AnimatePresence mode="popLayout">
                        {filteredAgents.map((agent: any) => (
                          <AgentRow
                            key={agent.id}
                            agent={agent}
                            onSelect={(a) => setSelectedAgent(a)}
                            onRevoke={(a) => setShowRevokeModal(a)}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {selectedAgent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedAgent(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 max-w-md w-full backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-50">
                {selectedAgent.name}
              </h3>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
              >
                âœ•
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                  Agent ID
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-slate-300 font-mono flex-1 break-all">
                    {selectedAgent.id}
                  </code>
                  <button className="text-slate-400 hover:text-cyan-300 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                  Type
                </p>
                <p className="text-sm text-slate-300">{selectedAgent.type}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                  Status
                </p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                    statusConfig[selectedAgent.status].bg,
                    statusConfig[selectedAgent.status].text,
                    statusConfig[selectedAgent.status].border
                  )}
                >
                  <Activity className="w-3 h-3" />
                  {statusConfig[selectedAgent.status].label}
                </span>
              </div>

              {selectedAgent.lastActiveAt && (
                <div>
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                    Last Active
                  </p>
                  <p className="text-sm text-slate-300">
                    {new Date(selectedAgent.lastActiveAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setSelectedAgent(null)}
                className="flex-1 bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 rounded-lg px-4 py-2.5 transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowRevokeModal(selectedAgent);
                  setSelectedAgent(null);
                }}
                className="flex-1 bg-red-500/10 border border-red-500/30 hover:border-red-500/50 text-red-300 hover:text-red-200 rounded-lg px-4 py-2.5 transition-all"
              >
                Revoke Access
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showRevokeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowRevokeModal(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 max-w-sm w-full backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/30 mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-300" />
            </div>

            <h3 className="text-lg font-bold text-slate-50 text-center mb-2">
              Revoke Agent Access?
            </h3>

            <p className="text-sm text-slate-400 text-center mb-6">
              Are you sure you want to revoke access for{' '}
              <span className="font-medium text-slate-50">
                {showRevokeModal.name}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRevokeModal(null)}
                disabled={isRevoking}
                className="flex-1 bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={isRevoking}
                className="flex-1 bg-red-500/10 border border-red-500/30 hover:border-red-500/50 text-red-300 hover:text-red-200 rounded-lg px-4 py-2.5 transition-all disabled:opacity-50 font-medium"
              >
                {isRevoking ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
