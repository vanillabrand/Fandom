import React from 'react';
import { MediaPreview } from '../MediaPreview';
import { EvidenceItem } from '../../utils/analytics/evidenceUtils';

interface MediaGalleryProps {
    items: EvidenceItem[];
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({ items }) => {
    // [FIX] Support both media and text-only evidence
    const uniqueItems = items.filter((item, index, self) =>
        index === self.findIndex((t) => (
            (t.text && item.text && t.text === item.text && t.author === item.author) ||
            (t.url && item.url && t.url === item.url && t.url !== '#')
        ))
    );

    if (uniqueItems.length === 0) {
        return <div className="text-xs text-gray-500 italic p-2">No evidence found.</div>;
    }

    return (
        <div className="grid grid-cols-2 gap-2">
            {uniqueItems.map((item: any, idx: number) => {
                const hasMedia = item.displayUrl || item.videoUrl || item.children;

                if (!hasMedia) {
                    return (
                        <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10 group block cursor-pointer transition-transform hover:scale-[1.02] hover:bg-white/10 p-3 flex flex-col justify-between"
                        >
                            <div className="text-[9px] text-gray-300 line-clamp-6 leading-relaxed italic">
                                "{item.text}"
                            </div>
                            <div className="mt-2 text-[9px] text-white font-bold truncate border-t border-white/10 pt-1">
                                {item.author || 'Unknown'}
                            </div>
                        </a>
                    );
                }

                return (
                    <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden bg-black/20 group block cursor-pointer transition-transform hover:scale-[1.02]"
                    >
                        <MediaPreview
                            post={{
                                type: item.postType || (item.videoUrl ? 'Video' : 'Image'),
                                url: item.url,
                                displayUrl: item.displayUrl,
                                videoUrl: item.videoUrl,
                                children: item.children
                            }}
                            className="w-full h-full"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                            <div className="text-[9px] text-white font-bold truncate">{item.author || 'Unknown'}</div>
                            <div className="text-[8px] text-gray-300 line-clamp-2">{item.text}</div>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
