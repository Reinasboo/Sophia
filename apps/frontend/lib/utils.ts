/**
 * Frontend Utilities
 */

import { clsx, type ClassValue } from 'clsx';

// Classname utility
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

// Format SOL amount
export function formatSol(amount: number, decimals: number = 4): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Truncate address
export function truncateAddress(
  address: string,
  startChars: number = 4,
  endChars: number = 4
): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Format timestamp
export function formatTimestamp(timestamp: string | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Format relative time
export function formatRelativeTime(timestamp: string | Date | undefined | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHour < 24) {
    return `${diffHour}h ago`;
  } else {
    return `${diffDay}d ago`;
  }
}

// Format uptime
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Get status color - muted, non-harsh colors
export function getStatusColor(status: string): string {
  switch (status) {
    case 'idle':
      return 'text-status-idle';
    case 'thinking':
      return 'text-secondary-500';
    case 'executing':
      return 'text-status-warning';
    case 'waiting':
      return 'text-status-info';
    case 'error':
      return 'text-status-error';
    case 'stopped':
      return 'text-text-muted';
    case 'confirmed':
    case 'finalized':
      return 'text-status-success';
    case 'pending':
    case 'submitted':
      return 'text-status-warning';
    case 'failed':
      return 'text-status-error';
    default:
      return 'text-text-secondary';
  }
}

// Get status badge class - subtle, muted badges
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'idle':
      return 'badge-idle';
    case 'thinking':
      return 'badge-info';
    case 'executing':
      return 'badge-warning';
    case 'confirmed':
    case 'finalized':
      return 'badge-success';
    case 'waiting':
    case 'pending':
    case 'submitted':
      return 'badge-info';
    case 'error':
    case 'failed':
      return 'badge-error';
    case 'stopped':
    default:
      return 'badge-neutral';
  }
}

// Copy to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Get Solana explorer URL
export function getExplorerUrl(signature: string, network: string = 'mainnet-beta'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

// Get strategy display name
export function getStrategyDisplayName(strategy: string): string {
  switch (strategy) {
    case 'accumulator':
      return 'Accumulator';
    case 'distributor':
      return 'Distributor';
    case 'trader':
      return 'Trader';
    case 'custom':
      return 'Custom';
    default:
      return strategy;
  }
}

// Get strategy description
export function getStrategyDescription(strategy: string): string {
  switch (strategy) {
    case 'accumulator':
      return 'Automatically requests airdrops to maintain balance';
    case 'distributor':
      return 'Distributes SOL to configured recipients';
    case 'trader':
      return 'Executes trades based on market conditions';
    case 'custom':
      return 'Custom strategy with user-defined logic';
    default:
      return '';
  }
}
