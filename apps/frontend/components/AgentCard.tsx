'use client';

/**
 * Agent Card Component
 *
 * Clean, calm agent card with subtle interactions.
 * Focused on clarity and status visibility.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bot, Play, Square, Copy, Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/lib/types';
import * as api from '@/lib/api';
import {
  cn,
  formatSol,
  truncateAddress,
  formatRelativeTime,
  getStatusBadgeClass,
  getStrategyDisplayName,
  copyToClipboard,
} from '@/lib/utils';

interface AgentCardProps {
  agent: Agent;
  onUpdate?: () => void;
}

export function AgentCard({ agent, onUpdate }: AgentCardProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    await api.startAgent(agent.id);
    setLoading(false);
    onUpdate?.();
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    await api.stopAgent(agent.id);
    setLoading(false);
    onUpdate?.();
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!agent.walletPublicKey) return;
    const success = await copyToClipboard(agent.walletPublicKey);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isRunning = agent.status !== 'stopped';

  return (
    <Link href={`/agents/${agent.id}`}>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 hover:border-cyan-500/40 rounded-lg p-5 cursor-pointer group transition-all backdrop-blur-sm hover:bg-slate-800/40"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                agent.strategy === 'accumulator'
                  ? 'bg-cyan-500/10 border border-cyan-500/30'
                  : 'bg-blue-500/10 border border-blue-500/30'
              )}
            >
              <Bot
                className={cn(
                  'w-5 h-5',
                  agent.strategy === 'accumulator' ? 'text-cyan-400' : 'text-blue-400'
                )}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-50">{agent.name}</h3>
              <span className="text-xs text-slate-400">
                {getStrategyDisplayName(agent.strategy)}
              </span>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
              agent.status === 'executing' || agent.status === 'thinking'
                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                : agent.status === 'error'
                  ? 'bg-red-500/10 text-red-300 border-red-500/30'
                  : agent.status === 'stopped'
                    ? 'bg-slate-600/10 text-slate-400 border-slate-600/30'
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                agent.status === 'executing' || agent.status === 'thinking'
                  ? 'animate-pulse bg-cyan-500'
                  : agent.status === 'stopped'
                    ? 'bg-slate-500'
                    : agent.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
              )}
            />
            <span className="capitalize">{agent.status}</span>
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2">
          {/* Wallet Address */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Wallet</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-mono">
                {truncateAddress(agent.walletPublicKey || agent.id, 6, 4)}
              </span>
              <button
                onClick={handleCopy}
                aria-label={copied ? 'Copied to clipboard' : 'Copy wallet address'}
                className="p-1 rounded hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-cyan-300"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Balance - fetched separately on detail page */}

          {/* Last Action */}
          {agent.lastActionAt && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Last Activity</span>
              <span className="text-xs text-slate-400">
                {formatRelativeTime(agent.lastActionAt)}
              </span>
            </div>
          )}
        </div>

        {/* Error message */}
        {agent.errorMessage && (
          <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
            <p className="text-xs text-red-300 truncate">{agent.errorMessage}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-700/50 flex items-center justify-between">
          {/* Action button */}
          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              Start
            </button>
          )}

          {/* View details indicator */}
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
        </div>
      </motion.div>
    </Link>
  );
}
