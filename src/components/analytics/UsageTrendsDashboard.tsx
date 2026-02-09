import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';

interface UsageTrend {
    date: string;
    queryCount: number;
    totalCharged: number;
    avgQueryCost: number;
    featureBreakdown: Record<string, { count: number; cost: number }>;
}

export const UsageTrendsDashboard = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [trends, setTrends] = useState<UsageTrend[]>([]);
    const [period, setPeriod] = useState<'30d' | '90d' | '12m'>('30d');

    useEffect(() => {
        loadTrends();
    }, [period]);

    const loadTrends = async () => {
        setLoading(true);
        try {
            const months = period === '30d' ? 1 : period === '90d' ? 3 : 12;
            const res = await fetch(`/api/user/analytics/trends?months=${months}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTrends(data.trends || []);
            }
        } catch (error) {
            console.error('Failed to load trends:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-6">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>
            </div>
        );
    }

    // Calculate stats
    const totalQueries = trends.reduce((sum, t) => sum + t.queryCount, 0);
    const totalSpent = trends.reduce((sum, t) => sum + t.totalCharged, 0);
    const avgCost = totalQueries > 0 ? totalSpent / totalQueries : 0;

    // Calculate trend (last 7 days vs previous 7 days)
    const last7Days = trends.slice(-7);
    const prev7Days = trends.slice(-14, -7);
    const last7Total = last7Days.reduce((sum, t) => sum + t.totalCharged, 0);
    const prev7Total = prev7Days.reduce((sum, t) => sum + t.totalCharged, 0);
    const trendPercent = prev7Total > 0 ? ((last7Total - prev7Total) / prev7Total) * 100 : 0;

    // Aggregate feature usage
    const featureTotals: Record<string, { count: number; cost: number }> = {};
    trends.forEach(trend => {
        Object.entries(trend.featureBreakdown || {}).forEach(([feature, data]) => {
            if (!featureTotals[feature]) {
                featureTotals[feature] = { count: 0, cost: 0 };
            }
            featureTotals[feature].count += data.count;
            featureTotals[feature].cost += data.cost;
        });
    });

    const featureData = Object.entries(featureTotals).map(([name, data]) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        queries: data.count,
        cost: data.cost
    }));

    // Format data for line chart
    const chartData = trends.map(t => ({
        date: new Date(t.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
        queries: t.queryCount,
        cost: t.totalCharged
    }));

    return (
        <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-emerald-900/30 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white">Usage Trends</h3>
                    <p className="text-sm text-emerald-500/60">Your activity over time</p>
                </div>
                <div className="flex gap-2">
                    {(['30d', '90d', '12m'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1 text-xs font-bold rounded ${period === p
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-[#051810] text-emerald-500/60 hover:text-emerald-400'
                                }`}
                        >
                            {p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : '12 Months'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-emerald-900/30">
                <div className="bg-[#051810] rounded-lg p-4">
                    <div className="text-xs text-emerald-500/60 font-bold uppercase mb-1">Total Queries</div>
                    <div className="text-2xl font-bold text-white">{totalQueries}</div>
                </div>
                <div className="bg-[#051810] rounded-lg p-4">
                    <div className="text-xs text-emerald-500/60 font-bold uppercase mb-1">Total Spent</div>
                    <div className="text-2xl font-bold text-emerald-400">£{totalSpent.toFixed(2)}</div>
                </div>
                <div className="bg-[#051810] rounded-lg p-4">
                    <div className="text-xs text-emerald-500/60 font-bold uppercase mb-1">Avg. Cost/Query</div>
                    <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold text-white">£{avgCost.toFixed(2)}</div>
                        {trendPercent !== 0 && (
                            <div className={`flex items-center text-xs ${trendPercent > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {trendPercent > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {Math.abs(trendPercent).toFixed(0)}%
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Chart */}
            {chartData.length > 0 ? (
                <div className="p-6 space-y-6">
                    {/* Line Chart - Daily Activity */}
                    <div>
                        <h4 className="text-sm font-bold text-emerald-400 mb-4">Daily Activity</h4>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1a4d2e" />
                                <XAxis dataKey="date" stroke="#4ade80" style={{ fontSize: 12 }} />
                                <YAxis stroke="#4ade80" style={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0a1f16', border: '1px solid #4ade80' }}
                                    labelStyle={{ color: '#4ade80' }}
                                />
                                <Line type="monotone" dataKey="queries" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Bar Chart - Feature Breakdown */}
                    {featureData.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-emerald-400 mb-4">Feature Breakdown</h4>
                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart data={featureData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1a4d2e" />
                                    <XAxis dataKey="name" stroke="#4ade80" style={{ fontSize: 12 }} />
                                    <YAxis stroke="#4ade80" style={{ fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0a1f16', border: '1px solid #4ade80' }}
                                        labelStyle={{ color: '#4ade80' }}
                                    />
                                    <Bar dataKey="cost" fill="#10b981" label={{ position: 'top', fill: '#4ade80', fontSize: 10 }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-12 text-center text-emerald-500/60">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No usage data for this period</p>
                    <p className="text-xs mt-2">Run some queries to see your trends!</p>
                </div>
            )}
        </div>
    );
};
