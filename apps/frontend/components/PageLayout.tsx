'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header as PageHeader } from './Header';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageLayout({ children, title, subtitle, actions }: PageLayoutProps) {
  return (
    <div className="flex min-h-screen bg-black text-white">
      <Sidebar />

      <main className="flex-1 ml-60 flex flex-col">
        {title && <PageHeader title={title} subtitle={subtitle} />}

        <div className="flex-1 overflow-auto">
          <div className="p-8 lg:p-12">{children}</div>
        </div>
      </main>
    </div>
  );
}
