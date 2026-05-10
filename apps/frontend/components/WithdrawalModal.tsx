'use client';

/**
 * Withdrawal Request Modal
 *
 * Form to request withdrawal from an agent's wallet.
 * User provides recipient address and optional amount.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Wallet } from 'lucide-react';
import { WithdrawalRecord } from '@/lib/types';
import * as api from '@/lib/api';

interface WithdrawalModalProps {
  isOpen: boolean;
  agentId: string;
  agentBalance: number;
  onClose: () => void;
  onWithdrawalRequested: (record: WithdrawalRecord) => void;
}

export function WithdrawalModal({
  isOpen,
  agentId,
  agentBalance,
  onClose,
  onWithdrawalRequested,
}: WithdrawalModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setRecipient('');
    setAmount('');
    setDescription('');
    setError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!recipient.trim()) {
      setError('Recipient address is required');
      return;
    }

    if (recipient.length !== 44 && recipient.length !== 43) {
      setError('Invalid Solana address (must be 43-44 characters)');
      return;
    }

    if (amount) {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        setError('Amount must be greater than 0');
        return;
      }
      if (amountNum > agentBalance - 0.001) {
        setError(`Insufficient balance. Max: ${(agentBalance - 0.001).toFixed(4)} SOL`);
        return;
      }
    }

    setLoading(true);
    try {
      const response = await api.requestWithdrawal(agentId, {
        recipient: recipient.trim(),
        amount: amount ? parseFloat(amount) : undefined,
        description: description.trim() || undefined,
      });

      if (response.success && response.data) {
        onWithdrawalRequested(response.data);
        handleClose();
      } else {
        setError(response.error || 'Failed to request withdrawal');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-gradient-to-br from-slate-800/95 to-slate-900/95 border border-slate-700/50 rounded-xl backdrop-blur-xl z-50 shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-cyan-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-50">Request Withdrawal</h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-slate-700/40 transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Recipient Address */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Recipient Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="6VT1RL9LXXJbC2HZXZ..."
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors duration-200"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Amount (SOL){' '}
                  <span className="text-slate-500">(optional - defaults to full balance)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.5"
                    className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setAmount((agentBalance - 0.001).toFixed(4))}
                    className="px-3 py-2 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg transition-all"
                  >
                    Max
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Available: {(agentBalance - 0.001).toFixed(4)} SOL (after 0.001 fee reserve)
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Monthly dividend"
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors duration-200"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-50 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Submitting...' : 'Request Withdrawal'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
