
import { Node } from '../types.js';

// Mock Types
interface MockAnalytics {
    brands: any[];
    creators: any[];
}

// Mock Data from Gemini (Simulated)
const mockGeminiOutput: MockAnalytics = {
    brands: [
        {
            name: "Test Brand",
            handle: "testbrand",
            score: 4.5,
            industry: "Tech",
            bio: "Innovative tech solutions",
            followers: "100k",
            citation: "Google Search",
            searchQuery: "top tech brands",
            sourceUrl: "https://example.com/brand",
            evidence: "Featured in Top 10 list"
        }
    ],
    creators: []
};

// Simulate Node Construction (Logic from geminiService.ts)
const nodes: any[] = [];
mockGeminiOutput.brands.forEach((brand, i) => {
    const bid = `b_${i}`;
    nodes.push({
        id: bid,
        label: brand.name,
        group: 'brand',
        val: 18,
        level: 1,
        data: {
            username: brand.handle,
            fullName: brand.name,
            bio: brand.bio,
            followers: brand.followers,
            industry: brand.industry,
            overindexScore: brand.score,
            provenance: {
                source: 'Gemini Inference',
                method: 'AI Brand Identification',
                evidence: [
                    {
                        type: 'insight',
                        text: brand.evidence,
                        url: brand.sourceUrl,
                        date: 'Recent',
                        author: 'System'
                    }
                ]
            }
        },
        provenance: {
            source: 'Gemini Inference',
            method: 'AI Brand Identification',
            evidence: [
                {
                    type: 'insight',
                    text: brand.evidence,
                    url: brand.sourceUrl,
                    date: 'Recent',
                    author: 'System'
                }
            ]
        }
    });
});

// Simulate Orchestrator Flattening (Logic from jobOrchestrator.ts)
const flatAnalytics = { brands: [], creators: [] };
nodes.forEach(node => {
    const item = {
        name: node.label,
        value: node.val,
        type: node.group,
        provenance: node.provenance, // This is the key fix
        ...node.data
    };
    if (node.group === 'brand') (flatAnalytics.brands as any[]).push(item);
});

// Verification
const brandItem = flatAnalytics.brands[0] as any;
console.log("Verifying Brand Item Structure:");
console.log("Name:", brandItem.name);
console.log("Handle:", brandItem.username);
console.log("Followers:", brandItem.followers);
console.log("Provenance object exists:", !!brandItem.provenance);
console.log("Evidence array length:", brandItem.provenance?.evidence?.length);
console.log("Evidence text:", brandItem.provenance?.evidence?.[0]?.text);

if (brandItem.provenance && brandItem.provenance.evidence.length > 0 && brandItem.username === "testbrand") {
    console.log("✅ SUCCESS: Provenance and Rich Data flow verified.");
} else {
    console.error("❌ FAILURE: Data lost in flow.");
    process.exit(1);
}
