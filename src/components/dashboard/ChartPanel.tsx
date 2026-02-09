import React from 'react';
import {
    ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

interface ChartPanelProps {
    type: 'bar' | 'line';
    data: any[];
    xAxisKey: string;
    dataKey: string;
    title?: string;
    color?: string;
    height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#020617] border border-[#1A2C42] p-2 rounded shadow-xl">
                <p className="text-xs text-emerald-400 font-bold mb-1">{label}</p>
                <p className="text-sm text-white">
                    {payload[0].value}
                </p>
            </div>
        );
    }
    return null;
};

export const ChartPanel: React.FC<ChartPanelProps> = ({
    type,
    data,
    xAxisKey,
    dataKey,
    title,
    color = "#10b981",
    height = 200
}) => {
    if (!data || data.length === 0) {
        return <div className="text-xs text-gray-500 p-4 text-center">No chart data available</div>;
    }

    return (
        <div className="w-full">
            {title && <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">{title}</h4>}
            <div style={{ width: '100%', height: height }}>
                <ResponsiveContainer>
                    {type === 'bar' ? (
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                            <XAxis
                                dataKey={xAxisKey}
                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                width={30}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff10' }} />
                            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    ) : (
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                            <XAxis
                                dataKey={xAxisKey}
                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                width={30}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey={dataKey}
                                stroke={color}
                                strokeWidth={2}
                                dot={{ fill: color, r: 3 }}
                                activeDot={{ r: 5, fill: '#fff' }}
                            />
                        </LineChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
};
