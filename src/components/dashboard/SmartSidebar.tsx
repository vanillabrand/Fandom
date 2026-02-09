import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Activity, Trophy, Grid, Network, User, PanelRightClose, PanelRightOpen, ExternalLink, Sparkles, BrainCircuit, HelpCircle } from 'lucide-react';
import { DashboardWidget } from '../../../types.js';
import { ProxiedImage } from '../ProxiedImage.js';
import { LeaderboardWidget, PulseWidget, ContentGridWidget } from './SmartWidgets.js';
import { ProfileMetricsPanel } from './ProfileMetricsPanel.js';
import { ReasoningPanel } from './ReasoningPanel.js';

interface SmartSidebarProps {
    config: any;
    onNodeClick?: (nodeId: string) => void;
    widgets: DashboardWidget[];
    dataset?: any[]; // Dataset for evidence searching
}

const AccordionItem = ({
    title,
    icon: Icon,
    children,
    isOpen,
    onToggle,
    colorClass = "text-emerald-400"
}: {
    title: string;
    icon: any;
    children: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    colorClass?: string;
}) => {
    return (
        <div className="border-b border-emerald-500/20 last:border-0">
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors ${isOpen ? 'bg-white/5 sticky top-0 z-10 backdrop-blur-md bg-[#051810]/95 border-b border-emerald-500/30' : ''}`}
            >
                <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${colorClass}`} />
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">{title}</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
            </button>

            {isOpen && (
                <div className="p-4 bg-black/20 animate-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
};

export const SmartSidebar: React.FC<SmartSidebarProps> = ({ config, widgets, onNodeClick, dataset = [] }) => {
    const [isOpen, setIsOpen] = useState(true);
    // Default open sections matches AnalyticsPanel behavior (some open by default)
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(['pulse', 'entity-inspector', 'overindexed']));

    const toggleSection = (id: string) => {
        const newSet = new Set(openSections);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setOpenSections(newSet);
    };

    // Derived Selection Data
    const selectedData = config?.selection?.profileRecord;
    const selectedNode = config?.selection?.node; // [NEW]

    // [NEW] Local Reasoning State (Node OR Metric Item)
    const [reasoningTarget, setReasoningTarget] = useState<any>(null);

    // Sync reasoning target with selected node (priority)
    useEffect(() => {
        if (selectedNode) {
            setReasoningTarget(selectedNode);
            // Auto-open reasoning section if node has provenance? Maybe not, too intrusive.
        }
    }, [selectedNode]);

    const handleShowReasoning = (item: any) => {
        setReasoningTarget(item);
        if (!openSections.has('reasoning')) {
            toggleSection('reasoning');
        }
    };

    if (!isOpen) {
        return (
            <div className="absolute top-4 right-4 z-30 pointer-events-auto">
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2 bg-[#1a4d2e] border border-emerald-500/30 rounded-lg text-emerald-300 hover:text-white hover:border-emerald-500/50 shadow-lg transition-all"
                >
                    <PanelRightOpen className="w-5 h-5" />
                </button>
            </div>
        );
    }

    // Filter widgets
    const pulseWidget = widgets.find(w => w.type === 'Pulse') || widgets.find(w => w.title?.toLowerCase().includes('pulse'));
    const leaderboardWidget = widgets.find(w => w.type === 'Leaderboard') || widgets.find(w => w.title?.toLowerCase().includes('leaderboard'));
    const overindexedWidget = widgets.find(w => w.type === 'OverindexedList');
    const contentWidget = widgets.find(w => w.type === 'PostGallery') || widgets.find(w => w.type === 'ContentGrid');
    const clusterWidget = widgets.find(w => w.type === 'ClusterList');

    return (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-[#051810]/95 backdrop-blur-xl border-l border-emerald-500/20 shadow-2xl z-30 flex flex-col pointer-events-auto transition-all duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-emerald-500/20 bg-[#1a4d2e]/50">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="text-emerald-400 hover:text-white transition-colors"
                >
                    <PanelRightClose className="w-4 h-4" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-600 scrollbar-track-transparent">

                {/* DATA PROVENANCE (Reasoning) - Show FIRST when active */}
                {reasoningTarget && reasoningTarget.provenance && (
                    <AccordionItem
                        title={`Data Reasoning: ${reasoningTarget.label || reasoningTarget.name || reasoningTarget.id || 'Item'} `}
                        icon={BrainCircuit}
                        colorClass="text-emerald-300"
                        isOpen={openSections.has('reasoning')}
                        onToggle={() => toggleSection('reasoning')}
                    >
                        <ReasoningPanel item={reasoningTarget} dataset={dataset} />
                    </AccordionItem>
                )}

                {/* 1. PULSE (Vibe Check) */}
                {pulseWidget && (
                    <AccordionItem
                        title="Pulse & Sentiment"
                        icon={Activity}
                        colorClass="text-rose-400"
                        isOpen={openSections.has('pulse')}
                        onToggle={() => toggleSection('pulse')}
                    >
                        <PulseWidget data={pulseWidget.data} />
                    </AccordionItem>
                )}

                {/* 2. POWER PLAYERS (Leaderboard) */}
                {leaderboardWidget && (
                    <AccordionItem
                        title="By Popularity"
                        icon={Trophy}
                        colorClass="text-yellow-400"
                        isOpen={openSections.has('leaderboard')}
                        onToggle={() => toggleSection('leaderboard')}
                    >
                        <LeaderboardWidget data={leaderboardWidget.data} onShowReasoning={handleShowReasoning} />
                    </AccordionItem>
                )}

                {/* 2B. OVERINDEXED PROFILES (Frequency Ranking) */}
                {overindexedWidget && (
                    <AccordionItem
                        title="Overindexed Profiles"
                        icon={Trophy}
                        colorClass="text-orange-400"
                        isOpen={openSections.has('overindexed')}
                        onToggle={() => toggleSection('overindexed')}
                    >
                        <div className="space-y-2">
                            {overindexedWidget.data.map((profile: any, idx: number) => (
                                <div
                                    key={profile.username}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-[#0a2818]/50 hover:bg-[#0a2818] transition-colors cursor-pointer group"
                                    onClick={() => {
                                        if (profile.profileUrl) {
                                            window.open(profile.profileUrl, '_blank');
                                        }
                                    }}
                                >
                                    {/* Rank */}
                                    <div className="flex-shrink-0 w-6 text-center">
                                        <span className="text-sm font-bold text-emerald-400">#{idx + 1}</span>
                                    </div>

                                    {/* Profile Picture */}
                                    {profile.profilePicUrl && (
                                        <ProxiedImage
                                            src={profile.profilePicUrl}
                                            alt={profile.fullName}
                                            className="w-10 h-10 rounded-full object-cover border border-emerald-500/30"
                                        />
                                    )}

                                    {/* Profile Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                            {profile.fullName}
                                        </div>
                                        <div className="text-xs text-emerald-400/70 truncate">
                                            @{profile.username}
                                        </div>
                                    </div>

                                    {/* Frequency & Score */}
                                    <div className="flex-shrink-0 text-right">
                                        <div className="text-sm font-bold text-orange-400">
                                            {profile.frequency}x
                                        </div>
                                        <div className="text-xs text-emerald-400/50">
                                            {(profile.percentage || 0).toFixed(1)}%
                                        </div>
                                    </div>

                                    {/* Reasoning Icon */}
                                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <HelpCircle className="w-4 h-4 text-emerald-400" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AccordionItem>
                )}

                {/* 3. CONTENT VAULT */}
                {contentWidget && (
                    <AccordionItem
                        title="Content Vault"
                        icon={Grid}
                        colorClass="text-blue-400"
                        isOpen={openSections.has('content')}
                        onToggle={() => toggleSection('content')}
                    >
                        <ContentGridWidget data={contentWidget.data} />
                    </AccordionItem>
                )}

                {/* 4. NETWORK CLUSTERS */}
                {clusterWidget && (
                    <AccordionItem
                        title="Network DNA"
                        icon={Network}
                        colorClass="text-purple-400"
                        isOpen={openSections.has('clusters')}
                        onToggle={() => toggleSection('clusters')}
                    >
                        <div className="space-y-1">
                            {clusterWidget.data.map((c: any, i: number) => (
                                <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded hover:bg-white/10 border border-transparent hover:border-emerald-500/20 transition-all group">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-emerald-400/80">{c.name}</span>
                                        {c.provenance && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleShowReasoning(c); }}
                                                className="text-emerald-500/30 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all"
                                                title="View Reasoning"
                                            >
                                                <HelpCircle size={10} />
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-mono text-gray-500 bg-black/30 px-1.5 rounded">{c.size || c.count || 0} nodes</span>
                                </div>
                            ))}
                        </div>
                    </AccordionItem>
                )}

                {/* 5. ENTITY INSPECTOR (Drill Down) */}
                <AccordionItem
                    title="Entity Inspector"
                    icon={User}
                    colorClass="text-emerald-400"
                    isOpen={openSections.has('entity-inspector')}
                    onToggle={() => toggleSection('entity-inspector')}
                >
                    {selectedData ? (
                        <ProfileMetricsPanel
                            data={selectedData || selectedNode}
                            onShowReasoning={handleShowReasoning}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <Sparkles className="w-8 h-8 text-emerald-900/50 mb-2" />
                            <p className="text-xs text-gray-500">Click any node on the map<br />to inspect details.</p>
                        </div>
                    )}
                </AccordionItem>

            </div>
            {/* Footer */}
            <div className="p-2 border-t border-emerald-500/10 bg-[#051810] text-[9px] text-emerald-500/30 text-center uppercase tracking-widest">
                Query Builder Active
            </div>
        </div>
    );
};
