'use client';

/**
 * Transactions Page - Dark Cyan Theme (matching landing page)
 *
 * Full transaction history across all agents with:
 * - Advanced filtering and search
 * - Rich transaction details modal
 * - Real-time status updates
 * - Export capabilities
 * - Transaction analytics
 */

import Head from 'next/head';
import { useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  FileDown,
  Copy,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar, Header } from '@/components';
import { useTransactions } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  signature: string;
  type: 'transfer' | 'airdrop' | 'swap' | 'stake' | 'custom';
  status: 'confirmed' | 'finalized' | 'pending' | 'submitted' | 'failed';
  amount: string;
  symbol: string;
  recipient?: string;
  sender?: string;
  timestamp: string;
  fee?: string;
  agentName?: string;
  description?: string;
}

export default function TransactionsPage() {
  const { transactions, loading, refetch } = useTransactions();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Type icons
  const typeIcons: Record<string, React.ElementType> = {
    transfer: ArrowUpRight,
    airdrop: TrendingUp,
    swap: ArrowDownLeft,
    stake: ArrowDownLeft,
    custom: HelpCircle,
  };

  // Status colors - dark theme with cyan/blue
  const statusColors: Record<string, string> = {
    confirmed: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
    finalized: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
    pending: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30',
    submitted: 'bg-slate-500/10 text-slate-300 border border-slate-500/30',
    failed: 'bg-red-500/10 text-red-300 border border-red-500/30',
  };

  // Type labels
  const typeLabels: Record<string, string> = {
    transfer: 'Transfer',
    airdrop: 'Airdrop',
    swap: 'Swap',
    stake: 'Stake',
    custom: 'Custom',
  };

  // Filter and sort transactions
  const filteredTxs = useMemo(() => {
    let result = [...(transactions || [])].map(
      (tx) =>
        ({
          ...tx,
          symbol: (tx as any).symbol || 'SOL',
          timestamp: (tx as any).timestamp || tx.createdAt,
          sender: (tx as any).sender,
          agentName: (tx as any).agentName,
          fee: (tx as any).fee,
        }) as any
    );

    // Search filter - check signature, recipient, sender
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx: any) =>
          tx.signature?.toLowerCase().includes(q) ||
          tx.recipient?.toLowerCase().includes(q) ||
          tx.sender?.toLowerCase().includes(q) ||
          tx.agentName?.toLowerCase().includes(q)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((tx: any) => tx.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((tx: any) => tx.status === statusFilter);
    }

    // Sort by newest first
    result.sort(
      (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return result;
  }, [transactions, search, typeFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = transactions?.length || 0;
    const finalized = (transactions || []).filter((tx: any) => tx.status === 'finalized').length;
    const pending = (transactions || []).filter((tx: any) =>
      ['pending', 'submitted'].includes(tx.status)
    ).length;
    const failed = (transactions || []).filter((tx: any) => tx.status === 'failed').length;
    const volume = (transactions || []).reduce(
      (sum: number, tx: any) => sum + parseFloat(tx.amount || '0'),
      0
    );

    return { total, finalized, pending, failed, volume };
  }, [transactions]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const error = null;

  return (
    <>
      <Head>
        <title>Transactions | Sophia Agentic Wallet</title>
      </Head>

      <div className="flex min-h-screen bg-black">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header title="Transactions" subtitle="Monitor and audit all wallet transactions" />

          <main className="px-8 lg:px-12 pb-12 space-y-6">
            {/* Analytics Row */}
            {!loading && !error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3"
              >
                {[
                  {
                    label: 'Total',
                    value: stats.total,
                    icon: TrendingUp,
                    color: 'text-secondary',
                    bgColor: 'from-secondary/10 to-transparent',
                  },
                  {
                    label: 'Finalized',
                    value: stats.finalized,
                    icon: CheckCircle2,
                    color: 'text-status-success',
                    bgColor: 'from-status-success/10 to-transparent',
                  },
                  {
                    label: 'Pending',
                    value: stats.pending,
                    icon: Clock,
                    color: 'text-status-warning',
                    bgColor: 'from-status-warning/10 to-transparent',
                  },
                  {
                    label: 'Failed',
                    value: stats.failed,
                    icon: AlertCircle,
                    color: 'text-status-error',
                    bgColor: 'from-status-error/10 to-transparent',
                  },
                  {
                    label: 'Volume',
                    value: `${stats.volume.toFixed(2)}`,
                    icon: TrendingUp,
                    color: 'text-primary',
                    unit: 'SOL',
                    bgColor: 'from-primary/10 to-transparent',
                  },
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn(
                        'bg-gradient-to-br',
                        stat.bgColor,
                        'border border-primary/20 hover:border-secondary/50 rounded-lg p-4 backdrop-blur-sm transition-all hover:bg-surface-elevated/50'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn('w-5 h-5', stat.color)} />
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider">
                            {stat.label}
                          </p>
                          <p className={cn('text-lg font-bold', stat.color)}>
                            {stat.value}
                            {stat.unit ? ` ${stat.unit}` : ''}
                          </p>
                        </div>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search by signature, recipient, agent…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-surface-elevated/50 border border-primary/20 hover:border-secondary/30 focus:border-secondary text-white placeholder:text-text-secondary rounded-lg px-4 py-2.5 text-sm transition-all backdrop-blur-sm"
                  />
                </div>

                {/* Filters */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-surface-elevated/50 border border-primary/20 hover:border-secondary/30 text-white rounded-lg px-3 py-2.5 text-sm transition-all backdrop-blur-sm cursor-pointer"
                >
                  <option value="all">All Types</option>
                  <option value="transfer">Transfers</option>
                  <option value="airdrop">Airdrops</option>
                  <option value="swap">Swaps</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface-elevated/50 border border-primary/20 hover:border-secondary/30 text-white rounded-lg px-3 py-2.5 text-sm transition-all backdrop-blur-sm cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="finalized">Finalized</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>

                {/* Refresh & Export */}
                <button
                  onClick={refetch}
                  disabled={loading}
                  className="bg-surface-elevated/50 border border-primary/20 hover:border-secondary/30 text-text-secondary hover:text-secondary rounded-lg px-3 py-2.5 transition-all backdrop-blur-sm inline-flex items-center gap-2"
                >
                  <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </button>

                <button className="bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 hover:border-primary/50 text-primary rounded-lg px-4 py-2.5 transition-all backdrop-blur-sm inline-flex items-center gap-2 hover:bg-primary/30">
                  <FileDown className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              <p className="text-xs text-slate-500 uppercase tracking-wider">
                Showing {filteredTxs.length} of {stats.total} transactions
              </p>
            </motion.div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-cyan-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading transactions…</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
                {error}
              </div>
            ) : filteredTxs.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 mb-2">No transactions found</p>
                <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {filteredTxs.map((tx: Transaction, idx: number) => {
                  const TypeIcon = typeIcons[tx.type];

                  return (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-gradient-brand-subtle rounded-lg border border-surface-muted hover:border-secondary/50 p-4 transition-colors duration-200 group"
                      onClick={() => setSelectedTx(tx)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Type Icon */}
                          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-all">
                            <TypeIcon className="w-5 h-5 text-cyan-400" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="text-sm font-semibold text-slate-50">
                                {typeLabels[tx.type]}
                              </h4>
                              <span
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded font-medium',
                                  statusColors[tx.status]
                                )}
                              >
                                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                              </span>
                              {tx.agentName && (
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 font-mono">
                                  {tx.agentName}
                                </span>
                              )}
                            </div>

                            {/* Details */}
                            <div className="text-xs text-slate-400 space-y-1">
                              <div className="flex items-center gap-2">
                                <span>
                                  {tx.recipient
                                    ? `To: ${tx.recipient.slice(0, 8)}…`
                                    : tx.sender
                                      ? `From: ${tx.sender.slice(0, 8)}…`
                                      : 'No recipient'}
                                </span>
                              </div>
                              <div className="text-slate-500">
                                {new Date(tx.timestamp).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Side - Amount & Actions */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-50">
                              {tx.amount} {tx.symbol}
                            </p>
                            {tx.fee && <p className="text-xs text-slate-500">Fee: {tx.fee}</p>}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTx(tx);
                            }}
                            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-cyan-400 opacity-0 group-hover:opacity-100"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedTx(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-50">Transaction Details</h3>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Signature */}
                <div>
                  <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Signature</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-cyan-300 font-mono bg-slate-900/50 rounded px-2 py-1 flex-1 truncate">
                      {selectedTx.signature}
                    </code>
                    <button
                      onClick={() => handleCopy(selectedTx.signature)}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-cyan-300"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Type & Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Type</p>
                    <p className="text-sm text-slate-50 font-semibold">
                      {typeLabels[selectedTx.type]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Status</p>
                    <span
                      className={cn(
                        'text-xs px-2 py-1 rounded inline-block font-medium',
                        statusColors[selectedTx.status]
                      )}
                    >
                      {selectedTx.status.charAt(0).toUpperCase() + selectedTx.status.slice(1)}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Amount</p>
                  <p className="text-sm font-semibold text-slate-50">
                    {selectedTx.amount} {selectedTx.symbol}
                  </p>
                </div>

                {/* Recipient/Sender */}
                {(selectedTx.recipient || selectedTx.sender) && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                      {selectedTx.recipient ? 'Recipient' : 'Sender'}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-cyan-300 font-mono bg-slate-900/50 rounded px-2 py-1 flex-1 truncate">
                        {selectedTx.recipient || selectedTx.sender}
                      </code>
                      <button
                        onClick={() => handleCopy(selectedTx.recipient || selectedTx.sender || '')}
                        className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-cyan-300"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div>
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Timestamp</p>
                  <p className="text-xs text-slate-50 font-mono">
                    {new Date(selectedTx.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Fee */}
                {selectedTx.fee && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Fee</p>
                    <p className="text-sm text-slate-50">{selectedTx.fee}</p>
                  </div>
                )}

                {/* Agent */}
                {selectedTx.agentName && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Agent</p>
                    <p className="text-sm text-slate-50">{selectedTx.agentName}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button className="flex-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 transition-all inline-flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  View on Explorer
                </button>
                <button
                  onClick={() => handleCopy(JSON.stringify(selectedTx, null, 2))}
                  className="bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 rounded-lg px-3 py-2.5 transition-all inline-flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
