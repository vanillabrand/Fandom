import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Table, Share2, Code, ChevronDown } from 'lucide-react';
import { exportNodesToCSV, exportEdgesToCSV, exportToJSON, generatePDFReport } from '../utils/exportUtils.js';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';

interface ExportMenuProps {
    data: any | null;
    filename: string;
    dashboardRef?: React.RefObject<HTMLDivElement | null>; // For PDF capture
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ data, filename, dashboardRef }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleExport = async (type: 'pdf' | 'json' | 'csv_nodes' | 'csv_edges') => {
        if (!data) return;
        setIsOpen(false);

        const toastId = toast.loading(`Generating ${type.toUpperCase()} export...`);

        try {
            switch (type) {
                case 'pdf':
                    // Capture Background (Clean Graph Only)
                    let bgImage = undefined;
                    if (dashboardRef && dashboardRef.current) {
                        try {
                            // 1. Find and Hide Overlays (Panels, Buttons, Legends)
                            // Target z-index layers and absolute UI elements EXCEPT the canvas
                            const overlays = dashboardRef.current.querySelectorAll('.absolute, .fixed, .z-10, .z-20, .z-50');
                            const originalDisplays: string[] = [];

                            overlays.forEach((el) => {
                                const element = el as HTMLElement;
                                // Heuristic: Hides everything that isn't the canvas layer
                                // Note: Canvas usually has no ID, but overlays have classes
                                if (!element.tagName.match(/CANVAS/i) && !element.id.includes('canvas')) {
                                    originalDisplays.push(element.style.display);
                                    element.style.setProperty('display', 'none', 'important');
                                } else {
                                    originalDisplays.push(element.style.display); // Keep sync
                                }
                            });

                            // 2. Capture (Fixing TS error by casting)
                            const h2c = html2canvas as any;
                            const canvas = await h2c(dashboardRef.current, {
                                useCORS: true,
                                logging: false,
                                scale: 2,
                                backgroundColor: '#022c22' // Force dark background
                            });
                            bgImage = canvas.toDataURL('image/png');

                            // 3. Restore Overlays
                            overlays.forEach((el, i) => {
                                const element = el as HTMLElement;
                                if (originalDisplays[i]) {
                                    element.style.display = originalDisplays[i];
                                } else {
                                    element.style.removeProperty('display');
                                }
                            });
                        } catch (err) {
                            console.warn("Snapshot capture failed, continuing without background", err);
                        }
                    }

                    // New Data-Driven PDF Generation
                    await generatePDFReport(data, filename, bgImage);

                    toast.success("PDF Report downloaded!", { id: toastId });
                    break;
                case 'json':
                    exportToJSON(data, filename);
                    toast.success("JSON Data downloaded!", { id: toastId });
                    break;
                case 'csv_nodes':
                    exportNodesToCSV(data.nodes, filename);
                    toast.success("Nodes CSV downloaded!", { id: toastId });
                    break;
                case 'csv_edges':
                    exportEdgesToCSV(data.links, filename);
                    toast.success("Edges CSV downloaded!", { id: toastId });
                    break;
            }
        } catch (e: any) {
            console.error("Export failed", e);
            toast.error(`Export failed: ${e.message}`, { id: toastId });
        }
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1 bg-[#0a1f16] border border-emerald-500/30 
                    hover:bg-[#0f291e] hover:border-emerald-500/50 text-emerald-400 px-2 py-1.5 
                    rounded text-xs font-bold transition-all ${isOpen ? 'bg-[#0f291e] border-emerald-500' : ''}`}
                title="Export Data"
            >
                <Download className="w-4 h-4" />
                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-48 bg-[#0a1f16] border border-emerald-500/30 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100 origin-bottom-right">
                    <div className="py-1">
                        <div className="px-3 py-2 text-[10px] font-bold text-emerald-500/50 uppercase tracking-wider">
                            Reports
                        </div>
                        <button
                            onClick={() => handleExport('pdf')}
                            className="w-full text-left px-4 py-2 text-xs text-gray-200 hover:bg-emerald-500/10 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            <FileText className="w-3.5 h-3.5 text-emerald-400" />
                            PDF Report
                        </button>

                        <div className="h-px bg-emerald-500/10 my-1" />

                        <div className="px-3 py-2 text-[10px] font-bold text-emerald-500/50 uppercase tracking-wider">
                            Data
                        </div>
                        <button
                            onClick={() => handleExport('csv_nodes')}
                            className="w-full text-left px-4 py-2 text-xs text-gray-200 hover:bg-emerald-500/10 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            <Table className="w-3.5 h-3.5 text-blue-400" />
                            Nodes (CSV)
                        </button>
                        <button
                            onClick={() => handleExport('csv_edges')}
                            className="w-full text-left px-4 py-2 text-xs text-gray-200 hover:bg-emerald-500/10 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            <Share2 className="w-3.5 h-3.5 text-purple-400" />
                            Edges (CSV)
                        </button>
                        <button
                            onClick={() => handleExport('json')}
                            className="w-full text-left px-4 py-2 text-xs text-gray-200 hover:bg-emerald-500/10 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            <Code className="w-3.5 h-3.5 text-yellow-400" />
                            Full JSON
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
