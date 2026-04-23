'use client';

/**
 * Agent Detail Page
 *
 * Detailed view of a single agent with transactions and activity.
 */

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Play,
  Square,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { Sidebar, Header, TransactionList, ActivityFeed, AgentSettingsPanel } from '@/components';
import { useAgent } from '@/lib/hooks';
import * as api from '@/lib/api';
import {
  cn,
  formatSol,
  truncateAddress,
  formatTimestamp,
  getStatusBadgeClass,
  getStrategyDisplayName,
  getStrategyDescription,
  copyToClipboard,
} from '@/lib/utils';

export default function AgentDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data, loading, error, refetch } = useAgent(id as string | null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStart = async () => {
    if (!data?.agent.id) return;
    setActionLoading(true);
    await api.startAgent(data.agent.id);
    setActionLoading(false);
    refetch();
  };

  const handleStop = async () => {
    if (!data?.agent.id) return;
    setActionLoading(true);
    await api.stopAgent(data.agent.id);
    setActionLoading(false);
    refetch();
  };

  const handleCopy = async () => {
    if (!data?.agent.walletPublicKey) return;
    const success = await copyToClipboard(data.agent.walletPublicKey);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Sidebar />
        <div className="ml-60">
          <Header title="Agent Details" />
          <main className="px-8 lg:px-12 py-8">
            <div className="animate-pulse space-y-6">
              <div className="h-6 w-24 bg-slate-800/30 rounded-lg" />
              <div className="bg-slate-800/20 border border-slate-700/50 rounded-lg p-6">
                <div className="h-20 bg-slate-800/30 rounded-lg" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Sidebar />
        <div className="ml-60">
          <Header title="Agent Details" />
          <main className="px-8 lg:px-12 py-8">
            <div className="bg-slate-800/20 border border-slate-700/50 rounded-lg p-8 text-center backdrop-blur-sm">
              <p className="text-red-300 mb-4">{error || 'Agent not found'}</p>
              <Link
                href="/agents"
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30"
              >
                Back to Agents
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const { agent, balance, tokenBalances, transactions, events } = data;
  const isRunning = agent.status !== 'stopped';

  return (
    <>
      <Head>
        <title>{agent.name} | Agentic Wallet System</title>
      </Head>

      <div className="min-h-screen bg-background">
        <Sidebar />

        <div className="ml-60">
          <Header title={agent.name} subtitle={getStrategyDisplayName(agent.strategy)} />

          <main className="px-8 lg:px-12 py-8 space-y-8">
            {/* Back link */}
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-50 transition-colors duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Agents
            </Link>

            {/* Agent Header Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-6 transition-colors duration-200"
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Bot className="w-7 h-7 text-cyan-400" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-slate-50">{agent.name}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                      {getStrategyDisplayName(agent.strategy)} ·{' '}
                      {getStrategyDescription(agent.strategy)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                      getStatusBadgeClass(agent.status)
                    )}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        agent.status === 'idle'
                          ? 'bg-slate-400'
                          : agent.status === 'thinking'
                            ? 'bg-yellow-400'
                            : agent.status === 'executing'
                              ? 'bg-blue-400'
                              : agent.status === 'waiting'
                                ? 'bg-cyan-400'
                                : agent.status === 'error'
                                  ? 'bg-red-400'
                                  : 'bg-slate-400'
                      )}
                    />
                    {agent.status}
                  </span>

                  {isRunning ? (
                    <button
                      onClick={handleStop}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={handleStart}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg transition-all inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      <Play className="w-4 h-4" />
                      Start
                    </button>
                  )}

                  <button
                    onClick={refetch}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-slate-700/40 transition-colors duration-200"
                    title="Refresh"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Error message */}
              {agent.errorMessage && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-300">{agent.errorMessage}</p>
                </div>
              )}
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Wallet Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-sm text-slate-400">Wallet</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-50">
                    {agent.walletPublicKey ? truncateAddress(agent.walletPublicKey, 8, 6) : 'N/A'}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-md hover:bg-slate-700/40 transition-colors duration-200"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                  <a
                    href={`https://explorer.solana.com/address/${agent.walletPublicKey}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md hover:bg-slate-700/40 transition-colors duration-200"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-500" />
                  </a>
                </div>
              </motion.div>

              {/* Balance Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <span className="text-cyan-400 font-semibold">◎</span>
                  </div>
                  <span className="text-sm text-slate-400">Balance</span>
                </div>
                <div className="text-2xl font-semibold text-slate-50">
                  {formatSol(balance ?? 0)} SOL
                </div>
              </motion.div>

              {/* Activity Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-sm text-slate-400">Transactions</span>
                </div>
                <div className="text-2xl font-semibold text-slate-50">
                  {(transactions ?? []).length}
                </div>
                {agent.lastActionAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Last action: {formatTimestamp(agent.lastActionAt)}
                  </p>
                )}
              </motion.div>
            </div>

            {/* Agent Settings Panel */}
            <AgentSettingsPanel agent={agent} onUpdated={refetch} />

            {/* Token Balances */}
            {(tokenBalances ?? []).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
              >
                <h3 className="text-base font-medium text-slate-50 mb-4">Token Balances</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(tokenBalances ?? []).map((token) => (
                    <div
                      key={token.mint}
                      className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50"
                    >
                      <div className="text-xs text-slate-500 mb-1">
                        {truncateAddress(token.mint, 4, 4)}
                      </div>
                      <div className="font-mono text-slate-50">{token.uiAmount}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Transactions */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="xl:col-span-2"
              >
                <h3 className="text-base font-medium text-slate-50 mb-4">Transaction History</h3>
                <TransactionList transactions={transactions ?? []} />
              </motion.div>

              {/* Activity */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="xl:col-span-1"
              >
                <ActivityFeed events={events} maxItems={10} />
              </motion.div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
