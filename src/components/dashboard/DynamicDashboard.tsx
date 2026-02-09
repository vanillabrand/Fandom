
import React from 'react';
import { DashboardConfig, DashboardWidget } from '../../../types.js';
import { PostGallery } from './PostGallery.js';
import { MetricCard } from './MetricCard.js';
import { AccordionList } from './AccordionList.js';
import { ChartPanel } from './ChartPanel.js';
import { SmartSidebar } from './SmartSidebar.js';
import { ProfileMetricsPanel } from './ProfileMetricsPanel.js';
import { LazyFandomGraph3D as FandomGraph3D } from '../LazyComponents.js';
import { motion } from 'framer-motion';
import { findProfileAnalytics } from '../../../services/datasetService.js';

interface DynamicDashboardProps {
    config: DashboardConfig;
    onNodeClick?: (nodeId: string) => void;
}

const containerVariants = {

    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.2, // Slower stagger for "building" effect
            delayChildren: 0.3
        }
    }
};

const itemVariants = {
    hidden: {
        opacity: 0,
        y: 60, // Deep slide up
        scale: 0.9, // More noticeable scale in
        filter: "blur(12px)"
    },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transition: {
            type: "spring" as const,
            stiffness: 80, // Snappier
            damping: 14,
            mass: 1.2
        }
    }
};

export const DynamicDashboard: React.FC<DynamicDashboardProps> = ({ config, onNodeClick }) => {

    // State for Drill Down
    const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

    // --- GRAPH MANIPULATION STATE ---
    // We need local state to support "Exploding" nodes (Drill Down) without altering the upstream config permanently
    const [localGraphData, setLocalGraphData] = React.useState<any>(null);

    // Initialize local state when config changes
    React.useEffect(() => {
        const graphWidget = config.widgets.find((w: any) => w.type === 'FandomGraph');
        if (graphWidget && graphWidget.data) {
            setLocalGraphData(JSON.parse(JSON.stringify(graphWidget.data)));
        }
    }, [config]);

    const handleNodeClick = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        if (onNodeClick) onNodeClick(nodeId);
    };

    // --- HELPER: SELECTION LOGIC ---
    const getSelectedNodeDetails = () => {
        if (!selectedNodeId) return null;
        // Look in main graph widget
        const graphWidget = config.widgets.find((w: any) => w.type === 'FandomGraph');
        if (!graphWidget || !graphWidget.data) return null;

        // Check nodes
        const nodes = graphWidget.data.nodes || [];
        const node = nodes.find((n: any) => n.id === selectedNodeId);

        // Clean IDs for matching
        // [FIX] Strip numeric index (e.g. cr_0_therock -> therock)
        const cleanNodeId = selectedNodeId.replace(/^(pr_|cr_|br_|over_)/, '').replace(/^\d+_/, '');
        const cleanLabel = (node?.label || '').replace(/^@/, '');

        // Try to find enriched data in dataset.data
        const enrichedData = graphWidget.data.data || [];

        // Normalization Helper
        const norm = (s: string) => (s || '').toLowerCase().replace('@', '').trim();
        const targetHandle = norm(cleanNodeId);
        const targetName = norm(cleanLabel);

        // precise match for the "Profile" record
        const profileRecord = enrichedData.find((r: any) => {
            const rUser = norm(r.username || r.ownerUsername || r.id);
            return rUser === targetHandle || rUser === targetName;
        });

        return { node, profileRecord };
    };



    // Render specific widget component based on type
    const renderWidget = (widget: DashboardWidget) => {
        switch (widget.type) {
            case 'PostGallery':
                return <PostGallery title={widget.title} data={widget.data} />;
            case 'MetricCard':
                return <MetricCard title={widget.title} data={widget.data} />;
            case 'ChartPanel' as any: // Check type cast if not yet updated in types.ts
                // @ts-ignore
                return <ChartPanel type={widget.chartType || 'bar'} data={widget.data} xAxisKey={widget.xAxisKey || 'name'} dataKey={widget.dataKey || 'value'} title={widget.title} />;
            case 'AccordionList':
                // [FIX] Hydrate data if missing (it might be in dataset metadata)
                const rawItems = widget.data?.items || widget.data || [];

                // Transform raw data (brands/creators) into AccordionItem format { id, title, content }
                const accordionItems = rawItems.map((item: any, idx: number) => {
                    const metadata = item.metadata || {};
                    return {
                        id: item.username || item.id || `item_${idx}`,
                        title: item.title || item.fullName || item.name || item.username || `Item ${idx}`,
                        content: (
                            <div className="text-sm space-y-2">
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                    <span>{item.category?.toUpperCase() || metadata.category?.toUpperCase() || 'PROFILE'}</span>
                                    {item.overindexScore > 0 && <span className="text-emerald-400 font-mono">{item.overindexScore}x Avg</span>}
                                    {metadata.popularity > 0 && <span className="text-emerald-400 font-mono">Pop: {metadata.popularity}</span>}
                                </div>

                                {/* Profile Bio */}
                                {item.bio && <p className="text-gray-300 italic">"{item.bio}"</p>}

                                {/* Lexicon/Topic Definition */}
                                {metadata.definition && (
                                    <div className="bg-white/5 p-2 rounded border-l-2 border-emerald-500">
                                        <p className="text-gray-200 text-xs">{metadata.definition}</p>
                                        {metadata.example && <p className="text-gray-500 text-[10px] mt-1 italic">ex: "{metadata.example}"</p>}
                                    </div>
                                )}

                                {/* Provenance / Evidence Display */}
                                {item.provenance && (
                                    <div className="mt-2 text-xs bg-white/5 p-2 rounded border border-white/10">
                                        <div className="font-semibold text-emerald-500 flex items-center gap-1">
                                            REASONING
                                        </div>
                                        <p className="text-gray-300 mt-1">{item.provenance.reasoning}</p>

                                        {item.provenance.evidence && item.provenance.evidence.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-white/10">
                                                <span className="text-gray-500 uppercase text-[10px]">Evidence</span>
                                                <ul className="list-disc pl-4 mt-1 space-y-1 text-gray-400">
                                                    {item.provenance.evidence.map((ev: string, i: number) => (
                                                        <li key={i}>{ev}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Profile Link */}
                                {item.url && (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-emerald-400 hover:text-emerald-300 text-xs">
                                        View Profile →
                                    </a>
                                )}
                            </div>
                        )
                    };
                });

                // Check if we need to extract from the graph data (fallback)
                if (accordionItems.length === 0 && widget.id === 'overindexing_panel') {
                    // Try to find analytics in the main graph widget's data
                    const graphWidget = config.widgets.find((w: any) => w.type === 'FandomGraph');
                    const analytics = graphWidget?.data?.analytics;
                    // Logic placeholder
                }

                return <AccordionList items={accordionItems} />;

            case 'FandomGraph':
                return (
                    <div className="h-full w-full bg-[#050B14] border border-[#1A2C42] rounded-lg overflow-hidden relative">
                        <div className="absolute top-2 left-2 z-10 bg-[#0A1625]/80 px-2 py-1 rounded text-xs text-emerald-400 border border-emerald-900/50">
                            {widget.title}
                        </div>
                        <FandomGraph3D
                            overrideData={localGraphData || widget.data}
                            onNodeClick={handleNodeClick}
                            visualTheme={widget.data?.analytics?.visualTheme} // [NEW] Theme Support
                            query={config.title || "Network Map"} // [NEW] Pass query for label
                        />
                    </div>
                );
            default:
                return <div className="text-red-500">Unknown Widget: {widget.type}</div>;
        }
    };

    // --- ACCORDION LAYOUT LOGIC (SMART VIEW) ---
    if (config.layout === 'map-accordion-split' as any || config.layout === 'analytics-focus') {
        const mapWidget = config.widgets.find(w => w.type === 'FandomGraph');
        // All other widgets go into the sidebar
        const sidebarWidgets = config.widgets.filter(w => w.type !== 'FandomGraph');

        return (
            <div className="h-full w-full bg-[#020617] flex gap-0 overflow-hidden relative">
                {/* LEFT: MAP (Flexible) */}
                <div className="flex-1 h-full min-w-0 bg-[#050B14] relative">
                    {mapWidget ? (
                        <FandomGraph3D
                            overrideData={localGraphData || mapWidget.data}
                            onNodeClick={handleNodeClick}
                            visualTheme={mapWidget.data?.analytics?.visualTheme} // [NEW] Theme Support
                            query={config.title || "Network Map"} // [NEW] Pass query for label
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">No Map Data</div>
                    )}

                    {/* Optional: Map Text Overlay */}
                    {config.title && (
                        <div className="absolute top-4 left-4 z-10 pointer-events-none">
                            <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">
                                {config.title}
                            </h1>
                        </div>
                    )}
                </div>

                {/* RIGHT: SMART SIDEBAR (Fixed Width) - Always visible */}
                <SmartSidebar
                    config={{
                        query: config.description?.replace('Analysis for ', '') || 'Network',
                        stats: {
                            nodeCount: mapWidget?.data?.nodes?.length || 0,
                            edgeCount: mapWidget?.data?.connections?.length || 0
                        },
                        selection: getSelectedNodeDetails() // Pass selected node details
                    }}
                    widgets={sidebarWidgets}
                    onNodeClick={handleNodeClick}
                    dataset={mapWidget?.data?.data || []}
                />
            </div>
        );
    }

    // --- STANDARD GRID LAYOUT LOGIC ---
    const getLayoutClasses = () => {
        switch (config.layout) {
            case 'split-vertical':
                return "grid grid-cols-1 lg:grid-cols-12 gap-4 h-full"; // 4 col map / 8 col content
            default: // full-map
                return "grid grid-cols-1 h-full";
        }
    };

    // --- DEBUG STATE ---
    const [showDebug, setShowDebug] = React.useState(false);

    // Toggle Hotkey (Backquote / Tilde)
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '`' || e.key === '~') {
                setShowDebug(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    return (
        <motion.div
            className={`p-4 h-full w-full bg-[#020617] relative ${getLayoutClasses()}`}
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {/* DEBUG TOGGLE INTENT (Invisible Touch Target / Corner) */}
            <div
                className="absolute top-0 right-0 w-4 h-4 z-[90] cursor-default opacity-0 hover:opacity-100 hover:bg-red-500/20"
                onClick={() => setShowDebug(true)}
                title="Toggle Debug View (`)"
            />

            {config.widgets.map(widget => (
                <motion.div
                    key={widget.id}
                    className={`min-h-[300px] ${widget.colSpan ? `lg:col-span-${widget.colSpan}` : 'col-span-full'}`}
                    variants={itemVariants}
                >
                    {widget.type === 'FandomGraph' ? (
                        <div className="h-full w-full bg-[#050B14] border border-[#1A2C42] rounded-lg overflow-hidden relative shadow-lg shadow-emerald-500/5 transition-all duration-500 hover:shadow-emerald-500/20 hover:border-emerald-500/30">
                            {/* ... existing header ... */}
                            <div className="absolute top-2 left-2 z-10 bg-[#0A1625]/80 px-2 py-1 rounded text-xs text-emerald-400 border border-emerald-900/50 backdrop-blur-sm">
                                {widget.title}
                            </div>
                            <FandomGraph3D
                                overrideData={localGraphData || widget.data}
                                onNodeClick={handleNodeClick}
                                visualTheme={widget.data?.analytics?.visualTheme} // [NEW] Theme Support
                                query={config.title || "Network Map"} // [NEW] Pass query for label
                            />
                        </div>
                    ) : (
                        renderWidget(widget)
                    )}
                </motion.div>
            ))}
            <Overlay selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} config={config} />

            {/* DEBUG OVERLAY */}
            {showDebug && <DebugOverlay config={config} onClose={() => setShowDebug(false)} />}
        </motion.div>
    );
};

// --- SUB-COMPONENT: DebugOverlay ---
const DebugOverlay = ({ config, onClose }: any) => {
    // 1. Extract Telemetry from Graph Widget or Analytics
    const graphWidget = config.widgets.find((w: any) => w.type === 'FandomGraph') || {};
    const rawData = graphWidget.data?.data || [];
    const analytics = graphWidget.data?.analytics || {};
    const debugInfo = analytics.debug || {};

    const [activeTab, setActiveTab] = React.useState<'raw' | 'ai'>('raw');

    return (
        <div className="absolute inset-4 z-[100] bg-black/95 backdrop-blur-xl border border-red-500/30 rounded-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 font-mono text-xs">
            {/* Header */}
            <div className="p-3 border-b border-red-500/20 bg-red-900/20 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-red-400">🚨 DEBUG MODE</span>
                    <div className="flex gap-1 bg-black/50 p-1 rounded">
                        <button
                            onClick={() => setActiveTab('raw')}
                            className={`px-3 py-1 rounded ${activeTab === 'raw' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            Raw Data ({rawData.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('ai')}
                            className={`px-3 py-1 rounded ${activeTab === 'ai' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            AI Telemetry
                        </button>
                    </div>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white px-2">✕ ASC</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 bg-[#0a0a0a] text-gray-300">
                {activeTab === 'raw' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-[10px] text-gray-500 mb-4">
                            <div>Total Records: {rawData.length}</div>
                            <div>Source Steps: {Array.from(new Set(rawData.map((r: any) => r.stepId || 'unknown'))).join(', ')}</div>
                        </div>
                        {rawData.slice(0, 50).map((r: any, i: number) => (
                            <div key={i} className="mb-2 p-2 border-b border-gray-800 hover:bg-white/5">
                                <span className="text-emerald-500 mr-2">[{r.recordType || 'unknown'}]</span>
                                <span className="text-blue-400 mr-2">@{r.username || r.ownerUsername}</span>
                                <span className="opacity-70">{r.caption || r.text || "NO TEXT CONTENT"}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="border-r border-gray-800 pr-4 overflow-auto">
                            <h4 className="text-indigo-400 font-bold mb-2">Prompt Sent</h4>
                            <pre className="whitespace-pre-wrap text-[10px] text-gray-400">
                                {debugInfo.promptPreview || "No Prompt Telemetry"}
                            </pre>
                            <div className="mt-4">
                                <span className="text-gray-500">Payload Size: {debugInfo.payloadSize || 0} items</span>
                            </div>
                        </div>
                        <div className="overflow-auto">
                            <h4 className="text-green-400 font-bold mb-2">Raw Response</h4>
                            <pre className="whitespace-pre-wrap text-[10px] text-green-900/80">
                                {debugInfo.rawResponse || JSON.stringify(analytics.matches || [], null, 2)}
                            </pre>
                            <div className="mt-4 text-red-400">
                                {debugInfo.error ? `Error: ${debugInfo.error}` : ''}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: Overlay ---

const Overlay = ({ selectedNodeId, setSelectedNodeId, config }: any) => {
    // ... existing overlay logic (lines 277-313)
    const getSelectedNodeDetails = () => {
        if (!selectedNodeId) return null;
        // Look in main graph widget
        const graphWidget = config.widgets.find((w: any) => w.type === 'FandomGraph');
        if (!graphWidget || !graphWidget.data) return null;

        // Check nodes
        const nodes = graphWidget.data.nodes || [];
        const node = nodes.find((n: any) => n.id === selectedNodeId);

        // Clean IDs for matching
        // [FIX] Strip numeric index (e.g. cr_0_therock -> therock)
        const cleanNodeId = selectedNodeId.replace(/^(pr_|cr_|br_|over_)/, '').replace(/^\d+_/, '');
        const cleanLabel = (node?.label || '').replace(/^@/, '');

        // Try to find enriched data in dataset.data
        const enrichedData = graphWidget.data.data || [];

        // Normalization Helper
        const norm = (s: string) => (s || '').toLowerCase().replace('@', '').trim();
        const targetHandle = norm(cleanNodeId);
        const targetName = norm(cleanLabel);

        // precise match for the "Profile" record
        const profileRecord = enrichedData.find((r: any) => {
            const rUser = norm(r.username || r.ownerUsername || r.id);
            return rUser === targetHandle || rUser === targetName;
        });

        const relatedRecords = enrichedData.filter((r: any) =>
            (r !== profileRecord) && (
                (r.author === cleanLabel) || (r.ownerUsername === cleanLabel) || awaitRefMatch(r, selectedNodeId)
            )
        );

        return { node, profileRecord, relatedRecords };
    };

    // Use a very loose matcher for ids since implementation varies
    const awaitRefMatch = (record: any, selectedId: string) => {
        return record.id === selectedId;
    };

    const selection = getSelectedNodeDetails();
    const [enrichedRecord, setEnrichedRecord] = React.useState<any>(null);

    React.useEffect(() => {
        setEnrichedRecord(null);
        if (selectedNodeId && selection?.node) {
            const group = selection.node.group;
            if (group === 'creator' || group === 'brand' || group === 'main') {
                // Clean username
                const label = (selection.node.label || '').replace('@', '').trim();
                if (label) {
                    findProfileAnalytics(label).then(res => {
                        if (res) {
                            console.log("Enriched Data found:", res);
                            setEnrichedRecord(res);
                        }
                    });
                }
            }
        }
    }, [selectedNodeId, selection?.node?.id]); // Depend on ID change

    if (!selectedNodeId || !selection) return null;
    return (
        <div className="absolute top-4 right-4 bottom-4 w-96 bg-[#051810]/95 backdrop-blur-xl border-l border-emerald-500/20 shadow-2xl z-50 rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-4 pointer-events-auto">
            <div className="p-4 border-b border-emerald-500/20 bg-[#1a4d2e]/50 flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-bold text-white">{selection.node?.label || 'Node Details'}</h3>
                    <span className="text-[10px] text-emerald-400 uppercase">{selection.node?.group || 'Unknown Type'}</span>
                </div>
                <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
                {(selection.profileRecord || enrichedRecord || selection.node?.group === 'topic' || selection.node?.group === 'creator') ? (
                    <ProfileMetricsPanel data={selection.profileRecord || enrichedRecord || selection.node} />
                ) : selection.node?.group === 'post' ? (
                    <div className="bg-black/40 p-4 rounded-xl border border-sky-500/30">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-sky-400">Post Insight</span></div>
                        <p className="text-gray-300 text-xs italic mb-4">"{selection.node.label}"</p>
                        {selection.node.postUrl && (<a href={selection.node.postUrl} target="_blank" rel="noreferrer" className="block w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-center rounded text-xs font-bold transition-colors">View Original Content ↗</a>)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[9px] text-gray-500 uppercase">Influence</div><div className="text-lg font-mono text-emerald-400">{selection.node?.val || 0}</div></div>
                        <div className="bg-black/20 p-2 rounded border border-white/5"><div className="text-[9px] text-gray-500 uppercase">Related Records</div><div className="text-lg font-mono text-blue-400">{selection.relatedRecords.length}</div></div>
                    </div>
                )}
                {selection.relatedRecords.length > 0 && (
                    <div className="space-y-3 mt-4"><h4 className="text-xs font-bold text-white uppercase border-b border-white/10 pb-1">Related Content</h4>{selection.relatedRecords.slice(0, 10).map((rec: any, i: number) => (<div key={i} className="bg-white/5 p-2 rounded text-xs text-gray-300 hover:bg-white/10 transition-colors"><div className="mb-1 text-emerald-500/80 text-[10px]">{rec.recordType}</div>{rec.caption || rec.text || rec.biography || "No text content"}<div className="mt-1 flex gap-2 text-[9px] text-gray-500"><span>♥ {rec.likes || 0}</span><span>💬 {rec.comments || 0}</span></div></div>))}</div>
                )}
            </div>
        </div>
    );
};

