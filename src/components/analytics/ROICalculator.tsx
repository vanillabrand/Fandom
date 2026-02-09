import React, { useState } from 'react';
import { Calculator, DollarSign } from 'lucide-react';

export const ROICalculator = () => {
    const [queries, setQueries] = useState(20);
    const [hoursPerQuery, setHoursPerQuery] = useState(2);
    const [hourlyRate, setHourlyRate] = useState(50);
    const [leads, setLeads] = useState(10);
    const [monthlyUsage, setMonthlyUsage] = useState(50);

    // Calculate ROI
    const subscription = 149;
    const totalCost = subscription + monthlyUsage;
    const timeSaved = queries * hoursPerQuery;
    const valueCreated = timeSaved * hourlyRate;
    const roi = totalCost > 0 ? ((valueCreated - totalCost) / totalCost) * 100 : 0;
    const paybackDays = totalCost > 0 ? (totalCost / (valueCreated / 30)) : 0;
    const costPerLead = leads > 0 ? totalCost / leads : 0;

    return (
        <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-900/30">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calculator className="text-blue-400" size={20} />
                    ROI Calculator
                </h3>
                <p className="text-sm text-emerald-500/60">Calculate your return on investment</p>
            </div>

            <div className="p-6 space-y-6">
                {/* Inputs */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Queries/Month</label>
                        <input
                            type="number"
                            value={queries}
                            onChange={(e) => setQueries(parseInt(e.target.value) || 0)}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Monthly Usage Cost (£)</label>
                        <input
                            type="number"
                            value={monthlyUsage}
                            onChange={(e) => setMonthlyUsage(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Hours Saved/Query</label>
                        <input
                            type="number"
                            step="0.5"
                            value={hoursPerQuery}
                            onChange={(e) => setHoursPerQuery(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 block mb-1">Your Hourly Rate (£)</label>
                        <input
                            type="number"
                            value={hourlyRate}
                            onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-white text-sm"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-gray-400 block mb-1">Leads Generated (optional)</label>
                        <input
                            type="number"
                            value={leads}
                            onChange={(e) => setLeads(parseInt(e.target.value) || 0)}
                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-white text-sm"
                        />
                    </div>
                </div>

                {/* Results */}
                <div className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 rounded-lg p-6 border border-emerald-500/30">
                    <div className="text-center mb-4">
                        <div className="text-5xl font-bold text-emerald-400 mb-2">
                            {roi.toFixed(0)}%
                        </div>
                        <div className="text-sm text-gray-300">Return on Investment</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-emerald-500/20">
                        <div>
                            <div className="text-xs text-gray-400 mb-1">Total Monthly Cost</div>
                            <div className="text-xl font-bold text-white">£{totalCost.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-400 mb-1">Value Created</div>
                            <div className="text-xl font-bold text-emerald-400">£{valueCreated.toFixed(2)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-400 mb-1">Time Saved</div>
                            <div className="text-lg font-bold text-white">{timeSaved}h</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-400 mb-1">Payback Period</div>
                            <div className="text-lg font-bold text-white">{paybackDays.toFixed(1)} days</div>
                        </div>
                        {leads > 0 && (
                            <div className="col-span-2">
                                <div className="text-xs text-gray-400 mb-1">Cost per Lead</div>
                                <div className="text-2xl font-bold text-purple-400">£{costPerLead.toFixed(2)}</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="text-xs text-gray-500 text-center">
                    Adjust inputs to see how the ROI changes based on your usage patterns
                </div>
            </div>
        </div>
    );
};
