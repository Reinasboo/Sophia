'use client';

/**
 * Transaction Explorer
 *
 * Drill-down transaction details:
 * - Full program info
 * - Account states
 * - Instruction logs
 * - Simulation results
 * - Gas breakdown
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuthProtected } from '@/lib/useAuthProtected';
import { ArrowRightLeft, Download, ExternalLink, Loader } from 'lucide-react';
import { Sidebar, Header } from '@/components';

interface Transaction {
  signature: string;
  agentId: string;
  status: string;
  timestamp: number;
  type: string;
  from: string;
  to?: string;
  amount?: number;
  gasSpent?: number;
  error?: string;
}

interface TransactionDetail extends Transaction {
  logs: string[];
  instructions: any[];
  accounts: any[];
  simulationResult?: {
    success: boolean;
    gasEstimate: number;
    error?: string;
  };
}

export default function TransactionExplorer() {
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<TransactionDetail | null>(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuthProtected();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      fetchTransactions();
      const interval = setInterval(fetchTransactions, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions?limit=50');
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const data = await res.json();
      setTransactions(data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactionDetail = async (signature: string) => {
    try {
      const res = await fetch(`/api/transactions/${signature}`);
      if (!res.ok) throw new Error('Failed to fetch transaction details');
      const data = await res.json();
      setSelected(data);
    } catch (err) {
      console.error('Failed to fetch transaction details:', err);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.status === filter;
  });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Transaction Explorer - Sophia</title>
      </Head>

      <div className="flex h-screen bg-black">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />

          <main className="flex-1 overflow-auto">
            <div className="p-8 space-y-6">

              {/* Filter Controls */}
              <div className="flex gap-2 flex-wrap">
                {['all', 'confirmed', 'failed', 'pending'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      filter === status
                        ? 'bg-cyan-500 text-black'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transaction List */}
                <div className="lg:col-span-1 bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-700">
                    <h2 className="text-lg font-bold text-cyan-400">Transactions</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      {filteredTransactions.length} total
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-32 text-gray-500">
                        <Loader className="w-5 h-5 animate-spin" />
                      </div>
                    ) : filteredTransactions.length > 0 ? (
                      <div className="divide-y divide-gray-800">
                        {filteredTransactions.map((tx) => (
                          <button
                            key={tx.signature}
                            onClick={() => fetchTransactionDetail(tx.signature)}
                            className={`w-full text-left p-3 hover:bg-gray-800/50 transition-colors border-l-2 ${
                              selected?.signature === tx.signature
                                ? 'border-l-cyan-400 bg-gray-800/30'
                                : 'border-l-transparent'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-mono text-gray-400">
                                {tx.signature.slice(0, 12)}...
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-1 rounded ${
                                  tx.status === 'confirmed'
                                    ? 'bg-green-900/30 text-green-400'
                                    : tx.status === 'failed'
                                      ? 'bg-red-900/30 text-red-400'
                                      : 'bg-blue-900/30 text-blue-400'
                                }`}
                              >
                                {tx.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {new Date(tx.timestamp).toLocaleTimeString()}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-gray-500">
                        No transactions found
                      </div>
                    )}
                  </div>
                </div>

                {/* Transaction Details */}
                <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg overflow-hidden flex flex-col">
                  {selected ? (
                    <>
                      <div className="p-6 border-b border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm text-gray-400">Signature</p>
                            <p className="text-lg font-mono text-cyan-400 break-all">
                              {selected.signature}
                            </p>
                          </div>
                          <a
                            href={`https://explorer.solana.com/tx/${selected.signature}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-800 rounded transition-colors"
                          >
                            <ExternalLink className="w-5 h-5 text-gray-400" />
                          </a>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Status</p>
                            <span
                              className={`text-sm font-bold px-2 py-1 rounded ${
                                selected.status === 'confirmed'
                                  ? 'bg-green-900/30 text-green-400'
                                  : selected.status === 'failed'
                                    ? 'bg-red-900/30 text-red-400'
                                    : 'bg-blue-900/30 text-blue-400'
                              }`}
                            >
                              {selected.status}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Type</p>
                            <p className="text-sm text-gray-300 font-semibold">{selected.type}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Gas Spent</p>
                            <p className="text-sm text-magenta-500 font-semibold">
                              {selected.gasSpent?.toFixed(6) || 'N/A'} SOL
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Timestamp</p>
                            <p className="text-sm text-gray-300">
                              {new Date(selected.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex border-b border-gray-700 bg-gray-800/20">
                        <button className="flex-1 py-3 px-4 text-sm font-semibold text-cyan-400 border-b-2 border-cyan-400">
                          Details
                        </button>
                        <button className="flex-1 py-3 px-4 text-sm font-semibold text-gray-500 hover:text-gray-400">
                          Logs ({selected.logs?.length || 0})
                        </button>
                        <button className="flex-1 py-3 px-4 text-sm font-semibold text-gray-500 hover:text-gray-400">
                          Instructions ({selected.instructions?.length || 0})
                        </button>
                      </div>

                      {/* Details Content */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {selected.error && (
                          <div className="bg-red-900/20 border border-red-500 rounded p-3">
                            <p className="text-sm text-red-400 font-semibold">Error</p>
                            <p className="text-sm text-red-300 mt-1 font-mono break-all">
                              {selected.error}
                            </p>
                          </div>
                        )}

                        {selected.simulationResult && (
                          <div className="bg-blue-900/20 border border-blue-500 rounded p-3">
                            <p className="text-sm text-blue-400 font-semibold">Simulation Result</p>
                            <div className="text-sm text-blue-300 mt-2 space-y-1">
                              <p>
                                Success:{' '}
                                <span className="font-mono">
                                  {selected.simulationResult.success ? 'true' : 'false'}
                                </span>
                              </p>
                              <p>
                                Gas Estimate:{' '}
                                <span className="font-mono">
                                  {selected.simulationResult.gasEstimate} lamports
                                </span>
                              </p>
                              {selected.simulationResult.error && (
                                <p>
                                  Error:{' '}
                                  <span className="font-mono break-all">
                                    {selected.simulationResult.error}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="bg-gray-800/30 border border-gray-700 rounded p-3">
                          <p className="text-sm text-gray-400 font-semibold mb-2">From</p>
                          <p className="text-sm font-mono text-cyan-400 break-all">
                            {selected.from}
                          </p>
                        </div>

                        {selected.to && (
                          <div className="bg-gray-800/30 border border-gray-700 rounded p-3">
                            <p className="text-sm text-gray-400 font-semibold mb-2">To</p>
                            <p className="text-sm font-mono text-cyan-400 break-all">
                              {selected.to}
                            </p>
                          </div>
                        )}

                        {selected.amount && (
                          <div className="bg-gray-800/30 border border-gray-700 rounded p-3">
                            <p className="text-sm text-gray-400 font-semibold mb-2">Amount</p>
                            <p className="text-sm font-mono text-magenta-500">
                              {selected.amount} SOL
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Select a transaction to view details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
