'use client';

/**
 * Connected Agent Detail Page
 *
 * Shows detail for a single BYOA agent: wallet, balance, intent history.
 * Includes management actions: activate, deactivate, revoke.
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Plug,
  Globe,
  Monitor,
  Wifi,
  WifiOff,
  ShieldAlert,
  Copy,
  CheckCircle2,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { PageLayout, IntentHistory } from '@/components';
import { useExternalAgent } from '@/lib/hooks';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ExternalAgentStatus } from '@/lib/types';

const statusConfig: Record<ExternalAgentStatus, { label: string; color: string }> = {
  registered: { label: 'Registered', color: 'text-blue-400 bg-blue-500/10' },
  active: { label: 'Connected', color: 'text-green-400 bg-green-500/10' },
  inactive: { label: 'Inactive', color: 'text-slate-400 bg-slate-500/10' },
  revoked: { label: 'Revoked', color: 'text-red-400 bg-red-500/10' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button onClick={copy} className="p-1 hover:bg-slate-800/50 rounded transition-colors">
      {copied ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-slate-400" />
      )}
    </button>
  );
}

export default function ConnectedAgentDetailPage() {
  const router = useRouter();
  const agentId = typeof router.query.id === 'string' ? router.query.id : null;
  const { data, loading, error, refetch } = useExternalAgent(agentId);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const handleActivate = async () => {
    if (!agentId) return;
    setActionLoading(true);
    await api.activateExternalAgent(agentId);
    await refetch();
    setActionLoading(false);
  };

  const handleDeactivate = async () => {
    if (!agentId) return;
    setActionLoading(true);
    await api.deactivateExternalAgent(agentId);
    await refetch();
    setActionLoading(false);
  };

  const handleRevoke = async () => {
    if (!agentId) return;
    setActionLoading(true);
    await api.revokeExternalAgent(agentId);
    await refetch();
    setActionLoading(false);
    setConfirmRevoke(false);
  };

  const agent = data;
  const statusCfg = agent ? (statusConfig[agent.status] ?? statusConfig.inactive) : null;
  const TypeIcon = agent?.type === 'remote' ? Globe : Monitor;

  return (
    <>
      <Head>
        <title>
          {agent ? `${agent.name} | Connected Agent` : 'Connected Agent'} | Agentic Wallet
        </title>
      </Head>

      <PageLayout title={agent?.name ?? 'Loading…'} subtitle="Connected agent detail">
        <div className="space-y-8">
            {/* Back nav */}
            <Link
              href="/connected-agents"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to connected agents
            </Link>

            {loading && <div className="text-center py-12 text-slate-400">Loading…</div>}

            {error && <div className="text-center py-12 text-red-400">{error}</div>}

            {agent && statusCfg && (
              <>
                {/* Top card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-brand-subtle rounded-2xl border border-surface-muted hover:border-secondary/50 p-6 space-y-5 transition-colors duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
                      <Plug className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-slate-50">{agent.name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <TypeIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-400 capitalize">{agent.type}</span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
                        statusCfg.color
                      )}
                    >
                      {agent.status === 'active' ? (
                        <Wifi className="w-3.5 h-3.5" />
                      ) : agent.status === 'inactive' ? (
                        <ShieldAlert className="w-3.5 h-3.5" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5" />
                      )}
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Grid details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Wallet */}
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <span className="text-xs text-slate-400 block mb-1">Wallet Address</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono text-slate-50 truncate">
                          {agent.walletPublicKey
                            ? `${agent.walletPublicKey.slice(0, 8)}...${agent.walletPublicKey.slice(-6)}`
                            : '—'}
                        </span>
                        {agent.walletPublicKey && <CopyButton text={agent.walletPublicKey} />}
                      </div>
                    </div>

                    {/* Supported intents */}
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <span className="text-xs text-slate-400 block mb-1">Supported Intents</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(agent.supportedIntents ?? []).map((i) => (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded bg-slate-900 text-slate-300"
                          >
                            {i}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Created */}
                    <div className="bg-slate-800/50 rounded-xl p-4">
                      <span className="text-xs text-slate-400 block mb-1">Registered</span>
                      <span className="text-sm text-slate-50">
                        {new Date(agent.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Management Actions */}
                  {agent.status !== 'revoked' && (
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-700/50">
                      {agent.status === 'active' || agent.status === 'registered' ? (
                        <button
                          onClick={handleDeactivate}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                        >
                          <PowerOff className="w-3.5 h-3.5" />
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={handleActivate}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        >
                          <Power className="w-3.5 h-3.5" />
                          Activate
                        </button>
                      )}

                      {!confirmRevoke ? (
                        <button
                          onClick={() => setConfirmRevoke(true)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Revoke
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">
                            Permanently revoke this agent?
                          </span>
                          <button
                            onClick={handleRevoke}
                            disabled={actionLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            Yes, revoke
                          </button>
                          <button
                            onClick={() => setConfirmRevoke(false)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {agent.status === 'inactive' && (
                    <div className="pt-2 border-t border-slate-700/50">
                      <span className="inline-flex items-center gap-2 text-xs text-red-400">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        This agent has been permanently revoked and cannot be reactivated.
                      </span>
                    </div>
                  )}
                </motion.div>

                {/* Intent history */}
                <section>
                  <h3 className="text-label text-text-secondary mb-4">Intent History</h3>
                  <div className="bg-gradient-brand-subtle rounded-2xl border border-surface-muted hover:border-secondary/50 p-5 transition-colors duration-200">
                    <IntentHistory intents={data.intentHistory ?? []} maxItems={100} />
                  </div>
                </section>
              </>
            )}
        </div>
      </PageLayout>
    </>
  );
}
