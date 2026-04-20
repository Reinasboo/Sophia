'use client';

/**
 * Performance Monitoring Dashboard
 *
 * Real-time visualization of:
 * - Agent success rates
 * - Transaction throughput
 * - Gas efficiency
 * - System health metrics
 * - Cache performance
 * - Rate limiting status
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuthProtected } from '@/lib/useAuthProtected';
import { TrendingUp, Zap, Activity, AlertCircle, Database, Gauge } from 'lucide-react';
import { Sidebar, Header } from '@/components';

interface MetricCard {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
  color: string;
}

interface AgentMetric {
  agentId: string;
  name: string;
  status: string;
  successRate: number;
  transactionCount: number;
  gasSpent: number;
  avgCycleTime: number;
}

export default function PerformanceMonitoring() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [agents, setAgents] = useState<AgentMetric[]>([]);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [rateLimitStats, setRateLimitStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuthProtected();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const fetchMetrics = async () => {
    try {
      // Fetch stats
      const statsRes = await fetch('/api/stats');
      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      const statsData = await statsRes.json();

      // Fetch cache metrics
      const cacheRes = await fetch('/api/monitoring/cache');
      const cacheData = cacheRes.ok ? await cacheRes.json() : null;

      // Fetch rate limit metrics
      const rateLimitRes = await fetch('/api/monitoring/rate-limits');
      const rateLimitData = rateLimitRes.ok ? await rateLimitRes.json() : null;

      // Build metric cards
      const cards: MetricCard[] = [
        {
          label: 'Total Transactions',
          value: statsData.totalTransactions || 0,
          icon: <TrendingUp className="w-5 h-5" />,
          color: 'text-cyan-400',
        },
        {
          label: 'Success Rate',
          value: `${((statsData.successRate || 95) * 100).toFixed(1)}%`,
          icon: <Activity className="w-5 h-5" />,
          color: 'text-green-400',
        },
        {
          label: 'Active Agents',
          value: statsData.activeAgents || 0,
          icon: <Zap className="w-5 h-5" />,
          color: 'text-magenta-500',
        },
        {
          label: 'Avg Cycle Time',
          value: `${(statsData.avgCycleTime || 250).toFixed(0)}`,
          unit: 'ms',
          icon: <Gauge className="w-5 h-5" />,
          color: 'text-blue-400',
        },
        {
          label: 'Cache Hit Rate',
          value: cacheData?.cache?.hitRate || '0%',
          icon: <Database className="w-5 h-5" />,
          color: 'text-yellow-400',
        },
        {
          label: 'RPC Utilization',
          value: rateLimitData?.rpc?.utilization || '0%',
          icon: <Gauge className="w-5 h-5" />,
          color: 'text-orange-400',
        },
      ];

      setMetrics(cards);
      setCacheStats(cacheData);
      setRateLimitStats(rateLimitData);

      // Map agents
      const agentList: AgentMetric[] = (statsData.agents || []).map((agent: any) => ({
        agentId: agent.id,
        name: agent.name || `Agent ${agent.id.slice(0, 8)}`,
        status: agent.status || 'idle',
        successRate: agent.stats?.successRate || 95,
        transactionCount: agent.stats?.totalTransactions || 0,
        gasSpent: agent.stats?.totalGasSpent || 0,
        avgCycleTime: agent.stats?.avgCycleTime || 0,
      }));

      setAgents(agentList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      console.error('Metrics fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Performance Monitoring - Sophia</title>
      </Head>

      <div className="flex h-screen bg-black">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />

          <main className="flex-1 overflow-auto">
            <div className="p-8 space-y-8">
              {/* Page Title */}
              <div>
                <h1 className="text-3xl font-bold text-white">Performance Monitoring</h1>
                <p className="text-gray-400 mt-2">Real-time system metrics and agent performance</p>
              </div>

              {/* Error State */}
              {error && (
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 flex items-start gap-4">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-red-400 font-semibold">Error</h3>
                    <p className="text-red-300 text-sm mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={metric.color}>{metric.icon}</div>
                      <div className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                        Live
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-gray-400 text-sm font-medium">{metric.label}</p>
                      <div className="flex items-baseline gap-2">
                        <p className={`text-2xl font-bold ${metric.color}`}>{metric.value}</p>
                        {metric.unit && <p className="text-gray-500 text-sm">{metric.unit}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Agents Performance Table */}
              <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                  <h2 className="text-lg font-bold text-cyan-400">Agent Performance</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 bg-gray-800/30">
                        <th className="text-left py-3 px-6 text-gray-400 font-semibold">Agent</th>
                        <th className="text-right py-3 px-6 text-gray-400 font-semibold">Status</th>
                        <th className="text-right py-3 px-6 text-gray-400 font-semibold">Success %</th>
                        <th className="text-right py-3 px-6 text-gray-400 font-semibold">TX Count</th>
                        <th className="text-right py-3 px-6 text-gray-400 font-semibold">Gas (SOL)</th>
                        <th className="text-right py-3 px-6 text-gray-400 font-semibold">Cycle Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.length > 0 ? (
                        agents.map((agent) => (
                          <tr
                            key={agent.agentId}
                            className="border-b border-gray-800 hover:bg-gray-800/20 transition-colors"
                          >
                            <td className="py-3 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                <span className="text-gray-300 font-mono text-xs">
                                  {agent.name}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-3 px-6">
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${
                                  agent.status === 'idle'
                                    ? 'bg-green-900/30 text-green-400'
                                    : agent.status === 'thinking'
                                      ? 'bg-blue-900/30 text-blue-400'
                                      : agent.status === 'executing'
                                        ? 'bg-purple-900/30 text-purple-400'
                                        : 'bg-gray-900/30 text-gray-400'
                                }`}
                              >
                                {agent.status}
                              </span>
                            </td>
                            <td className="text-right py-3 px-6">
                              <span className="text-cyan-400 font-semibold">
                                {agent.successRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="text-right py-3 px-6 text-gray-300">
                              {agent.transactionCount}
                            </td>
                            <td className="text-right py-3 px-6 text-magenta-500">
                              {agent.gasSpent.toFixed(6)}
                            </td>
                            <td className="text-right py-3 px-6 text-gray-300">
                              {agent.avgCycleTime.toFixed(0)}ms
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 px-6 text-center text-gray-500">
                            No agents data available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cache & Rate Limit Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cache Stats */}
                <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg p-6">
                  <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Cache Performance
                  </h2>
                  {cacheStats ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                        <span className="text-gray-400">Hit Rate</span>
                        <span className="text-cyan-400 font-bold">{cacheStats.cache?.hitRate || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                        <span className="text-gray-400">Total Entries</span>
                        <span className="text-cyan-400 font-bold">{cacheStats.cache?.totalEntries || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Estimated RPC Savings</span>
                        <span className="text-green-400 font-bold">{cacheStats.cache?.estimatedRpcSavings || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">Loading cache stats...</p>
                  )}
                </div>

                {/* Rate Limit Stats */}
                <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg p-6">
                  <h2 className="text-lg font-bold text-magenta-500 mb-4 flex items-center gap-2">
                    <Gauge className="w-5 h-5" />
                    Rate Limiting Status
                  </h2>
                  {rateLimitStats ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                        <span className="text-gray-400">RPC Utilization</span>
                        <span className="text-magenta-500 font-bold">{rateLimitStats.rpc?.utilization || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                        <span className="text-gray-400">RPC Budget Used</span>
                        <span className="text-magenta-500 font-bold">{rateLimitStats.rpc?.used || 0} / {rateLimitStats.rpc?.limit || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Blocked Requests</span>
                        <span className={`font-bold ${rateLimitStats.rpc?.blocked > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {rateLimitStats.rpc?.blocked || 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">Loading rate limit stats...</p>
                  )}
                </div>
              </div>

              {/* Last Updated */}
              <div className="text-xs text-gray-600 text-center py-4">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
