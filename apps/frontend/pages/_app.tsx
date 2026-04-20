import type { AppProps } from 'next/app';
import { Syne, Space_Mono } from 'next/font/google';
import { ErrorBoundary } from '@/components';
import '@/styles/globals.css';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '700'],
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${syne.variable} ${spaceMono.variable} font-sans`}>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </main>
  );
}
