'use client';

/**
 * Agent List Component
 *
 * Clean grid of agent cards with empty state.
 */

import { motion } from 'framer-motion';
import { Bot, Plus } from 'lucide-react';
import { useAgents } from '@/lib/hooks';
import { AgentCard } from './AgentCard';

interface AgentListProps {
  onCreateClick?: () => void;
}

export function AgentList({ onCreateClick }: AgentListProps) {
  const { agents, loading, error, refetch } = useAgents();

  if (loading && agents.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-gradient-card border border-slate-700/50 rounded-lg p-5 animate-pulse backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-slate-700/30" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-slate-700/30 rounded mb-2" />
                <div className="h-3 w-16 bg-slate-700/30 rounded" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-3 w-full bg-slate-700/30 rounded" />
              <div className="h-3 w-2/3 bg-slate-700/30 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-card border border-slate-700/50 rounded-lg p-8 text-center backdrop-blur-sm hover:bg-gradient-card-hover transition-all">
        <p className="text-red-300 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 text-sm font-medium bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 text-slate-300 hover:text-slate-50 rounded-lg transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-card border border-slate-700/50 rounded-lg backdrop-blur-sm hover:bg-gradient-card-hover transition-all"
      >
        <div className="py-16 text-center px-6">
          <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-slate-700/30 flex items-center justify-center">
            <Bot className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-50 mb-2">No agents yet</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
            Create your first agent to start autonomous wallet management.
          </p>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="px-4 py-2 text-sm font-medium bg-gradient-focus border border-cyan-500/40 hover:border-cyan-500/60 text-cyan-300 hover:text-cyan-200 rounded-lg transition-all inline-flex items-center gap-2 hover:bg-gradient-brand-accent-dark"
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {agents.map((agent, index) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: index * 0.04,
            duration: 0.3,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <AgentCard agent={agent} onUpdate={refetch} />
        </motion.div>
      ))}
    </div>
  );
}
