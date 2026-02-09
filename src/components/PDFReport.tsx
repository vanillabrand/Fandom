import React from 'react';
import { ExportData } from '../utils/exportUtils.js';
import VisualDNAWidget from './VisualDNAWidget.js';
import { Sparkles } from 'lucide-react';

interface PDFReportProps {
    data: ExportData;
    backgroundImage?: string;
}

const PDFReport: React.FC<PDFReportProps> = ({ data, backgroundImage }) => {
    // Helper to safely get list data
    const getList = (list: any[]) => list || [];

    // Helper: Safely access visual analysis data
    const visualAnalysis = data.analytics?.visualAnalysis || {};
    const aestheticTags = visualAnalysis.aestheticTags || data.analytics?.visualTheme?.aesthetic || [];
    const colorPalette = visualAnalysis.colorPalette || data.analytics?.visualTheme?.colorPalette || [];
    const vibeDescription = visualAnalysis.vibeDescription || '';

    // Data for lists
    const clusters = getList(data.analytics?.clusters);
    const creators = getList(data.analytics?.creators);
    const brands = getList(data.analytics?.brands);
    const topics = getList(data.analytics?.topics);

    const renderList = (title: string, items: any[], formatItem: (item: any) => React.ReactNode) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="mb-6 break-inside-avoid">
                <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-sm border-b border-emerald-500/30 pb-1 mb-2">
                    {title}
                </h3>
                <div className="space-y-1">
                    {items.slice(0, 10).map((item, i) => (
                        <div key={i} className={`p-2 rounded ${i % 2 !== 0 ? 'bg-emerald-900/40' : 'bg-transparent'}`}>
                            {formatItem(item)}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div
            id="pdf-report-root"
            className="w-[210mm] min-h-[297mm] relative bg-[#022c22] text-white p-8 overflow-hidden font-sans"
            style={{
                // Ensure print-like styling
                printColorAdjust: 'exact',
                WebkitPrintColorAdjust: 'exact'
            }}
        >
            {/* Background Layer */}
            {backgroundImage && (
                <div className="absolute inset-0 z-0">
                    <img
                        src={backgroundImage}
                        alt=""
                        className="w-full h-full object-cover opacity-100"
                    />
                    {/* Overlay for readability */}
                    <div className="absolute inset-0 bg-[#022c22]/90 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-[#022c22]/80" />
                </div>
            )}

            {/* Content Layer */}
            <div className="relative z-10 flex flex-col h-full">

                {/* Header */}
                <header className="flex justify-between items-center mb-0">
                    <div className="flex items-center gap-2">
                        {/* Assuming logo is available publicly or imported. Using text for now if image fails */}
                        <Sparkles className="w-8 h-8 text-emerald-400" />
                        <span className="font-bold text-xl tracking-tight">Fandom</span>
                    </div>
                    <div className="text-right">
                        <h1 className="text-2xl font-bold text-emerald-400 tracking-widest">FANDOM PULSE REPORT</h1>
                    </div>
                </header>

                <div className="w-full h-px bg-emerald-500/50 my-4" />

                {/* 1. Visual DNA (Top Priority) */}
                {(aestheticTags.length > 0 || colorPalette.length > 0 || vibeDescription) && (
                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            VISUAL DNA
                        </h2>

                        <div className="bg-[#064e3b]/80 border border-emerald-500/30 rounded-xl p-6 backdrop-blur-sm">
                            <VisualDNAWidget
                                data={{
                                    aestheticTags,
                                    colorPalette,
                                    vibeDescription
                                }}
                            />
                        </div>
                    </section>
                )}

                {/* 2. Executive Summary (If present) */}
                {data.summary && (
                    <section className="mb-8">
                        <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-sm mb-2">Executive Summary</h3>
                        <p className="text-emerald-100/80 text-sm leading-relaxed whitespace-pre-line">
                            {data.summary}
                        </p>
                    </section>
                )}

                {/* 3. Metrics Grid */}
                <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                        {renderList("Narrative Clusters", clusters, (c) => (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-emerald-100">{c.name || 'Unknown Cluster'}</span>
                                <span className="text-emerald-400/80">{c.count} nodes</span>
                            </div>
                        ))}

                        {renderList("Trending Topics", topics, (t) => (
                            <div className="text-xs text-emerald-100">
                                {t.topic || t.name || 'Unknown Topic'}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-6">
                        {renderList("Key Creators", creators, (c) => (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-emerald-100 truncate max-w-[70%]">{c.name || c.username || 'Unknown'}</span>
                                <span className="text-emerald-400/80">{c.category || 'Creator'}</span>
                            </div>
                        ))}

                        {renderList("Brand Affinity", brands, (b) => (
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-emerald-100 truncate max-w-[70%]">{b.name || 'Unknown Brand'}</span>
                                <span className="text-emerald-400/80">{b.industry || 'Brand'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-8 border-t border-emerald-500/20 flex justify-between items-center text-[10px] text-emerald-500/60 uppercase tracking-widest">
                    <span>Generated by Fandom AI</span>
                    <span>{new Date().toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    );
};

export default PDFReport;
