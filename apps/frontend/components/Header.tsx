'use client';

/**
 * Header Component
 *
 * Minimal, calm top bar with subtle status indicators.
 * Emphasizes content over chrome.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useStats, useWebSocket, useHealth } from '@/lib/hooks';
import { formatUptime } from '@/lib/utils';
import { BrandMark } from './BrandMark';
import { useTenantSession } from '@/lib/privy-provider';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { tenantSession, loading: sessionLoading } = useTenantSession();
  const pollingEnabled = !sessionLoading && !!tenantSession;
  const { stats } = useStats({ enabled: pollingEnabled });
  const { connected } = useWebSocket();
  const { healthy } = useHealth({ enabled: pollingEnabled });

  return (
    <header className="py-8 px-8 lg:px-12">
      <div className="flex items-start justify-between">
        {/* Title area */}
        <div className="space-y-3">
          <BrandMark href="/dashboard" size="sm" showLabel={false} className="w-fit" />
          {title && (
            <motion.h1
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl font-black text-white"
            >
              {title}
            </motion.h1>
          )}
          {subtitle && <p className="text-body text-text-secondary">{subtitle}</p>}
        </div>

        {/* Status indicators - subtle, right-aligned */}
        <div className="flex items-center gap-6 text-xs text-slate-500">
          {/* Backend health */}
          {healthy !== null && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  healthy ? 'bg-status-success' : 'bg-status-error'
                )}
              />
              <span>{healthy ? 'Healthy' : 'Degraded'}</span>
            </div>
          )}

          {/* WebSocket connection status */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                connected ? 'bg-status-success' : 'bg-status-error'
              )}
            />
            <span>{connected ? 'Live' : 'Offline'}</span>
          </div>

          {/* Network */}
          {stats && (
            <>
              <span className="text-border-medium">·</span>
              <span className="capitalize">mainnet</span>
            </>
          )}

          {/* Uptime - very subtle */}
          {stats && (
            <>
              <span className="text-border-medium">·</span>
              <span>Active</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
