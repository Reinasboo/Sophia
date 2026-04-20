'use client';

/**
 * Empty State Component
 *
 * Consolidates repeated empty state UI pattern across pages.
 * Provides consistent layout and messaging for no-data scenarios.
 */

import { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  title = 'No items found',
  description = 'Try adjusting your search or filters',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      {icon && <div className="flex justify-center mb-4">{icon}</div>}
      <p className="text-slate-400 mb-2">{title}</p>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 rounded-lg transition-all inline-flex items-center gap-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
