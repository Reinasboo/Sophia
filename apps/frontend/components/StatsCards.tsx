'use client';

/**
 * Stats Cards Component
 *
 * Clean, calm statistics display.
 * Numbers at a glance without visual noise.
 */

import { motion } from 'framer-motion';
import { Bot, Wallet, ArrowRightLeft, Radio } from 'lucide-react';
import { useStats } from '@/lib/hooks';
import { formatSol, cn } from '@/lib/utils';

export function StatsCards() {
  const { stats, loading } = useStats();

  const cards = [
    {
      title: 'Active Agents',
      value: stats?.activeAgents ?? 0,
      total: stats?.totalAgents ?? 0,
      icon: Bot,
      format: (v: number, t: number) => `${v} of ${t}`,
    },
    {
      title: 'SOL Managed',
      value: stats?.totalSolManaged ?? 0,
      icon: Wallet,
      format: (v: number) => formatSol(v, 2),
      suffix: 'SOL',
    },
    {
      title: 'Transactions',
      value: stats?.totalTransactions ?? 0,
      icon: ArrowRightLeft,
      format: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Network',
      value: stats?.networkStatus ?? 'unknown',
      network: stats?.network ?? 'mainnet-beta',
      icon: Radio,
      isStatus: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;

        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * 0.05,
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-xl p-5"
          >
            {/* Header with icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-slate-800/50 rounded-lg flex items-center justify-center">
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-xs text-slate-400 font-medium">{card.title}</span>
            </div>

            {/* Value */}
            <div className="space-y-0.5">
              {loading ? (
                <div className="h-8 w-24 bg-slate-800/50 rounded-md animate-pulse" />
              ) : card.isStatus ? (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      card.value === 'healthy' ? 'bg-status-success' : 'bg-status-warning'
                    )}
                  />
                  <span className="text-xl font-bold text-slate-50 capitalize">{card.value}</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-50">
                    {card.format
                      ? card.format(card.value as number, card.total as number)
                      : card.value}
                  </span>
                  {card.suffix && <span className="text-sm text-slate-400">{card.suffix}</span>}
                </div>
              )}

              {/* Subtle subtext */}
              {card.network && !loading && (
                <span className="text-xs text-slate-400 capitalize">{card.network}</span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
