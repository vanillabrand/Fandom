
import React from 'react';

interface MetricCardProps {
    title: string;
    data: {
        value: string | number;
        label: string;
        trend?: number;
    };
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, data }) => {
    return (
        <div className="bg-[#050B14] border border-[#1A2C42] rounded-lg p-4 h-full">
            <h3 className="text-gray-400 text-sm font-medium mb-1 uppercase tracking-wider">{title}</h3>
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{data.value}</span>
                <span className="text-sm text-gray-500">{data.label}</span>
            </div>
            {data.trend !== undefined && (
                <div className={`mt-2 text-xs ${data.trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {data.trend > 0 ? '↑' : '↓'} {Math.abs(data.trend)}% vs average
                </div>
            )}
        </div>
    );
};
