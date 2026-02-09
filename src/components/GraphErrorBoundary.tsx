import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary for 3D Graph Component
 * Catches WebGL and Three.js errors to prevent full app crashes
 */
class GraphErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[GraphErrorBoundary] 3D Graph Error:', error, errorInfo);

        // Log to monitoring service if available
        if ((window as any).errorLogger) {
            (window as any).errorLogger.log({
                type: '3D_GRAPH_ERROR',
                error: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack
            });
        }
    }

    render() {
        if (this.state.hasError) {
            // Custom fallback or default error UI
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="w-full h-full bg-[#051810] flex items-center justify-center">
                    <div className="bg-black/60 backdrop-blur border border-red-500/30 p-8 rounded-xl text-center max-w-md">
                        <div className="text-red-400 font-bold text-lg mb-3">
                            3D Visualization Error
                        </div>
                        <div className="text-red-500/70 text-sm mb-4">
                            {this.state.error?.message || 'Failed to render 3D graph'}
                        </div>
                        <div className="text-emerald-500/60 text-xs mb-4">
                            This may be due to:
                            <ul className="list-disc list-inside mt-2 text-left">
                                <li>WebGL context limit reached</li>
                                <li>Graphics driver issues</li>
                                <li>Insufficient GPU memory</li>
                            </ul>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 px-4 py-2 rounded border border-emerald-500/30 transition-colors"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default GraphErrorBoundary;
