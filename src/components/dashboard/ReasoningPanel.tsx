import React, { useState, useMemo, useCallback } from 'react';
import { Node } from '../../../types.js'; // Adjust path as needed
import { Shield, ShieldCheck, ShieldAlert, Database, Calculator, BrainCircuit, Clock, Download, Search, Sparkles, ExternalLink, Image as ImageIcon, Play, X, Maximize2 } from 'lucide-react';
import { ProxiedImage } from '../ProxiedImage.js';
import { ProxiedVideo } from '../ProxiedVideo.js';
import { motion, AnimatePresence } from 'framer-motion';

interface ReasoningPanelProps {
    item: { provenance?: any; label?: string; name?: string; id?: string };
    dataset?: any[]; // The actual dataset to search for evidence
    className?: string;
    onClose?: () => void;
    hideHeader?: boolean;
}

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ item, dataset = [], className = '', onClose, hideHeader = false }) => {
    const [selectedMedia, setSelectedMedia] = useState<any>(null);

    if (!item || !item.provenance) return null;

    const { source, method, confidence, timestamp, steps, evidence: providedEvidence } = item.provenance;

    // [PERFORMANCE] Memoize expensive dataset search
    const searchDatasetForEvidence = useMemo(() => {
        const itemLabel = (item.label || item.name || item.id || '').replace(/^@/, '').toLowerCase();
        const foundEvidence: any[] = [];

        // Search through the provided dataset
        if (dataset && Array.isArray(dataset) && dataset.length > 0) {
            dataset.forEach((record: any) => {
                const username = (record.username || record.ownerUsername || '').toLowerCase();
                const textOriginal = (record.caption || record.text || record.biography || '');
                const textLower = textOriginal.toLowerCase();
                const author = (record.author || '').toLowerCase();

                // Match if username matches OR text mentions the item
                if (username === itemLabel || author === itemLabel || textLower.includes(itemLabel)) {
                    // Extract excerpt with context (show surrounding text around the mention)
                    let excerpt = textOriginal;
                    if (textLower.includes(itemLabel) && textOriginal.length > 150) {
                        const index = textLower.indexOf(itemLabel);
                        const start = Math.max(0, index - 50);
                        const end = Math.min(textOriginal.length, index + itemLabel.length + 100);
                        excerpt = (start > 0 ? '...' : '') +
                            textOriginal.slice(start, end) +
                            (end < textOriginal.length ? '...' : '');
                    }

                    // Construct accurate URL based on record type and platform
                    let evidenceUrl = '#';
                    const username = record.username || record.ownerUsername || record.author;

                    // Try to use existing URL first
                    if (record.url && record.url.startsWith('http')) {
                        evidenceUrl = record.url;
                    } else if (record.postUrl && record.postUrl.startsWith('http')) {
                        evidenceUrl = record.postUrl;
                    } else if (record.externalUrl && record.externalUrl.startsWith('http')) {
                        evidenceUrl = record.externalUrl;
                    }
                    // Construct URL from shortCode (Instagram posts)
                    else if (record.shortCode) {
                        evidenceUrl = `https://www.instagram.com/p/${record.shortCode}/`;
                    }
                    // Construct URL from webVideoUrl (TikTok)
                    else if (record.webVideoUrl && record.webVideoUrl.startsWith('http')) {
                        evidenceUrl = record.webVideoUrl;
                    }
                    // Construct profile URL from username
                    else if (username) {
                        const cleanUsername = username.replace('@', '');
                        // Detect platform from record data
                        if (record.platform === 'tiktok' || record.recordType?.includes('tiktok')) {
                            evidenceUrl = `https://www.tiktok.com/@${cleanUsername}`;
                        } else {
                            // Default to Instagram
                            evidenceUrl = `https://www.instagram.com/${cleanUsername}/`;
                        }
                    }

                    foundEvidence.push({
                        type: record.recordType || 'post',
                        text: excerpt || textOriginal || 'No text content',
                        author: username || 'Unknown',
                        date: record.timestamp || record.createdAt || 'Unknown date',
                        url: evidenceUrl,
                        mediaUrl: record.displayUrl || record.imageUrl || record.thumbnailUrl || record.videoCover || record.profile_pic_url,
                        videoUrl: record.videoUrl || record.webVideoUrl || (record.videoCover ? record.webVideoUrl : undefined),
                        mediaType: (record.videoCover || record.webVideoUrl || record.videoUrl) ? 'video' : 'image'
                    });
                }
            });
        }

        return foundEvidence.slice(0, 10); // Limit to 10 results
    }, [item.label, item.name, item.id, dataset]);

    // [PERFORMANCE] Memoize evidence resolution
    const evidence = useMemo(() => {
        return (providedEvidence && providedEvidence.length > 0)
            ? providedEvidence
            : searchDatasetForEvidence;
    }, [providedEvidence, searchDatasetForEvidence]);

    // Helper: Confidence Level UI
    const getConfidenceUI = (conf: number = 1.0) => {
        if (conf >= 0.9) return { icon: ShieldCheck, color: 'text-emerald-400', label: 'High Confidence' };
        if (conf >= 0.7) return { icon: Shield, color: 'text-yellow-400', label: 'Medium Confidence' };
        return { icon: ShieldAlert, color: 'text-red-400', label: 'Low Confidence' };
    };

    // Helper: Source Icons - Enhanced with more specific detection
    const getSourceIcons = (prov: any) => {
        const icons = [];
        const s = (prov.source || '').toLowerCase();
        const m = (prov.method || '').toLowerCase();
        const actorId = (prov.actorId || prov.actor || '').toLowerCase();

        // Apify Scrapers (specific actors)
        if (s.includes('apify') || actorId.includes('apify') || s.includes('scraper') || m.includes('scraper')) {
            let scraperLabel = 'Apify Scraper';
            if (actorId.includes('instagram-followers') || s.includes('followers')) {
                scraperLabel = 'Follower Scrape';
            } else if (actorId.includes('instagram-profile') || s.includes('profile')) {
                scraperLabel = 'Profile Scrape';
            } else if (actorId.includes('instagram-scraper') || actorId.includes('instagram-api')) {
                scraperLabel = 'Instagram Search';
            } else if (actorId.includes('tiktok')) {
                scraperLabel = 'TikTok Scraper';
            }
            icons.push({ icon: Download, label: scraperLabel, color: 'text-blue-400' });
        }

        // Google Search
        if (s.includes('google') || m.includes('google') || s.includes('search engine')) {
            icons.push({ icon: Search, label: 'Google Search', color: 'text-purple-400' });
        }

        // Gemini AI Analysis
        if (s.includes('gemini') || m.includes('gemini') || s.includes('ai') || m.includes('ai') ||
            m.includes('inference') || m.includes('llm') || m.includes('semantic')) {
            let aiLabel = 'Gemini AI';
            if (m.includes('gemini 2.0') || s.includes('gemini-2.0')) {
                aiLabel = 'Gemini 2.0 Flash';
            } else if (m.includes('gemini 1.5') || s.includes('gemini-1.5')) {
                aiLabel = 'Gemini 1.5 Pro';
            } else if (m.includes('semantic')) {
                aiLabel = 'Semantic Analysis';
            }
            icons.push({ icon: Sparkles, label: aiLabel, color: 'text-pink-400' });
        }

        // Statistical/Clustering
        if (m.includes('statistical') || m.includes('clustering') || m.includes('over-index')) {
            icons.push({ icon: Calculator, label: 'Statistical Analysis', color: 'text-emerald-400' });
        }

        // Fallback
        if (icons.length === 0) {
            icons.push({ icon: Database, label: 'Dataset', color: 'text-gray-400' });
        }
        return icons;
    };

    const confUI = getConfidenceUI(confidence);
    const sourceIcons = getSourceIcons(item.provenance);


    return (
        <div className={`bg-[#051810]/50 border border-emerald-500/20 rounded-lg p-3 ${className}`}>
            {!hideHeader && (
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/10 pb-2">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-emerald-300" />
                        <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Data Provenance</span>
                    </div>
                    <div className="flex gap-1">
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-emerald-500/10 rounded transition-colors text-emerald-500/50 hover:text-emerald-400"
                            >
                                <span className="text-xs font-bold px-1">✕</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-3">


                {/* [NEW] Explicit Citation & Search Query */}
                {(item.provenance.citation || item.provenance.searchQuery) && (
                    <div className="bg-[#050B14]/80 p-3 rounded border border-emerald-500/20 mb-3 shadow-inner">
                        {item.provenance.citation && (
                            <div className="mb-2">
                                <div className="text-[9px] text-emerald-400 font-bold uppercase mb-1">Citation Rule</div>
                                <div className="text-xs text-gray-200 italic border-l-2 border-emerald-500/50 pl-2">
                                    "{item.provenance.citation}"
                                </div>
                            </div>
                        )}
                        {/* [FIX] Display Evidence Source/Context instead of generic Query */}
                        {(item.provenance.searchQuery || (item.provenance as any).evidenceSource) && (
                            <div className="mb-2">
                                <div className="text-[9px] text-purple-400 font-bold uppercase mb-1">Evidence Context</div>
                                <div className="text-[10px] font-mono text-gray-300 bg-black/40 p-1.5 rounded flex items-center gap-2">
                                    <Search className="w-3 h-3 text-purple-500" />
                                    <span>{(item.provenance as any).evidenceSource || item.provenance.searchQuery}</span>
                                </div>
                            </div>
                        )}
                        {item.provenance.sourceUrl && (
                            <div>
                                <div className="text-[9px] text-blue-400 font-bold uppercase mb-1">Primary Source</div>
                                <a href={item.provenance.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-300 hover:text-white underline truncate block flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" />
                                    {item.provenance.sourceUrl}
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Calculation Methodology */}
                {item.provenance.calculationDetails && (
                    <div className="bg-white/5 rounded p-3 border border-emerald-500/10">
                        <div className="text-[10px] font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            CALCULATION METHOD
                        </div>

                        {/* Calculation Type */}
                        <div className="text-[10px] text-gray-300 mb-2">
                            <span className="text-emerald-400 font-bold">Type:</span> {item.provenance.calculationDetails.type}
                        </div>

                        {/* Formula */}
                        <div className="text-[10px] text-gray-300 mb-3 font-mono bg-black/30 p-2 rounded border border-emerald-500/5">
                            {item.provenance.calculationDetails.formula}
                        </div>

                        {/* Source Datasets */}
                        {item.provenance.calculationDetails.datasets && item.provenance.calculationDetails.datasets.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[9px] text-emerald-400 font-bold mb-1.5">Source Datasets:</div>
                                {item.provenance.calculationDetails.datasets.map((ds, idx) => (
                                    <div key={idx} className="text-[9px] text-gray-400 ml-2 mb-1 flex items-start gap-1">
                                        <span className="text-emerald-500/50">•</span>
                                        <div>
                                            <span className="text-emerald-300 font-medium">{ds.label}</span>
                                            <span className="text-gray-500"> ({ds.recordCount.toLocaleString()} records)</span>
                                            {ds.description && <span className="text-gray-600"> - {ds.description}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Calculation Steps */}
                        {item.provenance.calculationDetails.steps && item.provenance.calculationDetails.steps.length > 0 && (
                            <div>
                                <div className="text-[9px] text-emerald-400 font-bold mb-1.5">Calculation Steps:</div>
                                {item.provenance.calculationDetails.steps.map((step, idx) => (
                                    <div key={idx} className="text-[9px] text-gray-300 ml-2 mb-2">
                                        <div className="flex items-start gap-1.5">
                                            <span className="text-emerald-500/70 font-bold">{idx + 1}.</span>
                                            <div className="flex-1">
                                                <div className="text-gray-200">{step.description}</div>
                                                {step.formula && (
                                                    <div className="font-mono text-gray-500 ml-3 mt-0.5 text-[8px] bg-black/20 px-1.5 py-0.5 rounded inline-block">
                                                        → {step.formula}
                                                    </div>
                                                )}
                                                {step.output && (
                                                    <div className="text-gray-600 ml-3 mt-0.5">
                                                        Result: <span className="text-emerald-400 font-mono">{typeof step.output === 'object' ? JSON.stringify(step.output) : step.output}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}



                {/* Steps Trace */}
                {steps && steps.length > 0 && (
                    <div className="mt-2 text-[10px] font-mono text-gray-400 bg-black/20 p-2 rounded">
                        <div className="mb-1 text-emerald-500/50 uppercase">Trace</div>
                        <div className="flex flex-wrap gap-1">
                            {steps.map((step, i) => (
                                <span key={i} className="flex items-center">
                                    {i > 0 && <span className="mx-1 text-gray-600">→</span>}
                                    <span className="bg-[#1a4d2e]/30 px-1 rounded">{step}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Evidence Links - Always show this section */}
                <div className="mt-2 pt-2 border-t border-emerald-500/10">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Search className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Source Evidence</span>
                    </div>
                    {evidence && evidence.length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-emerald-500/20">
                            {evidence.map((ev: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="block p-2 rounded bg-white/5 hover:bg-white/10 transition-colors border border-emerald-500/5 hover:border-emerald-500/20 group cursor-pointer"
                                    onClick={(e) => {
                                        if (ev.mediaUrl || ev.videoUrl) {
                                            setSelectedMedia(ev);
                                        }
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        {/* Media Preview */}
                                        {(ev.mediaUrl || ev.videoUrl) && (
                                            <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden border border-emerald-500/20 relative">
                                                <ProxiedImage
                                                    src={ev.mediaUrl || ev.thumbnailUrl}
                                                    alt={ev.author || 'Post'}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    fallback={
                                                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                            <ImageIcon className="w-6 h-6 text-white/20" />
                                                        </div>
                                                    }
                                                />
                                                {ev.mediaType === 'video' && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                                                        <Play size={12} className="text-white fill-white opacity-80" />
                                                    </div>
                                                )}
                                                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5">
                                                    <Maximize2 size={8} className="text-white" />
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] text-emerald-300 font-bold mb-0.5 flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full ${ev.type === 'bio' ? 'bg-purple-500' :
                                                    ev.type === 'post' ? 'bg-blue-500' :
                                                        ev.type === 'social_graph' ? 'bg-orange-500' : 'bg-gray-500'
                                                    }`}></span>
                                                {ev.date}
                                                {ev.author && <span className="text-gray-400">• @{ev.author}</span>}
                                            </div>
                                            <div className="text-[10px] text-gray-300 line-clamp-2 font-light group-hover:text-white">
                                                "{ev.text}"
                                            </div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                            {ev.url && ev.url !== '#' && (
                                                <a
                                                    href={ev.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1 hover:bg-emerald-500/20 rounded-md"
                                                >
                                                    <ExternalLink className="w-3 h-3 text-emerald-500" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* [NEW] Media Lightbox */}
                            <AnimatePresence>
                                {selectedMedia && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 md:p-10"
                                        onClick={() => setSelectedMedia(null)}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                            className="relative bg-[#051810] border border-emerald-500/30 rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {/* Close button */}
                                            <button
                                                onClick={() => setSelectedMedia(null)}
                                                className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition-all backdrop-blur-md"
                                            >
                                                <X size={20} />
                                            </button>

                                            {/* Media Content */}
                                            <div className="flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[300px]">
                                                {selectedMedia.mediaType === 'video' || selectedMedia.videoUrl ? (
                                                    <ProxiedVideo
                                                        src={selectedMedia.videoUrl || selectedMedia.mediaUrl}
                                                        poster={selectedMedia.mediaUrl}
                                                        className="h-full w-full object-contain"
                                                        autoPlay
                                                        controls
                                                        muted={false}
                                                    />
                                                ) : (
                                                    <ProxiedImage
                                                        src={selectedMedia.mediaUrl}
                                                        className="max-h-full max-w-full object-contain"
                                                        alt="Evidence"
                                                    />
                                                )}
                                            </div>

                                            {/* Info Footer */}
                                            <div className="p-5 border-t border-emerald-500/20 bg-gradient-to-b from-[#051810] to-[#010805]">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs border border-emerald-500/30">
                                                            {selectedMedia.author ? selectedMedia.author[0].toUpperCase() : '?'}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold text-emerald-50 tracking-wide">@{selectedMedia.author || 'unknown'}</div>
                                                            <div className="text-[10px] text-emerald-500/70 font-mono uppercase">{selectedMedia.date}</div>
                                                        </div>
                                                    </div>
                                                    {selectedMedia.url && selectedMedia.url !== '#' && (
                                                        <a
                                                            href={selectedMedia.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-400 text-xs font-bold transition-colors border border-emerald-500/20"
                                                        >
                                                            <span>Open Original</span>
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-300 leading-relaxed font-light italic border-l-2 border-emerald-500/30 pl-4 py-1">
                                                    "{selectedMedia.text}"
                                                </div>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <div className="p-3 rounded bg-white/5 border border-emerald-500/10">
                            <div className="text-[10px] text-gray-400 leading-relaxed mb-2">
                                No direct text matches found in the current dataset. This result was identified through {method?.toLowerCase().includes('statistical') || method?.toLowerCase().includes('clustering') ? (
                                    <span className="text-emerald-400">statistical aggregation and pattern analysis</span>
                                ) : method?.toLowerCase().includes('over-index') ? (
                                    <span className="text-orange-400">follower network overlap analysis</span>
                                ) : method?.toLowerCase().includes('ai') || method?.toLowerCase().includes('gemini') ? (
                                    <span className="text-pink-400">AI semantic analysis</span>
                                ) : (
                                    <span className="text-emerald-400">data analysis</span>
                                )} of the complete dataset.
                            </div>
                            {(() => {
                                // Show what data we actually have
                                const itemData = (item as any).data;
                                if (itemData) {
                                    return (
                                        <div className="mt-2 p-2 rounded bg-black/20 border border-emerald-500/5">
                                            <div className="text-[9px] text-emerald-500/70 uppercase mb-1">Available Data</div>
                                            <div className="text-[10px] text-gray-300 space-y-0.5">
                                                {itemData.username && <div>• Username: @{itemData.username}</div>}
                                                {itemData.fullName && <div>• Name: {itemData.fullName}</div>}
                                                {itemData.followerCount && <div>• Followers: {itemData.followerCount.toLocaleString()}</div>}
                                                {itemData.biography && <div>• Bio: "{itemData.biography.slice(0, 80)}..."</div>}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
