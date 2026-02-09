import { FandomData } from '../../types.js';

export const demoGraphData: any = {
    profileImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=60",
    profileFullName: "Sneaker Culture",
    summary: "A demonstration of the complex overlaps between Streetwear, Gaming, and Hip Hop culture.",
    nodes: [
        // Main Hubs
        { id: "Streetwear", group: "main", label: "Streetwear", val: 50 },
        { id: "Gaming", group: "main", label: "Gaming", val: 45 },
        { id: "Hip Hop", group: "main", label: "Hip Hop", val: 48 },

        // Brands
        { id: "Nike", group: "brand", label: "Nike", val: 30 },
        { id: "Supreme", group: "brand", label: "Supreme", val: 25 },
        { id: "Adidas", group: "brand", label: "Adidas", val: 20 },
        { id: "PlayStation", group: "brand", label: "PlayStation", val: 28 },
        { id: "Red Bull", group: "brand", label: "Red Bull", val: 22 },

        // Influencers / Creators
        { id: "Travis Scott", group: "creator", label: "Travis Scott", val: 35 },
        { id: "Kai Cenat", group: "creator", label: "Kai Cenat", val: 28 },
        { id: "Drake", group: "creator", label: "Drake", val: 30 },
        { id: "Ninja", group: "creator", label: "Ninja", val: 15 },
        { id: "Virgil Abloh", group: "creator", label: "Virgil Abloh", val: 32 },

        // Subtopics / Trends
        { id: "Reselling", group: "subtopic", label: "Reselling", val: 15 },
        { id: "Vintage", group: "subtopic", label: "Vintage", val: 18 },
        { id: "Streaming", group: "subtopic", label: "Streaming", val: 20 },
        { id: "Collabs", group: "subtopic", label: "Ltd Edition", val: 12 },
        { id: "Esports", group: "subtopic", label: "Esports", val: 14 },
    ],
    links: [
        // Core Connections
        { source: "Streetwear", target: "Nike", value: 5 },
        { source: "Streetwear", target: "Supreme", value: 5 },
        { source: "Streetwear", target: "Virgil Abloh", value: 4 },
        { source: "Streetwear", target: "Travis Scott", value: 4 },

        { source: "Hip Hop", target: "Drake", value: 3 },
        { source: "Hip Hop", target: "Travis Scott", value: 5 },
        { source: "Hip Hop", target: "Supreme", value: 2 },

        { source: "Gaming", target: "PlayStation", value: 4 },
        { source: "Gaming", target: "Kai Cenat", value: 5 },
        { source: "Gaming", target: "Ninja", value: 3 },
        { source: "Gaming", target: "Esports", value: 4 },

        // Cross-Pollination (The interesting stuff)
        { source: "Travis Scott", target: "Nike", value: 5 }, // Collab
        { source: "Travis Scott", target: "PlayStation", value: 3 }, // Collab
        { source: "Drake", target: "Nike", value: 3 },
        { source: "Nike", target: "Red Bull", value: 2 }, // Marketing overlap
        { source: "Red Bull", target: "Gaming", value: 4 },
        { source: "Red Bull", target: "Esports", value: 5 },
        { source: "Kai Cenat", target: "Hip Hop", value: 2 }, // Culture crossover
        { source: "Virgil Abloh", target: "Nike", value: 5 },

        // Trend Links
        { source: "Reselling", target: "Nike", value: 3 },
        { source: "Reselling", target: "Supreme", value: 4 },
        { source: "Vintage", target: "Streetwear", value: 3 },
        { source: "Streaming", target: "Gaming", value: 5 },
    ],
    analytics: {
        clusters: [] as any[],
        topContent: [] as any[],
        creators: [] as any[],
        brands: [] as any[],
        nonRelatedInterests: [] as any[],
        overindexedAccounts: [] as any[],
        visualAnalysis: {
            aestheticTags: ["Hype", "Digital", "Urban"],
            vibeDescription: "High-energy streetwear meet gaming culture",
            colorPalette: ["#FF0000", "#000000", "#FFFFFF"]
        },
        visualTheme: {
            archetype: 'gamepad',
            primaryColor: '#7c3aed', // violet-600
            textureStyle: 'matte'
        }
    }
};
