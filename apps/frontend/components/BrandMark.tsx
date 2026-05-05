'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type BrandMarkSize = 'sm' | 'md' | 'lg';

interface BrandMarkProps {
  href?: string;
  className?: string;
  size?: BrandMarkSize;
  showLabel?: boolean;
  label?: string;
  sublabel?: string;
}

const SIZE_STYLES: Record<BrandMarkSize, { frame: string; image: number }> = {
  sm: { frame: 'h-10 w-10 rounded-xl', image: 40 },
  md: { frame: 'h-12 w-12 rounded-2xl', image: 48 },
  lg: { frame: 'h-16 w-16 rounded-2xl', image: 64 },
};

export function BrandMark({
  href = '/',
  className,
  size = 'md',
  showLabel = true,
  label = 'Sophia',
  sublabel = 'Autonomous wallet orchestration',
}: BrandMarkProps) {
  const content = (
    <>
      <span
        className={cn(
          'relative shrink-0 overflow-hidden border border-white/10 bg-[#060b1a] shadow-[0_0_30px_rgba(37,99,235,0.22)]',
          SIZE_STYLES[size].frame
        )}
      >
        <Image
          src="/uploads/logo/logo.png"
          alt={`${label} logo`}
          fill
          sizes={`${SIZE_STYLES[size].image}px`}
          className="object-cover"
          priority
        />
      </span>

      {showLabel && (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-white">
            {label}
          </span>
          <span className="text-xs text-text-secondary">{sublabel}</span>
        </span>
      )}
    </>
  );

  if (!href) {
    return <div className={cn('inline-flex items-center gap-3', className)}>{content}</div>;
  }

  return (
    <Link href={href} className={cn('inline-flex items-center gap-3 group', className)}>
      {content}
    </Link>
  );
}