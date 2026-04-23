'use client';

import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary - Catch and display errors gracefully
 * Prevents single component error from crashing entire app
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-300 flex-shrink-0" />
                  <h2 className="text-lg font-semibold text-red-300">Something went wrong</h2>
                </div>

                <p className="text-sm text-red-200 mb-4">
                  An unexpected error occurred. Please try again or contact support if the problem
                  persists.
                </p>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mb-4 text-xs">
                    <summary className="cursor-pointer text-red-300/70 hover:text-red-300 font-mono">
                      Error Details
                    </summary>
                    <pre className="mt-2 p-2 bg-slate-800/50 rounded border border-red-500/20 text-red-200/70 overflow-auto max-h-32">
                      {this.state.error.toString()}
                    </pre>
                  </details>
                )}

                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500/30 hover:border-red-500/50 text-red-300 hover:text-red-200 rounded-lg transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
