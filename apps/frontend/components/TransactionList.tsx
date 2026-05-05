'use client';

/**
 * Transaction List Component
 *
 * Clean, scannable transaction history.
 * Focus on clarity over density.
 */

import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { Transaction } from '@/lib/types';
import {
  cn,
  formatSol,
  truncateAddress,
  formatTimestamp,
  formatRelativeTime,
  getExplorerUrl,
} from '@/lib/utils';

interface TransactionListProps {
  transactions: Transaction[];
  loading?: boolean;
  compact?: boolean;
}

function getTransactionIcon(type: string) {
  switch (type) {
    case 'airdrop':
      return <ArrowDownLeft className="w-4 h-4" />;
    case 'transfer_sol':
    case 'transfer_spl':
    case 'swap':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'raw_execute':
    case 'create_token':
      return <ArrowUpRight className="w-4 h-4" />;
    default:
      return <ArrowUpRight className="w-4 h-4" />;
  }
}

function getStatusIndicator(status: string) {
  switch (status) {
    case 'confirmed':
    case 'finalized':
      return <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-status-error" />;
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-status-warning" />;
    case 'submitted':
      return <Loader2 className="w-3.5 h-3.5 text-status-info animate-spin" />;
    default:
      return null;
  }
}

function getTransactionLabel(type: string) {
  switch (type) {
    case 'airdrop':
      return 'Airdrop Received';
    case 'transfer_sol':
      return 'SOL Transfer';
    case 'transfer_spl':
      return 'Token Transfer';
    case 'raw_execute':
      return 'Autonomous Execute';
    case 'swap':
      return 'Token Swap';
    case 'create_token':
      return 'Token Created';
    default:
      return type.replace(/_/g, ' ');
  }
}

export function TransactionList({ transactions, loading, compact = false }: TransactionListProps) {
  if (loading) {
    return (
      <div className="bg-gradient-card border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm hover:bg-gradient-card-hover transition-all">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-slate-700/30" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-slate-700/30 rounded mb-2" />
                <div className="h-3 w-40 bg-slate-700/30 rounded" />
              </div>
              <div className="h-4 w-16 bg-slate-700/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-gradient-card border border-slate-700/50 rounded-lg backdrop-blur-sm hover:bg-gradient-card-hover transition-all">
        <div className="py-12 text-center px-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-700/30 flex items-center justify-center">
            <Clock className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-sm text-slate-400">No transactions yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-card border border-slate-700/50 rounded-lg overflow-hidden divide-y divide-slate-700/50 backdrop-blur-sm hover:bg-gradient-card-hover transition-all">
      {transactions.map((tx, index) => (
        <motion.div
          key={tx.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: index * 0.02,
            duration: 0.25,
            ease: [0.16, 1, 0.3, 1],
          }}
          className={cn(
            'flex items-center gap-4 hover:bg-slate-800/20 transition-colors',
            compact ? 'px-4 py-3' : 'px-5 py-4'
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              'flex-shrink-0 rounded-lg bg-slate-700/30 flex items-center justify-center text-slate-400',
              compact ? 'w-8 h-8' : 'w-10 h-10'
            )}
          >
            {getTransactionIcon(tx.type)}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-50">
                {getTransactionLabel(tx.type)}
              </span>
              {getStatusIndicator(tx.status)}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {tx.recipient && (
                <>
                  <span className="text-xs text-slate-400">to</span>
                  <span className="font-mono text-xs text-slate-400">
                    {truncateAddress(tx.recipient, 6, 4)}
                  </span>
                </>
              )}
              {!compact && (
                <>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs text-slate-400">{formatRelativeTime(tx.createdAt)}</span>
                </>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            {tx.amount ? (
              <span
                className={cn(
                  'mono font-medium',
                  tx.type === 'transfer_sol' ? 'text-cyan-300' : 'text-slate-50'
                )}
              >
                {tx.type === 'transfer_sol' ? '+' : '-'}
                {formatSol(typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount, 3)}
                <span className="text-slate-400 ml-1">SOL</span>
              </span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>

          {/* Explorer link */}
          {tx.signature && !compact && (
            <a
              href={getExplorerUrl(tx.signature)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View transaction ${tx.id} on Solana Explorer`}
              className="flex-shrink-0 p-2 rounded-md hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-cyan-300"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-cyan-300" />
            </a>
          )}
        </motion.div>
      ))}
    </div>
  );
}
