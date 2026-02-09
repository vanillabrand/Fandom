import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Lightbulb, TrendingDown, Sparkles, ChevronRight } from 'lucide-react';

interface Insight {
    type: 'cost_optimization' | 'usage_pattern' | 'recommendation';
    title: string;
    description: string;
    potentialSavings?: number;
    actionable: boolean;
    priority: 'high' | 'medium' | 'low';
}

export const InsightsPanel = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState<Insight[]>([]);

    useEffect(() => {
        loadInsights();
    }, []);

    const loadInsights = async () => {
        try {
            const res = await fetch('/api/user/analytics/insights', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInsights(data.insights || []);
            }
        } catch (error) {
            console.error('Failed to load insights:', error);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'cost_optimization': return <TrendingDown className="text-emerald-400" size={20} />;
            case 'recommendation': return <Sparkles className="text-purple-400" size={20} />;
            default: return <Lightbulb className="text-yellow-400" size={20} />;
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'border-red-500/30 bg-red-900/10';
            case 'medium': return 'border-orange-500/30 bg-orange-900/10';
            default: return 'border-blue-500/30 bg-blue-900/10';
        }
    };

    return (
        <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-900/30">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-purple-400" size={20} />
                    Smart Insights
                </h3>
                <p className="text-sm text-emerald-500/60">AI-powered optimization tips</p>
            </div>

            <div className="p-6 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                    </div>
                ) : insights.length > 0 ? (
                    insights.map((insight, idx) => (
                        <div
                            key={idx}
                            className={`rounded-lg border p-4 ${getPriorityColor(insight.priority)}`}
                        >
                            <div className="flex items-start gap-3">
                                {getIcon(insight.type)}
                                <div className="flex-1">
                                    <h4 className="text-white font-semibold text-sm mb-1">{insight.title}</h4>
                                    <p className="text-gray-300 text-xs leading-relaxed">{insight.description}</p>
                                    {insight.potentialSavings && insight.potentialSavings > 0 && (
                                        <div className="mt-2 text-xs">
                                            <span className="text-emerald-400 font-bold">
                                                Potential Savings: £{insight.potentialSavings.toFixed(2)}/month
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {insight.actionable && (
                                    <ChevronRight className="text-emerald-500/50" size={16} />
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-emerald-500/60">
                        <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No insights yet</p>
                        <p className="text-xs mt-1">Run more queries to get personalized tips!</p>
                    </div>
                )}
            </div>
        </div>
    );
};
