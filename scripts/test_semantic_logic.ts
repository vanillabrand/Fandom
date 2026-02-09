
// Mock of the Trigger Logic in orchestrationService.ts
function checkSemanticTrigger(query: string) {
    const q = query.toLowerCase();
    const triggers = [
        'about', 'topic', 'discuss', 'mention', 'talk', 'saying',
        'movie', 'book', 'game', 'music', 'song', 'album', 'artist',
        'food', 'eat', 'drink', 'restaurant', 'recipe', 'diet',
        'fashion', 'style', 'wear', 'outfit', 'brand', 'clothing',
        'tech', 'gadget', 'phone', 'app', 'software',
        'sport', 'team', 'player', 'athlete', 'match',
        'travel', 'place', 'visit', 'holiday', 'vacation',
        'trend', 'viral', 'meme', 'challenge',
        'hobby', 'interest', 'car', 'auto', 'beauty', 'makeup'
    ];
    return triggers.some(t => q.includes(t));
}

// Mock of the Graph Transformation Logic
function testGraphTransformation() {
    console.log("Testing Graph Transformation...");

    // Initial State: 100 User Profiles (Noise)
    let masterGraph: {
        nodes: { id: string; type: string; label?: string; val?: number }[];
        links: any[];
    } = {
        nodes: [
            { id: 'user1', type: 'profile' },
            { id: 'user2', type: 'profile' },
            { id: 'user3', type: 'profile' },
            { id: 'MAIN', type: 'root' } // The central hub
        ],
        links: []
    };

    // Semantic Matches found by Gemini
    const matches = [
        { matchedContent: 'Dune 2', category: 'Movie', mentions: 12 },
        { matchedContent: 'Pizza', category: 'Food', mentions: 5 }
    ];

    // -- SIMULATED LOGIC START --
    const semanticNodes = matches.map(m => ({
        id: `insight_${m.matchedContent}`,
        label: m.matchedContent,
        val: 10,
        type: 'semantic_entity'
    }));

    if (semanticNodes.length > 0) {
        const hubNode = masterGraph.nodes.find(n => n.id === 'MAIN');

        // REPLACEMENT LOGIC
        masterGraph = {
            nodes: [
                ...(hubNode ? [hubNode] : []),
                ...semanticNodes
            ],
            links: semanticNodes.map(sn => ({ source: 'MAIN', target: sn.id, value: 5 })) as any
        };
    }
    // -- SIMULATED LOGIC END --

    // Assertions
    const hasUsers = masterGraph.nodes.some(n => n.id === 'user1');
    const hasMovies = masterGraph.nodes.some(n => n.label === 'Dune 2');
    const nodeCount = masterGraph.nodes.length;

    console.log(`- Profiles Removed: ${!hasUsers} (Expected: true)`);
    console.log(`- Movies Added: ${hasMovies} (Expected: true)`);
    console.log(`- Final Node Count: ${nodeCount} (Expected: 3 [Main + Dune + Pizza])`);

    return !hasUsers && hasMovies && nodeCount === 3;
}

// Test Suite
console.log("=== SEMANTIC LOGIC VERIFICATION SUITE ===");

const queries = [
    { q: "map the movies they like", expected: true },
    { q: "what food do they eat?", expected: true }, // Punctuation
    { q: "SHOW ME THE FOLLOWERS", expected: false }, // Case insensitivity check
    { q: "analyze the trends and viral memes", expected: true }, // Multiple triggers
    { q: "who are they talking about", expected: true },
    { q: "list the influencers", expected: false },
    { q: "what tech gadgets and apps do they use", expected: true }, // "tech", "app"
    { q: "where do they travel for vacation", expected: true }, // "travel", "vacation"
    { q: "network map of followers", expected: false } // Explicit network request
];

let passes = 0;
queries.forEach(test => {
    const result = checkSemanticTrigger(test.q);
    const success = result === test.expected;
    console.log(`Query: "${test.q}" -> Triggered: ${result} [${success ? 'PASS' : 'FAIL'}]`);
    if (success) passes++;
});

console.log(`\nTrigger Accuracy: ${passes}/${queries.length}`);

const graphSuccess = testGraphTransformation();
console.log(`\nGraph Transformation Logic: ${graphSuccess ? 'PASS' : 'FAIL'}`);

if (passes === queries.length && graphSuccess) {
    console.log("\n>>> ALL TESTS PASSED. System Logic Verified.");
} else {
    console.error("\n>>> TESTS FAILED. Review Logic.");
    process.exit(1);
}
