'use client';

/**
 * Error Display Component
 *
 * Consolidates repeated error UI pattern across pages.
 * Provides consistent error styling and messaging.
 */

interface ErrorDisplayProps {
  error?: string | null;
  title?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ error, title = 'Error', onRetry }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 backdrop-blur-sm">
      {title && <p className="font-semibold mb-2">{title}</p>}
      <p className="text-sm">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
