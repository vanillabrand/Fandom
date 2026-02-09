import React, { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, PoundSterling, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.js';

interface BalanceWarningProps {
    estimatedCost: number;
    onProceed?: () => void;
    onCancel?: () => void;
}

export const BalanceWarning: React.FC<BalanceWarningProps> = ({ estimatedCost, onProceed, onCancel }) => {
    const { token, user, refreshProfile } = useAuth();
    const [balance, setBalance] = useState<number | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadBalance();
    }, []);

    const loadBalance = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/user/balance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
            }
            // Also refresh global profile logic
            refreshProfile();
        } catch (error) {
            console.error('Failed to load balance:', error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    if (loading || balance === null) {
        return (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-400 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                    Checking balance...
                </div>
            </div>
        );
    }

    const isAdmin = user?.role === 'admin';
    const hasEnoughBalance = (balance !== null && balance >= estimatedCost) || isAdmin;
    const remainingBalance = balance !== null ? balance - estimatedCost : 0;

    if (!hasEnoughBalance) {
        return (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="text-red-400" size={20} />
                    <span className="text-red-400 font-bold text-sm">Insufficient Balance</span>

                    <button
                        onClick={loadBalance}
                        disabled={isRefreshing}
                        className="ml-auto text-xs flex items-center gap-1 text-red-400/70 hover:text-red-400 transition-colors"
                    >
                        <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Your Balance:</span>
                        <span className="text-white font-mono">£{balance?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Required:</span>
                        <span className="text-red-400 font-mono font-bold">£{estimatedCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-red-500/20 pt-2">
                        <span className="text-gray-400">Shortfall:</span>
                        <span className="text-red-400 font-mono font-bold">£{(estimatedCost - (balance || 0)).toFixed(2)}</span>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-red-950/30 rounded border border-red-500/20">
                    <div className="text-xs text-red-300 mb-2">
                        <strong>Top up your balance to continue:</strong>
                    </div>
                    <div className="text-xs text-gray-400">
                        Go to <strong className="text-white">Profile → Overview</strong> to add funds with a promo code.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`rounded-lg p-4 mb-4 ${isAdmin ? 'bg-purple-900/20 border border-purple-500/30' : 'bg-emerald-900/20 border border-emerald-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
                {isAdmin ? <ShieldCheck className="text-purple-400" size={20} /> : <PoundSterling className="text-emerald-400" size={20} />}
                <span className={`font-bold text-sm ${isAdmin ? 'text-purple-400' : 'text-emerald-400'}`}>
                    {isAdmin ? 'Admin Override Active' : 'Balance Check'}
                </span>

                <button
                    onClick={loadBalance}
                    disabled={isRefreshing}
                    className={`ml-auto text-xs flex items-center gap-1 transition-colors ${isAdmin ? 'text-purple-400/70 hover:text-purple-400' : 'text-emerald-400/70 hover:text-emerald-400'}`}
                >
                    <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-400">Current Balance:</span>
                    <span className="text-white font-mono">£{balance?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Estimated Cost:</span>
                    <span className="text-orange-400 font-mono">£{estimatedCost.toFixed(2)}</span>
                </div>
                {!isAdmin && (
                    <div className="flex justify-between border-t border-emerald-500/20 pt-2">
                        <span className="text-gray-400">Balance After:</span>
                        <span className="text-emerald-400 font-mono font-bold">£{remainingBalance.toFixed(2)}</span>
                    </div>
                )}
                {isAdmin && (
                    <div className="flex justify-between border-t border-purple-500/20 pt-2">
                        <span className="text-gray-400">Cost Status:</span>
                        <span className="text-purple-400 font-mono font-bold">WAIVED (Admin)</span>
                    </div>
                )}
            </div>

            {!isAdmin ? (
                <div className="mt-4 p-3 bg-emerald-950/30 rounded border border-emerald-500/20 flex items-center gap-2">
                    <TrendingUp className="text-emerald-400 shrink-0" size={16} />
                    <div className="text-xs text-emerald-300">
                        You have sufficient balance to proceed with this query.
                    </div>
                </div>
            ) : (
                <div className="mt-4 p-3 bg-purple-950/30 rounded border border-purple-500/20 flex items-center gap-2">
                    <ShieldCheck className="text-purple-400 shrink-0" size={16} />
                    <div className="text-xs text-purple-300">
                        Cost check bypassed for administrator account.
                    </div>
                </div>
            )}
        </div>
    );
};
