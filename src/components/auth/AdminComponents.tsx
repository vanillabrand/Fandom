import React from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isLoading } = useAuth();
    // Use isLoading instead of loading to match context

    if (isLoading) {
        return <div className="h-screen w-full flex items-center justify-center bg-[#050B14] text-emerald-500">
            <Loader2 className="animate-spin" />
        </div>;
    }

    if (!user || user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export const PendingApproval: React.FC = () => {
    const { logout } = useAuth();

    return (
        <div className="min-h-screen bg-[#050B14] flex flex-col items-center justify-center p-4 text-center">
            <div className="max-w-md w-full bg-[#0A1625] border border-emerald-500/20 rounded-2xl p-8 space-y-6">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto">
                    <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
                </div>

                <h2 className="text-2xl font-bold text-white">Account Pending Approval</h2>

                <p className="text-gray-400">
                    Your account is currently under review by our administrators.
                    You will receive an email once your access is approved.
                </p>

                <div className="pt-4 border-t border-emerald-900/30">
                    <button
                        onClick={logout}
                        className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                        Sign out and try again later
                    </button>
                </div>
            </div>
        </div>
    );
};
