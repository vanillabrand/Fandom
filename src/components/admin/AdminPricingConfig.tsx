import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { DollarSign, TrendingUp, Calculator, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface PricingConfig {
    version: string;
    currency: 'GBP';
    margin: number;
    baseSubscription: number;
    costs: {
        geminiPerToken: number;
        apifyComputeUnit: number;
        apifyProxyPerGB: number;
        scrapingPer1000: number;
        forumScoutPerRecord: number;
        mongodbPerHour: number;
    };
    features: {
        queryBuilder: { basePrice: number; perProfile: number };
        quickMap: { basePrice: number; perProfile: number };
        deepSearch: { basePrice: number };
        batchAnalysis: { basePrice: number; per100: number };
    };
}

export const AdminPricingConfig = () => {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<PricingConfig | null>(null);
    const [saving, setSaving] = useState(false);

    // Load current pricing config
    useEffect(() => {
        loadPricingConfig();
    }, []);

    const loadPricingConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/pricing-config', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
            }
        } catch (error) {
            toast.error('Failed to load pricing config');
        } finally {
            setLoading(false);
        }
    };

    const savePricingConfig = async () => {
        if (!config) return;

        setSaving(true);
        try {
            const res = await fetch('/api/admin/pricing-config', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                toast.success('Pricing configuration updated!');
                loadPricingConfig();
            } else {
                toast.error('Failed to update pricing');
            }
        } catch (error) {
            toast.error('Error saving pricing config');
        } finally {
            setSaving(false);
        }
    };

    // Calculate monthly revenue projection
    const calculateRevenue = (users: number) => {
        if (!config) return 0;

        const baseRevenue = config.baseSubscription * users;
        // Average usage per user (assuming 30 Query Builders/month)
        const avgUsagePerUser = config.features.queryBuilder.basePrice * 30;
        const usageRevenue = avgUsagePerUser * users;

        return baseRevenue + usageRevenue;
    };

    if (loading || !config) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-purple-400">Pricing Configuration</h2>
                    <p className="text-sm text-emerald-500/60">Manage costs, margins, and feature pricing</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadPricingConfig}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Reload
                    </button>
                    <button
                        onClick={savePricingConfig}
                        disabled={saving}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-sm font-bold flex items-center gap-2"
                    >
                        <Save size={14} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Base Subscription & Margin */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0a1f16] rounded-xl border border-purple-500/30 p-6">
                    <label className="block text-xs font-bold text-purple-400 mb-2">BASE SUBSCRIPTION (Monthly)</label>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl text-emerald-400">£</span>
                        <input
                            type="number"
                            step="0.01"
                            value={config.baseSubscription}
                            onChange={(e) => setConfig({ ...config, baseSubscription: parseFloat(e.target.value) })}
                            className="flex-1 bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-2xl font-bold text-white"
                        />
                    </div>
                    <p className="text-xs text-emerald-500/50 mt-2">Minimum monthly fee per user</p>
                </div>

                <div className="bg-[#0a1f16] rounded-xl border border-purple-500/30 p-6">
                    <label className="block text-xs font-bold text-purple-400 mb-2">PROFIT MARGIN</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            step="0.1"
                            value={config.margin}
                            onChange={(e) => setConfig({ ...config, margin: parseFloat(e.target.value) })}
                            className="flex-1 bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-2xl font-bold text-white"
                        />
                        <span className="text-xl text-emerald-400">x</span>
                    </div>
                    <p className="text-xs text-emerald-500/50 mt-2">
                        {((config.margin - 1) * 100).toFixed(0)}% profit ({config.margin}x markup)
                    </p>
                </div>
            </div>

            {/* API Costs */}
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-6">
                <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                    <DollarSign size={16} />
                    YOUR ACTUAL API COSTS (in £)
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">Gemini per Token</label>
                        <input
                            type="number"
                            step="0.000001"
                            value={config.costs.geminiPerToken}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, geminiPerToken: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">Apify Compute Unit</label>
                        <input
                            type="number"
                            step="0.01"
                            value={config.costs.apifyComputeUnit}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, apifyComputeUnit: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">Apify Proxy per GB</label>
                        <input
                            type="number"
                            step="0.01"
                            value={config.costs.apifyProxyPerGB}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, apifyProxyPerGB: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">Scraping per 1000</label>
                        <input
                            type="number"
                            step="0.01"
                            value={config.costs.scrapingPer1000}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, scrapingPer1000: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">ForumScout per Record</label>
                        <input
                            type="number"
                            step="0.01"
                            value={config.costs.forumScoutPerRecord}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, forumScoutPerRecord: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-emerald-500/60 mb-1">MongoDB per Hour</label>
                        <input
                            type="number"
                            step="0.01"
                            value={config.costs.mongodbPerHour}
                            onChange={(e) => setConfig({
                                ...config,
                                costs: { ...config.costs, mongodbPerHour: parseFloat(e.target.value) }
                            })}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* Feature Pricing */}
            <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-6">
                <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                    <TrendingUp size={16} />
                    FEATURE PRICING (Your Price to Users)
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center gap-4">
                        <div className="w-1/3 text-sm text-white font-bold">Query Builder</div>
                        <div className="flex gap-2 items-center flex-1">
                            <span className="text-xs text-emerald-500/50">Base:</span>
                            <input
                                type="number"
                                step="0.01"
                                value={config.features.queryBuilder.basePrice}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        queryBuilder: { ...config.features.queryBuilder, basePrice: parseFloat(e.target.value) }
                                    }
                                })}
                                className="w-24 bg-[#051810] border border-emerald-900/50 rounded px-2 py-1 text-sm text-emerald-400 font-mono"
                            />
                            <span className="text-xs text-emerald-500/50">+</span>
                            <input
                                type="number"
                                step="0.01"
                                value={config.features.queryBuilder.perProfile}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        queryBuilder: { ...config.features.queryBuilder, perProfile: parseFloat(e.target.value) }
                                    }
                                })}
                                className="w-24 bg-[#051810] border border-emerald-900/50 rounded px-2 py-1 text-sm text-emerald-400 font-mono"
                            />
                            <span className="text-xs text-emerald-500/50">per profile</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-1/3 text-sm text-white font-bold">Quick Map</div>
                        <div className="flex gap-2 items-center flex-1">
                            <span className="text-xs text-emerald-500/50">Base:</span>
                            <input
                                type="number"
                                step="0.01"
                                value={config.features.quickMap.basePrice}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        quickMap: { ...config.features.quickMap, basePrice: parseFloat(e.target.value) }
                                    }
                                })}
                                className="w-24 bg-[#051810] border border-emerald-900/50 rounded px-2 py-1 text-sm text-emerald-400 font-mono"
                            />
                            ...
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-1/3 text-sm text-white font-bold">Deep Search</div>
                        <div className="flex gap-2 items-center flex-1">
                            <span className="text-xs text-emerald-500/50">Base:</span>
                            <input
                                type="number"
                                step="0.01"
                                value={config.features.deepSearch.basePrice}
                                onChange={(e) => setConfig({
                                    ...config,
                                    features: {
                                        ...config.features,
                                        deepSearch: { basePrice: parseFloat(e.target.value) }
                                    }
                                })}
                                className="w-24 bg-[#051810] border border-emerald-900/50 rounded px-2 py-1 text-sm text-emerald-400 font-mono"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Revenue Projections */}
            <div className="bg-gradient-to-br from-purple-900/20 to-emerald-900/20 rounded-xl border border-purple-500/30 p-6">
                <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                    <Calculator size={16} />
                    REVENUE PROJECTIONS
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    {[5, 10, 20].map(userCount => (
                        <div key={userCount} className="bg-[#0a1f16] rounded-lg p-4">
                            <div className="text-xs text-emerald-500/50 mb-1">{userCount} Active Users</div>
                            <div className="text-2xl font-bold text-emerald-400">
                                £{calculateRevenue(userCount).toFixed(2)}
                            </div>
                            <div className="text-xs text-emerald-500/60 mt-1">/month</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
