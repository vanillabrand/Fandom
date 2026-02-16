
import React from 'react';

interface VisualDNAProps {
    data: any; // Allow flexible data structure
    className?: string;
}

const VisualDNAWidget: React.FC<VisualDNAProps> = ({ data, className = '' }) => {
    if (!data) return null;

    // [FIX] Support both flattened and nested (visualIdentity) formats
    // Sometimes backend wraps it in visualIdentity, sometimes it flattens it
    const visualData = data.visualIdentity || data || {};
    let { aestheticTags = [], vibeDescription = '', colorPalette = [] } = visualData;

    // Handle 'aesthetics' array variant
    if (aestheticTags.length === 0 && visualData.aesthetics && Array.isArray(visualData.aesthetics)) {
        aestheticTags = visualData.aesthetics.map((a: any) => typeof a === 'string' ? a : a.style || a.name).filter(Boolean);
    }

    // If all fields are empty, don't render anything
    if (aestheticTags.length === 0 && !vibeDescription && colorPalette.length === 0) {
        return null;
    }

    return (
        <div className={`space-y-6 py-4 ${className}`}>

            {/* Aesthetic Tags */}
            {aestheticTags && aestheticTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {aestheticTags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-pink-500/5 border border-pink-500/20 text-pink-300/80 text-[10px] uppercase tracking-wider font-medium rounded-sm shadow-sm hover:bg-pink-500/10 transition-colors cursor-default">
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Vibe Description */}
            {vibeDescription && (
                <div className="px-1">
                    <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-line font-light">
                        {vibeDescription}
                    </p>
                </div>
            )}

            {/* Color Palette */}
            {colorPalette && colorPalette.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Palette</span>
                    </div>
                    <div className="flex h-6 w-full rounded-sm overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                        {colorPalette.map((color, i) => (
                            <div
                                key={i}
                                className="flex-1 h-full relative group"
                                style={{ backgroundColor: color }}
                                title={color}
                            >
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
};

export default VisualDNAWidget;
