
import React, { useState } from 'react';
import { Search, Share2, Trash2, X, FolderOpen, Calendar, Map, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedMap {
    id: string;
    name: string;
    date: string;
    config: any;
}

interface SavedMapsModalProps {
    isOpen: boolean;
    onClose: () => void;
    maps: SavedMap[];
    onLoad: (map: SavedMap) => void;
    onDelete: (id: string) => void;
    currentMapId: string | null;
    hasMore: boolean;
    onLoadMore: () => void;
}

export const SavedMapsModal: React.FC<SavedMapsModalProps> = ({
    isOpen,
    onClose,
    maps,
    onLoad,
    onDelete,
    currentMapId,
    hasMore,
    onLoadMore
}) => {
    const [search, setSearch] = useState('');

    const filteredMaps = maps.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.config?.profile || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-[#0a1f16] border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-emerald-500/20 bg-[#1a4d2e]/20">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <FolderOpen className="text-emerald-500" />
                                    Saved Maps Library
                                </h2>
                                <p className="text-xs text-emerald-400/70 mt-1">
                                    Access your historical Fandom maps and analyses
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="p-4 border-b border-emerald-500/10 bg-[#051810]/50">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-emerald-500/70" />
                                <input
                                    type="text"
                                    placeholder="Search saved maps by name or keyword..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-[#0a1f16] border border-emerald-500/30 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                                />
                            </div>
                        </div>

                        {/* Maps List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {filteredMaps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <FolderOpen size={48} className="text-emerald-500/20 mb-3" />
                                    <p className="text-gray-400 text-sm">No saved maps found matching "{search}"</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2">
                                    {filteredMaps.map((map) => (
                                        <div
                                            key={map.id}
                                            onClick={() => { onLoad(map); onClose(); }}
                                            className={`group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all duration-200
                                                ${currentMapId === map.id
                                                    ? 'bg-emerald-900/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                    : 'bg-[#0f291e] border-transparent hover:border-emerald-500/30 hover:bg-[#153426]'
                                                }
                                            `}
                                        >
                                            <div className="flex items-start gap-3 overflow-hidden">
                                                <div className={`p-2 rounded-lg ${currentMapId === map.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-black/20 text-emerald-600 group-hover:text-emerald-500'}`}>
                                                    <Map size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-bold text-gray-200 truncate group-hover:text-white transition-colors">
                                                        {map.name}
                                                    </h3>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                                                            <Calendar size={10} />
                                                            {map.date}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                                                            <Clock size={10} />
                                                            {map.config?.profile || 'Analysis'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                                                {(map as any).publicId && (
                                                    <a
                                                        href={`/share/${(map as any).publicId}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-2 text-emerald-500 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors"
                                                        title="View Public Link"
                                                    >
                                                        <Share2 size={16} />
                                                    </a>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(map.id); }}
                                                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                                    title="Delete Map"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {hasMore && (
                                <button
                                    onClick={onLoadMore}
                                    className="w-full mt-4 py-3 text-xs font-bold text-emerald-400 uppercase tracking-widest hover:bg-emerald-500/10 border border-dashed border-emerald-500/30 rounded-lg transition-colors"
                                >
                                    Load More Archived Maps
                                </button>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
