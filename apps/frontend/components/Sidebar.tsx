'use client';

/**
 * Navigation Sidebar Component
 *
 * Quiet, minimal sidebar that doesn't compete with content.
 * Navigation is present but unobtrusive.
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import {
  LayoutDashboard,
  Bot,
  ArrowRightLeft,
  Plug,
  ScrollText,
  Layers,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Agents',
    href: '/agents',
    icon: Bot,
  },
  {
    name: 'Connected Agents',
    href: '/connected-agents',
    icon: Plug,
  },
  {
    name: 'Register BYOA',
    href: '/byoa-register',
    icon: UserPlus,
  },
  {
    name: 'Strategies',
    href: '/strategies',
    icon: Layers,
  },
  {
    name: 'Intent History',
    href: '/intent-history',
    icon: ScrollText,
  },
  {
    name: 'Transactions',
    href: '/transactions',
    icon: ArrowRightLeft,
  },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = router.pathname;
  const { authenticated } = usePrivy();
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'mainnet-beta';
  const networkLabel = network === 'mainnet-beta' ? 'Solana Mainnet' : `Solana ${network}`;

  const handleRegisterClick = (e: React.MouseEvent) => {
    if (!authenticated) {
      e.preventDefault();
      router.push('/landing#auth');
      return;
    }
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-black border-r border-primary/20 flex flex-col backdrop-blur-xl">
      {/* Logo */}
      <div className="h-18 flex items-center px-6 pt-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand-accent flex items-center justify-center transition-all group-hover:shadow-lg group-hover:shadow-primary/50">
            <span className="text-black font-bold text-lg">Ⓢ</span>
          </div>
          <div>
            <span className="font-bold text-sm text-white group-hover:text-primary transition-colors">
              Sophia
            </span>
            <span className="block text-xs text-text-secondary">Agentic Wallet</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-8 px-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            const isRegisterLink = item.href === '/byoa-register';
            const isDisabled = isRegisterLink && !authenticated;

            return (
              <li key={item.href}>
                <Link
                  href={isRegisterLink && !authenticated ? '#' : item.href}
                  onClick={isRegisterLink ? handleRegisterClick : undefined}
                  className={cn(
                    'nav-link relative',
                    isActive && 'nav-link-active',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full"
                      initial={false}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'w-[18px] h-[18px]',
                      isActive ? 'text-primary' : 'text-text-secondary'
                    )}
                  />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer - Network indicator, very subtle */}
      <div className="p-4 mx-4 mb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span>{networkLabel}</span>
        </div>
      </div>
    </aside>
  );
}
