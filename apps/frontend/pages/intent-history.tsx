'use client';

import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  ChevronDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Sidebar, Header } from '@/components';
import { useIntentHistory } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { IntentHistoryRecord } from '@/lib/types';

const statusColors: Record<
  string,
  { bg: string; text: string; border: string; icon: React.ElementType }
> = {
  executed: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    icon: CheckCircle2,
  },
  rejected: {
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    border: 'border-red-500/30',
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusColors[status] || statusColors.rejected;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        config.bg,
        config.text,
        config.border
      )}
    >
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface IntentRowProps {
  IntentHistoryRecord: IntentHistoryRecord;
  isExpanded: boolean;
  onToggle: () => void;
}

function IntentRow({ IntentHistoryRecord, isExpanded, onToggle }: IntentRowProps) {
  const statusConfig = statusColors[IntentHistoryRecord.status] || statusColors.rejected;
  const params = IntentHistoryRecord.params as Record<string, any>;

  return (
    <motion.div
      layout
      className="border border-slate-700/50 rounded-lg overflow-hidden hover:border-cyan-500/40 transition-all bg-slate-800/20"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-start gap-4 min-w-0 flex-1 text-left">
          <Zap className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-medium text-slate-50 truncate">{IntentHistoryRecord.type}</span>
              <StatusBadge status={IntentHistoryRecord.status} />
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>Agent: {IntentHistoryRecord.agentId.slice(0, 8)}</div>
              <div className="text-slate-500">
                {new Date(IntentHistoryRecord.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 ml-4"
        >
          <ChevronDown className="w-5 h-5 text-slate-500" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-700/50 bg-slate-900/30 px-6 py-4"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                    Intent ID
                  </p>
                  <code className="text-xs text-slate-300 bg-slate-800/50 rounded px-3 py-1.5 block font-mono break-all">
                    {IntentHistoryRecord.intentId}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-2">
                    Created
                  </p>
                  <p className="text-sm text-slate-300">
                    {new Date(IntentHistoryRecord.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {params && Object.keys(params).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">
                    Parameters
                  </p>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-xs">
                    <pre className="text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(params, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {IntentHistoryRecord.result && Object.keys(IntentHistoryRecord.result).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">
                    Result
                  </p>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-xs">
                    <pre className="text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(IntentHistoryRecord.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {IntentHistoryRecord.error && (
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-3">
                    Error
                  </p>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-xs">
                    <p className="text-red-300">{IntentHistoryRecord.error}</p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-700/50 flex items-center gap-2 flex-wrap">
                <button className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:text-cyan-300 bg-slate-800/50 hover:bg-slate-700 rounded transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </button>
                {IntentHistoryRecord.status === 'executed' && (
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
    if (!intents) return [];

    let result = [...intents];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (IntentHistoryRecord: IntentHistoryRecord) =>
          IntentHistoryRecord.intentId.toLowerCase().includes(q) ||
          IntentHistoryRecord.type.toLowerCase().includes(q) ||
          IntentHistoryRecord.agentId.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(
        (IntentHistoryRecord: IntentHistoryRecord) => IntentHistoryRecord.status === statusFilter
      );
    }

    return result;
  }, [intents, search, statusFilter]);

  const stats = useMemo(() => {
    if (!intents) return { total: 0, executed: 0, rejected: 0 };

    return {
      total: intents.length,
      executed: intents.filter((i: IntentHistoryRecord) => i.status === 'executed').length,
      rejected: intents.filter((i: IntentHistoryRecord) => i.status === 'rejected').length,
    };
  }, [intents]);

  return (
    <>
      <Head>
        <title>Intent History | Sophia</title>
      </Head>

      <div className="flex min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header
            title="Intent History"
            subtitle="Track execution of all intents and transactions"
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
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                  Total Intents
                </p>
                <p className="text-2xl font-bold text-cyan-300">{stats.total}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-blue-500/10 to-transparent border border-slate-700/50 hover:border-blue-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Executed</p>
                <p className="text-2xl font-bold text-blue-300">{stats.executed}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-red-500/10 to-transparent border border-slate-700/50 hover:border-red-500/40 rounded-lg px-6 py-5 backdrop-blur-sm hover:bg-slate-800/40 transition-all"
              >
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Rejected</p>
                <p className="text-2xl font-bold text-red-300">{stats.rejected}</p>
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
                  placeholder="Search intents..."
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

              <button
                onClick={() => refetch()}
                disabled={loading}
                className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                Refresh
              </button>

              <button className="bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 rounded-lg px-4 py-2.5 text-sm transition-all inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
              </button>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-cyan-500 mx-auto mb-4" />
                  <p className="text-slate-400">Loading intents...</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
                {error}
              </div>
            ) : filteredIntents.length === 0 ? (
              <div className="text-center py-16">
                <AlertCircle className="w-12 h-12 mx-auto text-slate-500 mb-4 opacity-50" />
                <p className="text-slate-400 mb-2">No intents found</p>
                <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  Showing {filteredIntents.length} IntentHistoryRecord
                  {filteredIntents.length !== 1 ? 's' : ''}
                </p>

                <AnimatePresence mode="popLayout">
                  <motion.div layout className="space-y-3">
                    {filteredIntents.map(
                      (IntentHistoryRecord: IntentHistoryRecord, index: number) => (
                        <motion.div
                          key={IntentHistoryRecord.intentId}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <IntentRow
                            IntentHistoryRecord={IntentHistoryRecord}
                            isExpanded={expandedIntent === IntentHistoryRecord.intentId}
                            onToggle={() =>
                              setExpandedIntent(
                                expandedIntent === IntentHistoryRecord.intentId
                                  ? null
                                  : IntentHistoryRecord.intentId
                              )
                            }
                          />
                        </motion.div>
                      )
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
