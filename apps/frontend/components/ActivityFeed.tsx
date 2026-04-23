'use client';

/**
 * Activity Feed Component
 *
 * Calm, readable timeline of system activity.
 * Designed for monitoring at a glance.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Circle,
} from 'lucide-react';
import { useWebSocket, useEvents } from '@/lib/hooks';
import type { SystemEvent } from '@/lib/types';
import { cn, formatRelativeTime, formatSol } from '@/lib/utils';

interface ActivityFeedProps {
  events?: SystemEvent[];
  maxItems?: number;
  title?: string;
}

function getEventIcon(event: SystemEvent) {
  switch (event.type) {
    case 'agent_created':
      return <Bot className="w-3.5 h-3.5" />;
    case 'agent_status_changed':
      return <Sparkles className="w-3.5 h-3.5" />;
    case 'agent_action':
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'transaction':
      return <ArrowUpRight className="w-3.5 h-3.5" />;
    case 'balance_changed':
      return <ArrowDownLeft className="w-3.5 h-3.5" />;
    case 'system_error':
      return <XCircle className="w-3.5 h-3.5" />;
    default:
      return <Circle className="w-3.5 h-3.5" />;
  }
}

function getEventTitle(event: SystemEvent): string {
  switch (event.type) {
    case 'agent_created':
      return 'Agent created';
    case 'agent_status_changed':
      return 'Agent status changed';
    case 'agent_action':
      return 'Agent action';
    case 'transaction':
      return 'Transaction';
    case 'balance_changed':
      return 'Balance changed';
    case 'system_error':
      return 'System error';
  }
}

function getEventDetail(event: SystemEvent): string | null {
  switch (event.type) {
    case 'agent_created':
      return `Agent: ${(event as any).agent?.name || 'Unknown'}`;
    case 'agent_status_changed':
      return `Status: ${(event as any).previousStatus} → ${(event as any).newStatus}`;
    case 'agent_action':
      return (event as any).action || null;
    case 'transaction':
      return `Tx: ${(event as any).transaction?.signature?.slice(0, 20)}...`;
    case 'balance_changed':
      return `Balance updated`;
    case 'system_error':
      return (event as any).error || null;
    default:
      return null;
  }
}

function getEventStatusIcon(event: SystemEvent) {
  return null;
}

export function ActivityFeed({
  events: propEvents,
  maxItems = 15,
  title = 'Recent Activity',
}: ActivityFeedProps) {
  const { events: wsEvents, connected } = useWebSocket();
  const { events: restEvents } = useEvents(50, 10000);

  // Use prop events first, then WebSocket events, fall back to REST polling
  const events = propEvents ?? (wsEvents.length > 0 ? wsEvents : restEvents);
  const displayEvents = events.slice(0, maxItems);

  return (
    <div className="bg-gradient-to-br from-slate-800/20 to-slate-900/20 border border-slate-700/50 rounded-lg p-5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
        <div className="flex items-center gap-2">
          <span
            className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-cyan-500' : 'bg-red-500')}
          />
          <span className="text-xs text-slate-400">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0.5 max-h-[360px] overflow-y-auto scrollbar-hide">
        <AnimatePresence initial={false}>
          {displayEvents.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-slate-700/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">No activity yet</p>
            </div>
          ) : (
            displayEvents.map((event) => {
              const detail = getEventDetail(event);
              const statusIcon = getEventStatusIcon(event);
              const eventKey = event.timestamp + event.type; // Use timestamp + type as key

              return (
                <motion.div
                  key={eventKey}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="list-item py-3 -mx-2 px-2"
                >
                  {/* Icon */}
                  <div className="w-7 h-7 rounded-md bg-slate-700/30 flex items-center justify-center text-slate-400 flex-shrink-0">
                    {getEventIcon(event)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-50">{getEventTitle(event)}</span>
                      {statusIcon}
                    </div>
                    {detail && <p className="text-xs text-slate-400 truncate mt-0.5">{detail}</p>}
                  </div>

                  {/* Time */}
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
