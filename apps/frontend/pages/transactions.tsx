'use client';

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  HelpCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  Search,
  Loader2,
} from 'lucide-react';
import { PageLayout } from '@/components';
import { useTransactions } from '@/lib/hooks';
import { useAuthProtected } from '@/lib/useAuthProtected';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/lib/types';

interface TransactionRowProps {
  transaction: Transaction;
  isExpanded: boolean;
  onToggle: () => void;
}

function TransactionRow({ transaction, isExpanded, onToggle }: TransactionRowProps) {
  const typeIcons: Record<string, React.ElementType> = {
    transfer: ArrowUpRight,
    airdrop: TrendingUp,
    swap: ArrowDownLeft,
    stake: ArrowDownLeft,
    custom: HelpCircle,
  };

  const statusColors: Record<string, string> = {
    confirmed: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
    finalized: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
    pending: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/30',
    submitted: 'bg-slate-500/10 text-slate-300 border border-slate-500/30',
    failed: 'bg-red-500/10 text-red-300 border border-red-500/30',
  };

  const Icon = typeIcons[transaction.type as keyof typeof typeIcons] || HelpCircle;
  const statusClass = statusColors[transaction.status as keyof typeof statusColors];

  return (
    <motion.div
      layout
      className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] backdrop-blur-xl p-4 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.08]"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="p-2 rounded-xl bg-white/10">
            <Icon className="w-5 h-5 text-cyan-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-slate-50 capitalize">
                {transaction.type || 'Transaction'}
              </span>
              <span className={cn('text-xs px-2 py-0.5 rounded font-medium', statusClass)}>
                {transaction.status}
              </span>
            </div>
            <p className="text-xs text-white/50 truncate">{transaction.signature || 'Pending'}</p>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-white">
              {transaction.amount ? parseFloat(transaction.amount as any).toFixed(2) : '0'} SOL
            </p>
          </div>
        </div>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-2 text-white/45"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/10 bg-transparent px-4 py-4"
          >
            <div className="space-y-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">
                  Signature
                </p>
                <code className="text-xs text-white/78 bg-white/10 rounded-xl px-2 py-1 block font-mono break-all">
                  {transaction.signature || '—'}
                </code>
              </div>
              <div>
                <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">
                  Status
                </p>
                <p className="text-sm text-white/78 capitalize">{transaction.status}</p>
              </div>

              {transaction.recipient && (
                <div className="lg:col-span-2">
                  <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">
                    Recipient
                  </p>
                  <code className="text-xs text-white/78 bg-white/10 rounded-xl px-2 py-1 block font-mono break-all">
                    {transaction.recipient}
                  </code>
                </div>
              )}
              {transaction.createdAt && (
                <div>
                  <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">
                    Created
                  </p>
                  <p className="text-sm text-white/78">
                    {new Date(transaction.createdAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-white/10 flex items-center gap-2 flex-wrap">
              <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-cyan-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <Copy className="w-3.5 h-3.5" />
                Copy Signature
              </button>
              {transaction.signature && (
                <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-cyan-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  View on Explorer
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function TransactionsPage() {
  const { transactions, loading, error, refetch } = useTransactions();
  const { isLoading: authLoading, isAuthenticated } = useAuthProtected();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <PageLayout title="Transactions" subtitle="Monitor and audit all wallet transactions">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </PageLayout>
    );
  }

  // Redirect handled by useAuthProtected hook
  if (!isAuthenticated) {
    return null;
  }

  const filteredTxs = useMemo(() => {
    let result = [...(transactions || [])];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.signature?.toLowerCase().includes(q) ||
          tx.recipient?.toLowerCase().includes(q) ||
          tx.type?.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter((tx) => tx.type === typeFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter((tx) => tx.status === statusFilter);
    }

    result.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return result;
  }, [transactions, search, typeFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = transactions?.length || 0;
    const finalized = (transactions || []).filter((tx) => tx.status === 'finalized').length;
    const pending = (transactions || []).filter((tx) =>
      ['pending', 'submitted', 'confirmed'].includes(tx.status)
    ).length;
    const failed = (transactions || []).filter((tx) => tx.status === 'failed').length;
    const volume = (transactions || []).reduce(
      (sum, tx) => sum + parseFloat((tx.amount as any) || '0'),
      0
    );

    return { total, finalized, pending, failed, volume };
  }, [transactions]);

  return (
    <>
      <Head>
        <title>Transactions | Sophia Agentic Wallet</title>
      </Head>

      <PageLayout title="Transactions" subtitle="Monitor and audit all wallet transactions">
        <div className="space-y-6">
          {!loading && !error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3"
            >
              {[
                { label: 'Total', value: stats.total, icon: TrendingUp, color: 'text-cyan-400' },
                {
                  label: 'Finalized',
                  value: stats.finalized,
                  icon: CheckCircle2,
                  color: 'text-emerald-400',
                },
                { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-400' },
                {
                  label: 'Failed',
                  value: stats.failed,
                  icon: AlertCircle,
                  color: 'text-red-400',
                },
                {
                  label: 'Volume (SOL)',
                  value: stats.volume.toFixed(2),
                  icon: TrendingUp,
                  color: 'text-blue-400',
                },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-white/60 font-medium uppercase tracking-wider mb-1">
                          {stat.label}
                        </p>
                        <p className={cn('text-xl font-bold', stat.color)}>{stat.value}</p>
                      </div>
                      <Icon className={cn('w-5 h-5', stat.color, 'opacity-50')} />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 flex-wrap"
          >
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search transactions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-2.5 text-sm font-semibold text-cyan-100 placeholder:text-white/40 transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-cyan-400/30 bg-white/5 px-3 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="transfer">Transfer</option>
              <option value="airdrop">Airdrop</option>
              <option value="swap">Swap</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-cyan-400/30 bg-white/5 px-3 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="finalized">Finalized</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto text-cyan-400 animate-spin mb-4" />
                <p className="text-slate-400">Loading transactions…</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 backdrop-blur-sm">
              <p className="font-medium">Error loading transactions</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : filteredTxs.length === 0 ? (
            <div className="text-center py-16">
              <HelpCircle className="w-12 h-12 mx-auto text-white/45 mb-4 opacity-50" />
              <p className="text-white/60 mb-2">No transactions found</p>
              <p className="text-sm text-white/50">Try adjusting your search or filters</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-xs text-white/50 font-medium uppercase tracking-wider mb-4">
                Showing {filteredTxs.length} of {transactions?.length || 0} transactions
              </p>

              <AnimatePresence mode="popLayout">
                {filteredTxs.map((tx, idx) => (
                  <TransactionRow
                    key={`${tx.signature || 'pending'}-${idx}`}
                    transaction={tx}
                    isExpanded={expandedTx === tx.signature}
                    onToggle={() =>
                      setExpandedTx(expandedTx === tx.signature ? null : tx.signature || null)
                    }
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </PageLayout>
    </>
  );
}
