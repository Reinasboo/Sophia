'use client';

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  Search,
  Loader2,
  Sparkles,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';
import { PageLayout } from '@/components';
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
              <span className="text-sm font-medium text-white">Intent</span>
              <span
                className={cn('text-xs px-2 py-0.5 rounded font-medium capitalize', statusColors)}
              >
                {intent.status}
              </span>
            </div>
            <p className="text-xs text-white/50 truncate font-mono">{intent.intentId}</p>
          </div>

          <div className="text-right">
            <p className="text-sm text-white/60">{new Date(intent.createdAt).toLocaleString()}</p>
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
            className="border-t border-white/10 pt-4"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">Intent ID</p>
                  <code className="text-xs text-white/78 bg-white/10 rounded-xl px-2 py-1 block font-mono break-all">
                    {intent.intentId}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">Created</p>
                  <p className="text-sm text-white/78">
                    {new Date(intent.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {intent.params && Object.keys(intent.params).length > 0 && (
                <div>
                  <p className="text-xs text-white/60 font-medium mb-2 uppercase tracking-wider">Parameters</p>
                  <div className="bg-white/10 rounded-xl p-3 text-xs">
                    <pre className="text-white/78 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(intent.params, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {intent.result && Object.keys(intent.result).length > 0 && (
                <div>
                  <p className="text-xs text-white/60 font-medium mb-2 uppercase tracking-wider">Result</p>
                  <div className="bg-white/10 rounded-xl p-3 text-xs">
                    <pre className="text-white/78 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(intent.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {intent.error && (
                <div>
                  <p className="text-xs text-white/60 font-medium mb-2 uppercase tracking-wider">Error</p>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs">
                    <p className="text-red-300">{intent.error}</p>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-white/10 flex items-center gap-2 flex-wrap">
                <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-cyan-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </button>
                {intent.status === 'executed' && (
                  <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:text-cyan-300 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
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

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

      <PageLayout title="Intent History" subtitle="Track all agent intent executions">
        <div className="space-y-6">
            {!loading && !error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3"
              >
                {[
                  { label: 'Total', value: stats.total, icon: TrendingUp, color: 'text-cyan-400' },
                  {
                    label: 'Executed',
                    value: stats.executed,
                    icon: CheckCircle2,
                    color: 'text-emerald-400',
                  },
                  {
                    label: 'Rejected',
                    value: stats.rejected,
                    icon: XCircle,
                    color: 'text-red-400',
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                <input
                  type="text"
                  placeholder="Search intents…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-cyan-400/30 bg-white/5 px-4 py-2.5 text-sm font-semibold text-cyan-100 placeholder:text-white/40 transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-cyan-400/30 bg-white/5 px-3 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 cursor-pointer"
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
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
                        setExpandedIntent(
                          expandedIntent === intent.intentId ? null : intent.intentId
                        )
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
