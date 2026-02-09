
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Video as VideoIcon, Layers, Image as ImageIcon } from 'lucide-react';
import { ProxiedImage } from './ProxiedImage.js';
import { ProxiedVideo } from './ProxiedVideo.js';

interface MediaItem {
    id?: string;
    type: 'Image' | 'Video';
    url?: string;
    displayUrl: string;
    videoUrl?: string; // Optional specific video source
}

interface MediaPreviewProps {
    post: {
        type: 'Image' | 'Video' | 'Sidecar';
        url?: string; // Permalink
        displayUrl: string; // Main display (cover/image)
        videoUrl?: string;
        children?: MediaItem[];
        caption?: string;
    };
    className?: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({ post, className }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Normalize items: If sidecar with children, use children. Else use root.
    const items: MediaItem[] = (post.type === 'Sidecar' && post.children && post.children.length > 0)
        ? post.children
        : [{
            type: post.type === 'Sidecar' ? 'Image' : post.type, // Fallback if sidecar has no children
            displayUrl: post.displayUrl,
            videoUrl: post.videoUrl,
            url: post.url
        }];

    const currentItem = items[currentIndex];
    const hasMultiple = items.length > 1;

    const next = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % items.length);
    };

    const prev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    };

    return (
        <div className={`relative group bg-black/40 ${className}`}>
            {/* Media Renderer */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
                {currentItem.type === 'Video' || currentItem.videoUrl ? (
                    <ProxiedVideo
                        src={currentItem.videoUrl || currentItem.displayUrl}
                        poster={currentItem.displayUrl}
                        className="w-full h-full object-cover"
                        controls={false} // Hover to play? Or custom controls? Let's use simple hover play or just cover for now.
                        // Actually, auto-play muted on hover or click might be better. 
                        // For now, let's just show controls on hover if user interacts
                        muted
                        loop
                        playsInline
                        onMouseOver={(e) => e.currentTarget.play().catch(() => { })}
                        onMouseOut={(e) => e.currentTarget.pause()}
                    />
                ) : (
                    <ProxiedImage
                        src={currentItem.displayUrl}
                        alt="Media"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                )}
            </div>

            {/* Overlays / Indicators */}
            <div className="absolute top-2 right-2 flex gap-1">
                {post.type === 'Video' && <div className="p-1 bg-black/50 rounded-full text-white/80"><VideoIcon size={12} /></div>}
                {post.type === 'Sidecar' && <div className="p-1 bg-black/50 rounded-full text-white/80"><Layers size={12} /></div>}
            </div>

            {/* Navigation (Only if multiple) */}
            {hasMultiple && (
                <>
                    <button
                        onClick={prev}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={next}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-black/40 hover:bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                        <ChevronRight size={16} />
                    </button>

                    {/* Dots Indicator */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                        {items.map((_, idx) => (
                            <div
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentIndex ? 'bg-white' : 'bg-white/40'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
