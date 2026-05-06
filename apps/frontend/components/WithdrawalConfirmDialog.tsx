'use client';

/**
 * Withdrawal Confirmation Dialog
 *
 * Shows withdrawal details and allows user to confirm and execute.
 * Displays transaction cost, recipient, and amount.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, Loader, AlertCircle, ExternalLink } from 'lucide-react';
import { WithdrawalRecord } from '@/lib/types';
import * as api from '@/lib/api';
import { truncateAddress } from '@/lib/utils';

interface WithdrawalConfirmDialogProps {
  isOpen: boolean;
  withdrawal: WithdrawalRecord | null;
  onClose: () => void;
  onConfirmed: (record: WithdrawalRecord) => void;
}

export function WithdrawalConfirmDialog({
  isOpen,
  withdrawal,
  onClose,
  onConfirmed,
}: WithdrawalConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  const handleReset = () => {
    setError(null);
    setLoading(false);
    setExecuted(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleConfirm = async () => {
    if (!withdrawal) return;

    setError(null);
    setLoading(true);

    try {
      const response = await api.executeWithdrawal(withdrawal.id);

      if (response.success && response.data) {
        setExecuted(true);
        onConfirmed(response.data);
        // Auto-close after 2 seconds
        setTimeout(handleClose, 2000);
      } else {
        setError(response.error || 'Failed to execute withdrawal');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!withdrawal) return null;

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
  const explorerCluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  const transactionFee = 0.00005; // SOL
  const total = withdrawal.amount + transactionFee;

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
              <h2 className="text-lg font-semibold text-slate-50">
                {executed ? 'Withdrawal Executed' : 'Confirm Withdrawal'}
              </h2>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-slate-700/40 transition-colors duration-200 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {executed ? (
                // Success state
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-center space-y-3"
                >
                  <div className="flex justify-center">
                    <CheckCircle className="w-12 h-12 text-green-400" />
                  </div>
                  <p className="text-slate-50 font-medium">Withdrawal submitted!</p>
                  <p className="text-sm text-slate-400">
                    Check the transaction history to monitor confirmation.
                  </p>
                  {withdrawal.signature && (
                    <a
                      href={`https://explorer.solana.com/tx/${withdrawal.signature}${explorerCluster}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      View on explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </motion.div>
              ) : (
                // Confirmation state
                <>
                  {/* Withdrawal Details */}
                  <div className="space-y-3">
                    {/* Recipient */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <span className="text-sm text-slate-400">To (Recipient)</span>
                      <code className="text-sm text-slate-50 font-mono">
                        {truncateAddress(withdrawal.recipient, 6, 6)}
                      </code>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <span className="text-sm text-slate-400">Amount</span>
                      <span className="text-sm text-slate-50 font-semibold">
                        {withdrawal.amount.toFixed(6)} SOL
                      </span>
                    </div>

                    {/* Fee */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <span className="text-sm text-slate-400">Network Fee</span>
                      <span className="text-sm text-slate-50 font-mono">
                        {transactionFee.toFixed(5)} SOL
                      </span>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                      <span className="text-sm font-medium text-cyan-300">Total</span>
                      <span className="text-sm font-semibold text-cyan-300">
                        {total.toFixed(6)} SOL
                      </span>
                    </div>
                  </div>

                  {/* Description if provided */}
                  {withdrawal.description && (
                    <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <p className="text-xs text-slate-400 mb-1">Note</p>
                      <p className="text-sm text-slate-300">{withdrawal.description}</p>
                    </div>
                  )}

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
                      onClick={handleClose}
                      disabled={loading}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-50 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600/50 rounded-lg transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={loading}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        'Confirm & Execute'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
