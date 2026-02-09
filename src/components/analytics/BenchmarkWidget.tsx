import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Award, TrendingUp, Users } from 'lucide-react';

interface Benchmark {
    userRank: number;
    avgQueries: number;
    userQueries: number;
    avgCostPerQuery: number;
    userCostPerQuery: number;
}

export const BenchmarkWidget = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [benchmark, setBenchmark] = useState<Benchmark | null>(null);

    useEffect(() => {
        loadBenchmark();
    }, []);

    const loadBenchmark = async () => {
        try {
            const res = await fetch('/api/user/analytics/benchmark', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBenchmark(data);
            }
        } catch (error) {
            console.error('Failed to load benchmark:', error);
        } finally {
            setLoading(false);
        }
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

    if (!benchmark) return null;

    const getRankEmoji = (rank: number) => {
        if (rank >= 75) return '🔥';
        if (rank >= 50) return '⭐';
        if (rank >= 25) return '✨';
        return '📊';
    };

    const getRankLabel = (rank: number) => {
        if (rank >= 75) return 'Top 25%';
        if (rank >= 50) return 'Top 50%';
        if (rank >= 25) return 'Top 75%';
        return 'Active User';
    };

    const queryDiff = benchmark.userQueries - benchmark.avgQueries;
    const costDiff = benchmark.userCostPerQuery - benchmark.avgCostPerQuery;

    return (
        <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-900/30">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Award className="text-yellow-400" size={20} />
                    How You Compare
                </h3>
                <p className="text-sm text-emerald-500/60">Anonymous benchmarking</p>
            </div>

            <div className="p-6 space-y-4">
                {/* Rank */}
                <div className="text-center pb-4 border-b border-emerald-900/30">
                    <div className="text-4xl mb-2">{getRankEmoji(benchmark.userRank)}</div>
                    <div className="text-xl font-bold text-emerald-400">{getRankLabel(benchmark.userRank)}</div>
                    <p className="text-xs text-gray-400 mt-1">Percentile: {benchmark.userRank}%</p>
                </div>

                {/* Usage Rank Indicator */}
                <div>
                    <div className="text-xs text-gray-400 mb-2">Usage Activity</div>
                    <div className="relative h-2 bg-[#051810] rounded-full overflow-hidden">
                        <div
                            className="absolute h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                            style={{ width: `${benchmark.userRank}%` }}
                        />
                        <div
                            className="absolute h-4 w-4 bg-white border-2 border-emerald-400 rounded-full -mt-1"
                            style={{ left: `${benchmark.userRank}%`, marginLeft: '-8px' }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Queries Comparison */}
                <div className="bg-[#051810] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-400">Queries/Month</div>
                        <Users size={14} className="text-emerald-500" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-white">{benchmark.userQueries}</span>
                        <span className="text-sm text-gray-500">vs avg {benchmark.avgQueries}</span>
                    </div>
                    {queryDiff !== 0 && (
                        <div className={`text-xs mt-1 ${queryDiff > 0 ? 'text-emerald-400' : 'text-gray-400'}`}>
                            {queryDiff > 0 ? '+' : ''}{queryDiff} ({Math.abs(queryDiff / benchmark.avgQueries * 100).toFixed(0)}%)
                        </div>
                    )}
                </div>

                {/* Cost Efficiency */}
                <div className="bg-[#051810] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-400">Cost per Query</div>
                        <TrendingUp size={14} className="text-orange-500" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold text-white">£{benchmark.userCostPerQuery.toFixed(2)}</span>
                        <span className="text-sm text-gray-500">vs avg £{benchmark.avgCostPerQuery.toFixed(2)}</span>
                    </div>
                    {costDiff !== 0 && (
                        <div className={`text-xs mt-1 ${costDiff < 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {costDiff < 0 ? '✅ ' : ''}
                            {costDiff > 0 ? '+' : ''}£{costDiff.toFixed(2)}
                            {costDiff < 0 ? ' more efficient' : ' higher'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
