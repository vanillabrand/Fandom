import React, { useState } from 'react';
import { Trophy, Gamepad2, Gem, Crown, Footprints, Box, User, Network, Circle, Hexagon, Triangle, Database, Octagon } from 'lucide-react';

interface GraphLegendProps {
    comparisonMetadata?: any;
    visualTheme?: {
        archetype?: string; // [MODIFIED] Relaxed to string to match types.ts
        nodeTypeMapping?: Record<string, string>;
        primaryColor: string;
        textureStyle: string;
    };
}

const GraphLegend: React.FC<GraphLegendProps> = ({ comparisonMetadata, visualTheme }) => {

    const getIcon = (color: string, nodeType?: string) => {
        // [REMOVED] Dynamic SVG from Gemini Model (Reverting to standard nodes)

        // 2. Legacy Fallback
        if (!visualTheme || visualTheme.archetype === 'generic') {
            // Basic Shape Mapping if no theme
            const props = {
                className: "w-3 h-3 drop-shadow-[0_0_4px_currentColor]",
                style: { color: color, fill: nodeType === 'main' ? color : 'none' }
            };

            switch (nodeType) {
                case 'main': return <Triangle {...props} />; // Tetrahedron
                case 'cluster': return <Gem {...props} />; // Icosahedron
                case 'creator': return <Octagon {...props} />; // Dodecahedron
                case 'brand': return <Octagon {...props} />; // Dodecahedron
                case 'media':
                case 'post': return <Triangle {...props} />; // Cone
                case 'subtopic': return <Hexagon {...props} />; // Octahedron
                case 'concept': return <Octagon {...props} />; // Dodecahedron
                case 'topic': return <Circle {...props} />; // Sphere (for now)
                default: return <Circle {...props} />;
            }
        }

        const props = { className: "w-4 h-4", style: { color: color, filter: `drop-shadow(0 0 4px ${color})` } };
        // Determine Archetype (Global or Mapped Fallback)
        let archetype = visualTheme.archetype;
        if (visualTheme.nodeTypeMapping && nodeType && visualTheme.nodeTypeMapping[nodeType]) {
            // If it mapped to a string that matches a legacy key, use it
            const mapped = visualTheme.nodeTypeMapping[nodeType] as any;
            if (['shoe', 'trophy', 'gamepad', 'diamond', 'crown'].includes(mapped)) {
                archetype = mapped;
            }
        }

        switch (archetype) {
            case 'shoe': return <Footprints {...props} />;
            case 'trophy': return <Trophy {...props} />;
            case 'gamepad': return <Gamepad2 {...props} />;
            case 'diamond': return <Gem {...props} />;
            case 'crown': return <Crown {...props} />;
            default: return <Box {...props} />;
        }
    };

    const [isOpen, setIsOpen] = useState(false);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md p-3 rounded-full hover:bg-black/60 hover:text-white transition-all border border-white/10 z-50 group"
                title="Show Graph Legend"
            >
                <Database className="w-5 h-5 text-white/70 group-hover:text-white" />
            </button>
        );
    }

    return (
        <div className="graph-legend absolute bottom-4 right-4 bg-black/80 backdrop-blur-md p-4 rounded-lg z-50 text-xs font-mono select-none border border-white/10 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-white/60 uppercase tracking-widest text-[10px] font-bold">
                    Graph Index
                </h4>
                <button
                    onClick={() => setIsOpen(false)}
                    className="text-white/40 hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>

            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    {getIcon('#ffffff', 'main')}
                    <span className="text-white">Main Profile (Tetrahedron)</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#10b981', 'cluster')}
                    <span className="text-white">Cluster (Icosahedron)</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#f472b6', 'creator')}
                    <span className="text-white">Key Creator (Dodecahedron)</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#4f46e5', 'brand')}
                    <span className="text-white">Key Brand (Dodecahedron)</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#38bdf8', 'media')}
                    <span className="text-white">Media (Cone)</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#8b5cf6', 'topic')}
                    <span className="text-white">Topic / Interest</span>
                </div>
                <div className="flex items-center gap-2">
                    {getIcon('#f59e0b', 'subtopic')}
                    <span className="text-white">Subtopic (Octahedron)</span>
                </div>
            </div>
        </div>
    );
};

export default GraphLegend;
