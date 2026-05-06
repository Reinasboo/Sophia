'use client';

/**
 * Withdrawal History Card
 *
 * Displays agent withdrawal history with status badges and details.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, Loader, AlertCircle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { WithdrawalRecord } from '@/lib/types';
import * as api from '@/lib/api';
import { truncateAddress, formatTimestamp, formatSol } from '@/lib/utils';

interface WithdrawalHistoryCardProps {
  agentId: string;
}

export function WithdrawalHistoryCard({ agentId }: WithdrawalHistoryCardProps) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWithdrawals();
  }, [agentId]);

  const loadWithdrawals = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getAgentWithdrawals(agentId, 10);
      if (response.success && response.data) {
        setWithdrawals(response.data);
      } else {
        setError(response.error || 'Failed to load withdrawal history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: WithdrawalRecord['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            Pending
          </span>
        );
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/30 text-green-300">
            <CheckCircle className="w-3 h-3" />
            Executed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-300">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
  const explorerCluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
      >
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader className="w-5 h-5 text-cyan-400 animate-spin" />
          <span className="text-sm text-slate-400">Loading withdrawal history...</span>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
      >
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-slate-50 mb-1">Failed to load history</h3>
            <p className="text-xs text-red-300">{error}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (withdrawals.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700/30 flex items-center justify-center">
            <History className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-50">No withdrawals yet</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Request your first withdrawal to see it here
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm"
    >
      <h3 className="text-base font-medium text-slate-50 mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-cyan-400" />
        Withdrawal History
      </h3>

      <div className="space-y-2">
        {withdrawals.map((withdrawal) => (
          <div
            key={withdrawal.id}
            className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors duration-200"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs text-slate-400 font-mono">
                    {truncateAddress(withdrawal.recipient, 6, 6)}
                  </code>
                  {withdrawal.signature && (
                    <a
                      href={`https://explorer.solana.com/tx/${withdrawal.signature}${explorerCluster}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-md text-slate-500 hover:text-slate-50 hover:bg-slate-700/40 transition-colors"
                      title="View on Solana Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {formatTimestamp(withdrawal.requestedAt)}
                </p>
              </div>
              {getStatusBadge(withdrawal.status)}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-50">
                {formatSol(withdrawal.amount)} SOL
              </span>
              {withdrawal.description && (
                <span className="text-xs text-slate-400">{withdrawal.description}</span>
              )}
            </div>

            {withdrawal.error && (
              <p className="text-xs text-red-300 mt-2">{withdrawal.error}</p>
            )}
          </div>
        ))}
      </div>

      {withdrawals.length === 10 && (
        <button
          onClick={loadWithdrawals}
          className="w-full mt-4 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-50 bg-slate-800/30 hover:bg-slate-700/40 border border-slate-700/50 hover:border-slate-600/50 rounded-lg transition-all"
        >
          Load More
        </button>
      )}
    </motion.div>
  );
}
