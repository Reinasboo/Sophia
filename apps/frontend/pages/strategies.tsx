'use client';

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Settings,
  Copy,
  Download,
  ChevronDown,
  Sparkles,
  Workflow,
  Zap,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { Sidebar, Header } from '@/components';
import { useStrategies } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { StrategyDefinition, StrategyFieldDescriptor } from '@/lib/types';

interface StrategyCardProps {
  strategy: StrategyDefinition;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onConfigure: (strategy: StrategyDefinition) => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
      <Sparkles className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function StrategyCard({ strategy, isExpanded, onToggleExpand, onConfigure }: StrategyCardProps) {
  return (
    <motion.div
      layout
      className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-white/[0.08]"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white">{strategy.label}</h3>
            <p className="text-sm text-white/65 mt-1">{strategy.description}</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-300 font-semibold border border-cyan-400/30 whitespace-nowrap ml-2">
            {strategy.category || 'Custom'}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onConfigure(strategy)}
            className="flex-1 min-w-max bg-gradient-brand-accent hover:shadow-[0_0_30px_rgba(255,0,128,0.2)] text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all inline-flex items-center justify-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Configure
          </button>
          <button className="bg-white/[0.04] border border-white/10 hover:border-cyan-400/30 hover:bg-white/[0.08] text-white/78 hover:text-cyan-300 rounded-xl px-3 py-2.5 transition-all inline-flex items-center gap-2">
            <Copy className="w-4 h-4" />
          </button>
          <button className="bg-white/[0.04] border border-white/10 hover:border-cyan-400/30 hover:bg-white/[0.08] text-white/78 hover:text-cyan-300 rounded-xl px-3 py-2.5 transition-all inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {strategy.fields.length > 0 && (
        <>
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-between px-0 py-3 mt-4 border-t border-white/10 transition-colors"
          >
            <span className="text-xs font-medium text-white/45 uppercase tracking-wider">
              {strategy.fields.length} parameter{strategy.fields.length === 1 ? '' : 's'}
            </span>
            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-white/45" />
            </motion.div>
          </button>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="pt-4"
              >
                <div className="space-y-3">
                  {Array.from(strategy.fields).map((field) => (
                    <div
                      key={field.key}
                      className="border-b border-white/10 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-xs text-white/60 font-medium mb-1 uppercase tracking-wider">
                        {field.label}
                      </p>
                      <p className="text-xs text-white/50">
                        {field.description || `Type: ${field.type}`}
                      </p>
                      {field.default !== undefined && (
                        <p className="text-xs text-white/40 mt-1">
                          Default: {JSON.stringify(field.default)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

export default function StrategiesPage() {
  const router = useRouter();
  const { strategies, loading, error } = useStrategies();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<StrategyDefinition | null>(null);

  const filteredStrategies = useMemo(() => {
    if (!strategies) return [];

    let result = [...strategies];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((s) => s.category === categoryFilter);
    }

    return result;
  }, [strategies, search, categoryFilter]);

  const grouped = useMemo(() => {
    return filteredStrategies.reduce<Record<string, StrategyDefinition[]>>((acc, s) => {
      const cat = s.category || 'custom';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {});
  }, [filteredStrategies]);

  const categories = useMemo(() => {
    return [...new Set(strategies?.map((s) => s.category || 'custom') || [])];
  }, [strategies]);

  return (
    <>
      <Head>
        <title>Strategies | Sophia Agentic Wallet</title>
      </Head>

      <div className="flex min-h-screen bg-black">
        <Sidebar />

        <div className="flex-1 ml-60">
          <Header title="Strategies" subtitle="Browse and configure agent strategies" />

          <main className="px-8 lg:px-12 pb-12 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search strategies…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded-lg px-4 py-2.5 text-sm transition-all backdrop-blur-sm"
                  />
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-50 rounded-lg px-3 py-2.5 text-sm transition-all backdrop-blur-sm cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>

                <button className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-all inline-flex items-center gap-2 hover:bg-cyan-500/30">
                  <Plus className="w-4 h-4" />
                  New Strategy
                </button>
              </div>

              {!loading && !error && (
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  Showing {filteredStrategies.length} of {strategies?.length || 0} strategies
                </p>
              )}
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto text-cyan-400 animate-spin mb-4" />
                  <p className="text-slate-400">Loading strategies…</p>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
                {error}
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="text-center py-16">
                <HelpCircle className="w-12 h-12 mx-auto text-slate-500 mb-4 opacity-50" />
                <p className="text-slate-400 mb-2">No strategies found</p>
                <p className="text-sm text-slate-500">Try adjusting your search or filters</p>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                {Object.entries(grouped).map(([category, items]) => (
                  <section key={category}>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </h2>
                      <span className="text-xs text-slate-500 bg-slate-800/50 rounded-full px-2 py-1">
                        {items.length}
                      </span>
                    </div>

                    <AnimatePresence mode="popLayout">
                      <motion.div layout className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {items.map((strategy) => (
                          <StrategyCard
                            key={strategy.name}
                            strategy={strategy as any}
                            isExpanded={expandedStrategy === strategy.name}
                            onToggleExpand={() =>
                              setExpandedStrategy(
                                expandedStrategy === strategy.name ? null : strategy.name
                              )
                            }
                            onConfigure={(s) => setSelectedConfig(s as any)}
                          />
                        ))}
                      </motion.div>
                    </AnimatePresence>
                  </section>
                ))}
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {selectedConfig && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedConfig(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-50">Configure {selectedConfig.label}</h3>
              <button
                onClick={() => setSelectedConfig(null)}
                className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Description</p>
                <p className="text-sm text-slate-50">{selectedConfig.description}</p>
              </div>

              {selectedConfig.fields.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider">Parameters</p>
                  <div className="space-y-3 bg-slate-900/50 rounded-lg p-4">
                    {Array.from(selectedConfig.fields).map((field) => (
                      <div key={field.key}>
                        <label className="text-xs text-slate-400 font-medium mb-1 block uppercase tracking-wider">
                          {field.label}
                        </label>
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          placeholder={
                            field.default !== undefined
                              ? `Default: ${JSON.stringify(field.default)}`
                              : field.description || field.label
                          }
                          className="w-full bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 focus:border-cyan-500 text-slate-50 placeholder:text-slate-500 rounded px-3 py-2 text-sm transition-all"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => setSelectedConfig(null)}
                className="flex-1 bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 rounded-lg px-4 py-2.5 transition-all"
              >
                Cancel
              </button>
              <button className="flex-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg px-4 py-2.5 transition-all hover:bg-cyan-500/30 font-medium">
                Create Agent
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
