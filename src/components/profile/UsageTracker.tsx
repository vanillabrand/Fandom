import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { TrendingUp, TrendingDown, Activity, Calendar, PoundSterling } from 'lucide-react';

interface UsageLog {
    timestamp: string;
    action: string;
    description: string;
    chargedAmount: number;
}

export const UsageTracker = () => {
    const { token, user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [monthlyUsage, setMonthlyUsage] = useState<UsageLog[]>([]);
    const [totalUsage, setTotalUsage] = useState(0);

    useEffect(() => {
        loadBalanceAndUsage();
    }, []);

    const loadBalanceAndUsage = async () => {
        setLoading(true);
        try {
            // Load balance
            const balanceRes = await fetch('/api/user/balance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (balanceRes.ok) {
                const balanceData = await balanceRes.json();
                setBalance(balanceData.balance || 0);
            }

            // Load monthly usage
            const usageRes = await fetch('/api/user/usage', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (usageRes.ok) {
                const usageData = await usageRes.json();
                setMonthlyUsage(usageData.logs || []);
                setTotalUsage(usageData.total || 0);
            }
        } catch (error) {
            console.error('Failed to load usage data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            query_builder: 'Query Builder',
            quick_map: 'Quick Map',
            deep_search: 'Deep Search',
            batch_analysis: 'Batch Analysis'
        };
        return labels[action] || action;
    };

    const getUsageBreakdown = () => {
        const breakdown: Record<string, { count: number; total: number }> = {};
        monthlyUsage.forEach(log => {
            if (!breakdown[log.action]) {
                breakdown[log.action] = { count: 0, total: 0 };
            }
            breakdown[log.action].count++;
            breakdown[log.action].total += log.chargedAmount;
        });
        return breakdown;
    };

    if (loading) {
        return (
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-6">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                </div>
            </div>
        );
    }

    const breakdown = getUsageBreakdown();
    const currentMonth = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-4">
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-emerald-900/20 to-emerald-800/10 rounded-xl border border-emerald-500/30 p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="text-xs font-bold text-emerald-500/60 uppercase tracking-wider mb-1">Current Balance</div>
                        <div className="flex items-center gap-2">
                            <PoundSterling className="text-emerald-400" size={32} />
                            <div className="text-4xl font-bold text-emerald-400">{balance.toFixed(2)}</div>
                        </div>
                    </div>
                    <Activity className="text-emerald-500/40" size={24} />
                </div>
                <div className="text-xs text-emerald-500/50">
                    Available for queries and searches
                </div>
            </div>

            {/* Monthly Usage Card */}
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="text-orange-400" size={18} />
                        <h3 className="text-sm font-bold text-white">{currentMonth} Usage</h3>
                    </div>
                    <div className="flex items-center gap-1 text-orange-400">
                        <TrendingDown size={16} />
                        <span className="text-xl font-bold">£{totalUsage.toFixed(2)}</span>
                    </div>
                </div>

                {/* Usage Breakdown */}
                {Object.keys(breakdown).length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(breakdown).map(([action, data]) => (
                            <div key={action} className="bg-[#051810] rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-emerald-400">{getActionLabel(action)}</span>
                                    <span className="text-xs text-white font-mono">£{data.total.toFixed(2)}</span>
                                </div>
                                <div className="text-xs text-emerald-500/50">{data.count} {data.count === 1 ? 'use' : 'uses'} this month</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-emerald-500/50 text-sm">
                        No usage this month yet
                    </div>
                )}
            </div>

            {/* Projected Balance */}
            <div className="bg-[#0a1f16] rounded-xl border border-orange-500/20 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="text-orange-400" size={16} />
                        <span className="text-xs font-bold text-orange-400">Balance After Usage</span>
                    </div>
                    <div className="text-lg font-bold text-white">£{(balance - totalUsage).toFixed(2)}</div>
                </div>
            </div>
        </div>
    );
};
