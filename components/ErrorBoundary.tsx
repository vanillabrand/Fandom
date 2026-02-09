import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#1a0b2e] flex items-center justify-center p-4 text-white font-sans">
                    <div className="max-w-2xl w-full bg-[#2d1b4e] border border-red-500/30 rounded-2xl p-8 shadow-2xl">
                        <div className="flex items-center gap-4 mb-6 text-red-400">
                            <AlertCircle className="w-12 h-12" />
                            <h1 className="text-2xl font-bold">Something went wrong</h1>
                        </div>

                        <div className="bg-black/30 rounded-lg p-4 font-mono text-sm overflow-auto max-h-96 border border-emerald-500/20">
                            <p className="text-red-300 font-bold mb-2">{this.state.error?.toString()}</p>
                            <pre className="text-gray-400 whitespace-pre-wrap">
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors"
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

export default ErrorBoundary;
