/**
 * src/components/ErrorBoundary.tsx
 *
 * Purpose: React ErrorBoundary wrapper that prevents rendering errors in a
 * single widget from crashing the entire app. Catches errors and displays a
 * compact fallback UI with an optional retry.
 *
 * Exports: default ErrorBoundary class component
 */
import React, { Component, ReactNode } from 'react';
interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    /**
     * Called when an error occurs during rendering
     * Updates state to show error UI
     */
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error
        };
    }

    /**
     * Called after an error has been thrown by a descendant component
     * Logs error details for debugging
     */
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Widget ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // Show custom fallback UI if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI with retry functionality
            return (
                <div className="p-4 text-red-500 bg-red-50 rounded border border-red-200 m-2">
                    <div className="font-medium text-sm">⚠️ Widget Error</div>
                    <div className="text-xs mt-1 text-red-400">
                        {this.state.error?.message || 'Something went wrong'}
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                    >
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;