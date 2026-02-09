import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { LazyFandomGraph3D as FandomGraph3D, LazyAnalyticsPanel as AnalyticsPanel } from './LazyComponents.js';
import { demoGraphData } from '../data/demoGraph.js';
import { ProfileMetricsPanel } from './dashboard/ProfileMetricsPanel.js';
import { motion } from 'framer-motion';
import GraphLegend from './GraphLegend.js';
import { FandomData } from '../../types.js';

export const PublicShareView = () => {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<FandomData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

    useEffect(() => {
        const fetchMap = async () => {
            try {
                if (!id) return;
                const res = await fetch(`/api/public-maps/${id}`);
                if (!res.ok) throw new Error('Map not found or expired');
                const result = await res.json();
                const dataset = result.data;

                // Handle snapshot vs raw data (similar to Dashboard logic)
                let mapData = null;

                if (Array.isArray(dataset.data)) {
                    // 1. Look for a record that HAS nodes/links
                    mapData = dataset.data.find((d: any) => d.nodes && d.links);
                    // 2. Fallback to first item
                    if (!mapData && dataset.data.length > 0) {
                        mapData = dataset.data[0];
                    }
                } else if (dataset.data && (dataset.data.nodes || dataset.data.analytics)) {
                    mapData = dataset.data;
                }

                if (!mapData) {
                    throw new Error("Dataset contains no valid map data");
                }

                setData(mapData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchMap();
    }, [id]);

    if (loading) {
        return (
            <div className="h-screen w-full bg-[#051810] flex items-center justify-center text-emerald-500">
                <Loader2 className="w-10 h-10 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen w-full bg-[#051810] flex flex-col items-center justify-center text-red-400 gap-4">
                <AlertCircle className="w-12 h-12" />
                <h2 className="text-xl font-bold">Unable to load map</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="h-screen bg-[#051810] relative overflow-hidden">
            {/* Minimal Header */}
            {/* Header Removed */}

            <div className={`absolute inset - 0 z - 0 transition - all duration - 500 cubic - bezier(0.4, 0, 0.2, 1) ${isRightPanelOpen ? 'right-80' : 'right-0'} `}>
                <FandomGraph3D
                    nodes={data.nodes}
                    links={data.links}
                    focusedNodeId={focusedNodeId}
                    profileImage={data.profileImage}
                    profileFullName={data.profileFullName}
                    onNodeClick={setFocusedNodeId}
                    visualTheme={(data as any).analytics?.visualTheme} // [NEW] Pass Theme
                    showLegend={false}
                    query={data.profileFullName || "Public Map"} // [NEW] Pass query for label parity
                    initialZoom={450} // [NEW] Closer default
                />
                <GraphLegend
                    comparisonMetadata={(data as any).comparisonMetadata}
                    visualTheme={(data as any).analytics?.visualTheme}
                />
            </div>

            {/* Bottom Left CTA */}
            <div className="absolute bottom-24 left-6 z-50">
                <a href="/" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-6 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(5,150,105,0.4)] hover:shadow-[0_0_30px_rgba(5,150,105,0.6)] transition-all flex items-center gap-2 border border-emerald-400/20">
                    Create Your Own Map
                </a>
            </div>

            <AnalyticsPanel
                data={data}
                focusedNodeId={focusedNodeId}
                onSelect={setFocusedNodeId}
                isOpen={isRightPanelOpen}
                onToggle={setIsRightPanelOpen}
            />
        </div>
    );
};
