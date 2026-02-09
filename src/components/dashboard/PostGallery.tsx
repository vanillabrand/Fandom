import React, { useState, useEffect } from 'react';
import { ExternalLink, Heart, MessageCircle, Play, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProxiedImage } from '../ProxiedImage.js';

interface PostRecord {
    id?: string;
    url: string;
    author?: string;
    text?: string;
    likes?: number; // Standardized
    likesCount?: number; // Legacy
    views?: number;
    caption?: string;
    commentsCount?: number;
    ownerUsername?: string;
    thumbnailUrl?: string;
    displayUrl?: string; // Image
    videoUrl?: string;   // Video
    type?: 'Image' | 'Video' | 'Sidecar';
    // Sentiment
    sentiment?: number;
    emotion?: string;
}

interface PostGalleryProps {
    title: string;
    data: PostRecord[];
}

// Helper to proxy URLs to bypass CORS
const getProxiedUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('/api/proxy')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
};

export const PostGallery: React.FC<PostGalleryProps> = ({ title, data }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    if (!data || data.length === 0) return (
        <div className="h-full flex items-center justify-center text-gray-500 bg-[#050B14] border border-[#1A2C42] rounded-lg">
            No media content available
        </div>
    );

    // Filter out invalid items but keep original indices mapping if needed, 
    // or just map sanitized list. Let's sanitize.
    const validPosts = data.filter(p => p.url || p.text);

    const handleNext = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (selectedIndex === null) return;
        setSelectedIndex((prev) => (prev! + 1) % validPosts.length);
    };

    const handlePrev = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (selectedIndex === null) return;
        setSelectedIndex((prev) => (prev! - 1 + validPosts.length) % validPosts.length);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedIndex === null) return;
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'Escape') setSelectedIndex(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, validPosts.length]);

    return (
        <div className="bg-[#050B14] border border-[#1A2C42] rounded-lg h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-[#1A2C42] flex justify-between items-center bg-[#0A1625]">
                <h3 className="text-emerald-400 text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                    {title} <span className="bg-[#1A2C42] text-white text-[10px] px-1.5 py-0.5 rounded-full">{validPosts.length}</span>
                </h3>
            </div>

            {/* Grid View */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {validPosts.map((post, idx) => {
                        const isVideo = post.videoUrl || post.type === 'Video';
                        const mediaSrc = getProxiedUrl(post.thumbnailUrl || post.displayUrl || post.url); // Fallback to URL if image
                        const likes = post.likes || post.likesCount || 0;

                        return (
                            <motion.div
                                key={idx}
                                layoutId={`post-${idx}`}
                                onClick={() => setSelectedIndex(idx)}
                                className="relative aspect-square bg-[#0F1A2A] rounded-lg border border-[#1A2C42] overflow-hidden cursor-pointer group hover:border-emerald-500/50 transition-all"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                {/* Media Background */}
                                {mediaSrc ? (
                                    <ProxiedImage
                                        src={mediaSrc}
                                        alt="content"
                                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center p-2 text-xs text-gray-500 text-center">
                                        {post.text?.substring(0, 50)}...
                                    </div>
                                )}

                                {/* Overlays */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                                {isVideo && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
                                            <Play size={14} className="fill-white text-white ml-0.5" />
                                        </div>
                                    </div>
                                )}

                                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
                                    <div className="text-[10px] text-gray-300 font-medium truncate flex-1 mr-2">
                                        @{post.author || post.ownerUsername || 'user'}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-md">
                                        <Heart size={8} className="fill-white" /> {likes > 1000 ? `${(likes / 1000).toFixed(1)}k` : likes}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Lightbox / Carousel */}
            <AnimatePresence>
                {selectedIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
                        onClick={() => setSelectedIndex(null)}
                    >
                        {/* Close Button */}
                        <button className="absolute top-4 right-4 text-white/50 hover:text-white p-2 z-50">
                            <X size={24} />
                        </button>

                        <div
                            className="bg-[#0A1625] border border-[#1A2C42] w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Navigation Buttons (Overlay) */}
                            <button
                                onClick={handlePrev}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full z-10 backdrop-blur-sm transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={handleNext}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full z-10 backdrop-blur-sm transition-all"
                            >
                                <ChevronRight size={24} />
                            </button>

                            {/* Media Section */}
                            <div className="w-full md:w-2/3 bg-black flex items-center justify-center relative">
                                {(() => {
                                    const post = validPosts[selectedIndex];
                                    const isVideo = post.videoUrl || post.type === 'Video';
                                    const mediaSrc = getProxiedUrl(isVideo ? post.videoUrl : (post.displayUrl || post.url));

                                    if (isVideo) {
                                        return (
                                            <video
                                                src={mediaSrc}
                                                controls
                                                autoPlay
                                                className="max-h-full max-w-full object-contain"
                                                poster={getProxiedUrl(post.thumbnailUrl)}
                                            />
                                        );
                                    }

                                    if (post.displayUrl || post.url || post.thumbnailUrl) {
                                        return (
                                            <ProxiedImage
                                                src={mediaSrc}
                                                alt="Post content"
                                                className="max-h-full max-w-full object-contain"
                                            />
                                        );
                                    }

                                    return (
                                        <div className="text-gray-500 p-8 text-center italic">
                                            Media unavailable
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Info Section */}
                            <div className="w-full md:w-1/3 border-l border-[#1A2C42] flex flex-col bg-[#0F1A2A]">
                                <div className="p-4 border-b border-[#1A2C42] flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                                        {(validPosts[selectedIndex].author || validPosts[selectedIndex].ownerUsername || '?')[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-200">
                                            @{validPosts[selectedIndex].author || validPosts[selectedIndex].ownerUsername || 'unknown'}
                                        </div>
                                        <div className="text-xs text-emerald-400">
                                            {validPosts[selectedIndex].type || 'Post'}
                                        </div>
                                    </div>
                                    <a
                                        href={validPosts[selectedIndex].url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto text-gray-500 hover:text-white"
                                    >
                                        <ExternalLink size={16} />
                                    </a>
                                </div>

                                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                        {validPosts[selectedIndex].text || validPosts[selectedIndex].caption || <span className="italic text-gray-600">No caption</span>}
                                    </p>

                                    {validPosts[selectedIndex].emotion && (
                                        <div className="mt-4">
                                            <span className="text-xs font-medium text-gray-500 uppercase tracking-widest block mb-2">Vibe Analysis</span>
                                            <span className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase
                                                ${(validPosts[selectedIndex].sentiment || 0) > 0.2 ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/20' :
                                                    (validPosts[selectedIndex].sentiment || 0) < -0.2 ? 'bg-red-900/40 text-red-400 border border-red-500/20' :
                                                        'bg-blue-900/40 text-blue-400 border border-blue-500/20'}`}>
                                                {validPosts[selectedIndex].emotion}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-[#1A2C42] bg-[#0A1625]">
                                    <div className="flex justify-between text-gray-400 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Heart size={16} className="text-red-400" />
                                            <span className="font-mono text-white">{(validPosts[selectedIndex].likes || validPosts[selectedIndex].likesCount || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <MessageCircle size={16} />
                                            <span className="font-mono">{(validPosts[selectedIndex].commentsCount || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
