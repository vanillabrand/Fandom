import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, BarChart3, Calendar } from 'lucide-react';

interface AccuracyMetrics {
    timeRange: number;
    overall: {
        averageQuality: number;
        averageConfidence: number;
        totalQueries: number;
        helpfulPercentage: number;
        commonIssues: { issue: string; count: number }[];
    };
    daily: {
        date: string;
        avgQuality: number;
        avgConfidence: number;
        totalQueries: number;
    }[];
    qualityDistribution: {
        high: number;
        good: number;
        low: number;
    };
    topIssues: { issue: string; count: number }[];
}

export const AccuracyMetricsDashboard: React.FC = () => {
    const { user, token } = useAuth();
    const [metrics, setMetrics] = useState<AccuracyMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('30'); // days

    useEffect(() => {
        loadMetrics();
    }, [timeRange]);

    const loadMetrics = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/admin/accuracy-metrics?timeRange=${timeRange}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to load metrics');

            const data = await response.json();
            setMetrics(data);
        } catch (error) {
            console.error('Failed to load accuracy metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading accuracy metrics...</div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-red-400">Failed to load metrics</div>
            </div>
        );
    }

    const getTrendIcon = (current: number, threshold: number) => {
        if (current >= threshold) {
            return <TrendingUp className="w-5 h-5 text-green-500" />;
        }
        return <TrendingDown className="w-5 h-5 text-red-500" />;
    };

    const getQualityColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        return 'text-red-500';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Query Accuracy Metrics</h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Track query quality and confidence over time
                    </p>
                </div>

                {/* Time Range Selector */}
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                    </select>
                </div>
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Avg Quality</span>
                        {getTrendIcon(metrics.overall.averageQuality, 75)}
                    </div>
                    <div className={`text-3xl font-bold ${getQualityColor(metrics.overall.averageQuality)}`}>
                        {metrics.overall.averageQuality}/100
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {metrics.overall.totalQueries} queries
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Avg Confidence</span>
                        {getTrendIcon(metrics.overall.averageConfidence, 70)}
                    </div>
                    <div className={`text-3xl font-bold ${getQualityColor(metrics.overall.averageConfidence)}`}>
                        {metrics.overall.averageConfidence}/100
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        System confidence
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Helpful Rate</span>
                        {getTrendIcon(metrics.overall.helpfulPercentage, 80)}
                    </div>
                    <div className="text-3xl font-bold text-blue-500">
                        {metrics.overall.helpfulPercentage}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        User satisfaction
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Total Queries</span>
                        <BarChart3 className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="text-3xl font-bold text-white">
                        {metrics.overall.totalQueries}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        Last {timeRange} days
                    </div>
                </div>
            </div>

            {/* Quality Distribution */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Quality Distribution</h3>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-gray-400 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                High Quality (80+)
                            </span>
                            <span className="text-sm font-semibold text-white">
                                {metrics.qualityDistribution.high} queries
                            </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{
                                    width: `${(metrics.qualityDistribution.high / metrics.overall.totalQueries) * 100}%`
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-gray-400 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-yellow-500" />
                                Good Quality (60-79)
                            </span>
                            <span className="text-sm font-semibold text-white">
                                {metrics.qualityDistribution.good} queries
                            </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-yellow-500 h-2 rounded-full"
                                style={{
                                    width: `${(metrics.qualityDistribution.good / metrics.overall.totalQueries) * 100}%`
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2">
                            <span className="text-sm text-gray-400 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                                Low Quality (\u003c60)
                            </span>
                            <span className="text-sm font-semibold text-white">
                                {metrics.qualityDistribution.low} queries
                            </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-red-500 h-2 rounded-full"
                                style={{
                                    width: `${(metrics.qualityDistribution.low / metrics.overall.totalQueries) * 100}%`
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Daily Trend Chart */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Daily Trends</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-700">
                                <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                                <th className="text-right py-3 px-4 text-gray-400 font-medium">Queries</th>
                                <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg Quality</th>
                                <th className="text-right py-3 px-4 text-gray-400 font-medium">Avg Confidence</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.daily.slice(-14).reverse().map((day, idx) => (
                                <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                    <td className="py-3 px-4 text-white">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-300">
                                        {day.totalQueries}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-semibold ${getQualityColor(day.avgQuality)}`}>
                                        {day.avgQuality}
                                    </td>
                                    <td className={`py-3 px-4 text-right font-semibold ${getQualityColor(day.avgConfidence)}`}>
                                        {day.avgConfidence}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Top Issues */}
            {metrics.topIssues.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Common Issues</h3>
                    <div className="space-y-3">
                        {metrics.topIssues.map((issue, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <span className="text-sm text-gray-300">
                                    {issue.issue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                                <span className="text-sm font-semibold text-red-400">
                                    {issue.count} reports
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
