import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { TrendingUp, DollarSign, Users, Activity, Download, Calendar } from 'lucide-react';

interface UserAnalytics {
    userId: string;
    email: string;
    name: string;
    status: string;
    balance: number;
    revenue: number;
    cost: number;
    profit: number;
    queryCount: number;
    breakdown: Record<string, { count: number; revenue: number; cost: number }>;
}

interface Analytics {
    month: string;
    totals: {
        revenue: number;
        costs: number;
        profit: number;
        queries: number;
        activeUsers: number;
        baseSubscriptionRevenue: number;
    };
    users: UserAnalytics[];
}

export const AdminAnalyticsDashboard = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

    useEffect(() => {
        loadAnalytics();
    }, [selectedMonth]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/analytics?month=${selectedMonth}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAnalytics(data);
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = () => {
        if (!analytics) return;

        const headers = ['Email', 'Status', 'Balance', 'Revenue', 'Cost', 'Profit', 'Queries', 'Margin'];
        const rows = analytics.users.map(u => [
            u.email,
            u.status,
            `£${u.balance.toFixed(2)}`,
            `£${u.revenue.toFixed(2)}`,
            `£${u.cost.toFixed(2)}`,
            `£${u.profit.toFixed(2)}`,
            u.queryCount,
            u.cost > 0 ? `${((u.revenue / u.cost) * 100).toFixed(0)}%` : 'N/A'
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${selectedMonth}.csv`;
        a.click();
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

    if (loading || !analytics) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    const monthName = new Date(selectedMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-purple-400">Usage Analytics</h2>
                    <p className="text-sm text-emerald-500/60">Revenue, costs, and profitability insights</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                    />
                    <button
                        onClick={exportCSV}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-bold flex items-center gap-2"
                    >
                        <Download size={14} />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 rounded-xl border border-emerald-500/30 p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-emerald-500/60 uppercase">Total Revenue</div>
                        <DollarSign className="text-emerald-400" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-emerald-400">£{analytics.totals.revenue.toFixed(2)}</div>
                    <div className="text-xs text-emerald-500/50 mt-1">Base: £{analytics.totals.baseSubscriptionRevenue.toFixed(2)} + Usage</div>
                </div>

                <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/10 rounded-xl border border-orange-500/30 p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-orange-500/60 uppercase">Total Costs</div>
                        <Activity className="text-orange-400" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-orange-400">£{analytics.totals.costs.toFixed(2)}</div>
                    <div className="text-xs text-orange-500/50 mt-1">API & Infrastructure</div>
                </div>

                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/10 rounded-xl border border-purple-500/30 p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-purple-500/60 uppercase">Net Profit</div>
                        <TrendingUp className="text-purple-400" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-purple-400">£{analytics.totals.profit.toFixed(2)}</div>
                    <div className="text-xs text-purple-500/50 mt-1">
                        {analytics.totals.costs > 0 ? `${((analytics.totals.profit / analytics.totals.costs) * 100).toFixed(0)}% margin` : 'N/A'}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 rounded-xl border border-blue-500/30 p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-blue-500/60 uppercase">Active Users</div>
                        <Users className="text-blue-400" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-blue-400">{analytics.totals.activeUsers}</div>
                    <div className="text-xs text-blue-500/50 mt-1">{analytics.totals.queries} total queries</div>
                </div>
            </div>

            {/* User Table */}
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-900/30">
                    <h3 className="text-sm font-bold text-white">User Breakdown - {monthName}</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#051810]">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-emerald-500/60 uppercase">User</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-emerald-500/60 uppercase">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Balance</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Queries</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Revenue</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Cost</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Profit</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-500/60 uppercase">Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-900/30">
                            {analytics.users.map((user) => (
                                <tr key={user.userId} className="hover:bg-emerald-900/10">
                                    <td className="px-4 py-3">
                                        <div className="text-sm text-white font-medium">{user.name}</div>
                                        <div className="text-xs text-emerald-500/50">{user.email}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded ${user.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' :
                                                user.status === 'pending' ? 'bg-orange-900/50 text-orange-400' :
                                                    'bg-red-900/50 text-red-400'
                                            }`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-white font-mono">
                                        £{user.balance.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-white">
                                        {user.queryCount}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-emerald-400 font-mono">
                                        £{user.revenue.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-orange-400 font-mono">
                                        £{user.cost.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-purple-400 font-mono font-bold">
                                        £{user.profit.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-white font-mono">
                                        {user.cost > 0 ? `${((user.revenue / user.cost) * 100).toFixed(0)}%` : 'N/A'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
