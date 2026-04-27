'use client';

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  Search,
  Loader2,
} from 'lucide-react';
import { Sidebar, Header } from '@/components';
import { useIntentHistory } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { IntentHistoryRecord } from '@/lib/types';

interface IntentRowProps {
  intent: IntentHistoryRecord;
  isExpanded: boolean;
  onToggle: () => void;
}

function IntentRow({ intent, isExpanded, onToggle }: IntentRowProps) {
  const statusColors =
    intent.status === 'executed'
      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
      : 'bg-red-500/10 text-red-300 border border-red-500/30';

  const Icon = intent.status === 'executed' ? CheckCircle2 : XCircle;

  return (
    <motion.div
      layout
      className="border border-slate-700/30 rounded-lg overflow-hidden bg-slate-900/20 backdrop-blur-sm hover:border-cyan-500/30 transition-colors"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-slate-800/50">
            <Icon className="w-5 h-5 text-cyan-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-slate-50">Intent</span>
              <span className={cn('text-xs px-2 py-0.5 rounded font-medium capitalize', statusColors)}>
                {intent.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate font-mono">{intent.intentId}</p>
          </div>

          <div className="text-right">
            <p className="text-sm text-slate-400">{new Date(intent.createdAt).toLocaleString()}</p>
          </div>
        </div>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-2 text-slate-400"
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
            className="border-t border-slate-700/30 bg-slate-800/30 px-4 py-4"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Intent ID</p>
                  <code className="text-xs text-slate-300 bg-slate-700/50 rounded px-2 py-1 block font-mono break-all">
                    {intent.intentId}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Created</p>
                  <p className="text-sm text-slate-300">
                    {new Date(intent.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {intent.params && Object.keys(intent.params).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Parameters</p>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-xs">
                    <pre className="text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(intent.params, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {intent.result && Object.keys(intent.result).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Result</p>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-xs">
                    <pre className="text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(intent.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {intent.error && (
                <div>
                  <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Error</p>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs">
                    <p className="text-red-300">{intent.error}</p>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-700/30 flex items-center gap-2 flex-wrap">
                <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:text-cyan-300 bg-slate-800/50 hover:bg-slate-700 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </button>
                {intent.status === 'executed' && (
                  <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:text-cyan-300 bg-slate-800/50 hover:bg-slate-700 rounded transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Details
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function IntentHistoryPage() {
  const { intents, loading, error, refetch } = useIntentHistory();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedIntent, setExpandedIntent] = useState<string | null>(null);

  const filteredIntents = useMemo(() => {
    let result = [...(intents || [])];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((intent) => intent.intentId.toLowerCase().includes(q));
    }

    if (statusFilter !== 'all') {
      result = result.filter((intent) => intent.status === statusFilter);
    }

    result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return result;
  }, [intents, search, statusFilter]);

  const stats = useMemo(() => {
    const total = intents?.length || 0;
    const executed = (intents || []).filter((i) => i.status === 'executed').length;
    const rejected = (intents || []).filter((i) => i.status === 'rejected').length;

    return { total, executed, rejected };
  }, [intents]);

  return (
    <>
      <Head>
        <title>Intent History | Sophia Agentic Wallet</title>
      </Head>

      <div className="flex min-h-screen bg-black">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header title="Intent History" subtitle="Track all agent intent executions" />

          <main className="px-8 lg:px-12 pb-12 space-y-6">
            {!loading && !error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3"
              >
                {[
                  { label: 'Total', value: stats.total, icon: TrendingUp, color: 'text-cyan-400' },
                  { label: 'Executed', value: stats.executed, icon: CheckCircle2, color: 'text-emerald-400' },
                  { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-400' },
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-gradient-to-br from-slate-800/50 to-transparent border border-slate-700/50 rounded-lg p-4 backdrop-blur-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                          <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
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
                  placeholder="Search intents…"
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
                <option value="executed">Executed</option>
                <option value="rejected">Rejected</option>
              </select>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto text-cyan-400 animate-spin mb-4" />
                  <p className="text-slate-400">Loading intent history…</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
                <p className="font-medium">Error loading intent history</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            ) : filteredIntents.length === 0 ? (
              <div className="text-center py-16">
                <HelpCircle className="w-12 h-12 mx-auto text-slate-500 mb-4 opacity-50" />
                <p className="text-slate-400 mb-2">No intents found</p>
                <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3"
              >
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">
                  Showing {filteredIntents.length} of {intents?.length || 0} intents
                </p>

                <AnimatePresence mode="popLayout">
                  {filteredIntents.map((intent) => (
                    <IntentRow
                      key={intent.intentId}
                      intent={intent}
                      isExpanded={expandedIntent === intent.intentId}
                      onToggle={() =>
                        setExpandedIntent(expandedIntent === intent.intentId ? null : intent.intentId)
                      }
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
