'use client';

/**
 * Page Layout Wrapper
 *
 * Consistent layout for dashboard pages with:
 * - Sidebar navigation
 * - Header with title
 * - Main content area
 * - Proper spacing and structure
 */

import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { LogOut, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageLayout({ children, title, subtitle, actions }: PageLayoutProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-60 bg-gradient-to-b from-slate-950 to-slate-900 border-r border-slate-700/50 flex flex-col z-40">
        {/* Logo */}
        <div className="h-18 flex items-center px-6 pt-6 border-b border-slate-700/50">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center transition-colors group-hover:bg-cyan-500/30">
              <span className="text-cyan-400 font-semibold text-lg">A</span>
            </div>
            <div>
              <span className="font-semibold text-sm text-slate-50">Agentic</span>
              <span className="block text-xs text-slate-400">Wallet</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-8 px-4 overflow-y-auto">
          <ul className="space-y-1">
            {/* Dashboard Overview */}
            <li>
              <Link
                href="/dashboard"
                className={cn(
                  'nav-link',
                  router.pathname === '/dashboard' && 'nav-link-active'
                )}
              >
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            </li>

            {/* Main Navigation */}
            {[
              { name: 'Agents', href: '/agents', icon: '🤖' },
              { name: 'Connected Agents', href: '/connected-agents', icon: '🔌' },
              { name: 'Register BYOA', href: '/byoa-register', icon: '➕' },
              { name: 'Strategies', href: '/strategies', icon: '📊' },
              { name: 'Intent History', href: '/intent-history', icon: '📋' },
              { name: 'Transactions', href: '/transactions', icon: '💱' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'nav-link',
                    router.pathname === item.href && 'nav-link-active'
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border-light">
          <button
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-body text-text-secondary hover:bg-background-secondary hover:text-text-primary transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 flex flex-col">
        {/* Header */}
        {title && (
          <header className="border-b border-border-light bg-surface">
            <div className="px-8 py-8 flex items-start justify-between">
              <div className="space-y-1">
                <motion.h1
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-display text-text-primary"
                >
                  {title}
                </motion.h1>
                {subtitle && <p className="text-body text-text-tertiary">{subtitle}</p>}
              </div>
              {actions && <div>{actions}</div>}
            </div>
          </header>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8 lg:p-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
