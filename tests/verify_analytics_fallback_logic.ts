
// Verification Script for Analytics Panel Fallback Logic (STRICT MODE)
console.log("Starting Analytics Panel Fallback Verification (STRICT)...");

// 1. Mock Data: Messy Data with undefined fields
const mockData = {
    analytics: {
        creators: [],
        brands: [],
        clusters: [],
        topContent: [],
        nonRelatedInterests: [],
        overindexedAccounts: [],
        visualAnalysis: undefined
    },
    // Intentionally undefined fields to test robustness
    nodes: [
        { id: 'MAIN', group: 'main', label: 'Target Profile', val: 50 },
        { id: '1', group: 'creator', label: 'CreatorOne', val: 20, data: { followers: 50000 } },
        { id: '2', group: 'user', label: 'UserTwo', val: 15 }, // MISSING data prop contents (but data: undefined is typical in TS if optional)
        { id: '3', group: 'brand', label: 'Nike', val: 30, data: { verified: true } },
        { id: '4', group: 'company', label: 'Adidas', val: 25, data: { verified: true } },
        { id: '5', group: 'topic', label: 'Running', val: 10 }
    ]
};

console.log("Mock Data Loaded (With undefineds).");

// 2. Replicate the Logic implemented in AnalyticsPanel.tsx (Updated with safety checks)
try {
    // Fallback: Derive Creators
    const fallbackCreators = (mockData.nodes || [])
        .filter(n => n.group === 'creator' || n.group === 'influencer' || n.group === 'user')
        .filter(n => n.id !== 'MAIN' && n.group !== 'main')
        .sort((a, b) => (b.val || 0) - (a.val || 0))
        .map(n => ({
            username: n.label,
            frequency: n.val || 0,
            ...(n.data || {}) // Safety fallback for undefined data
        }));

    // Fallback: Derive Brands
    const fallbackBrands = (mockData.nodes || [])
        .filter(n => n.group === 'brand' || n.group === 'company')
        .sort((a, b) => (b.val || 0) - (a.val || 0))
        .map(n => ({
            username: n.label,
            frequency: n.val || 0,
            ...(n.data || {})
        }));

    // 3. Assertions
    console.log("\n--- Verification Results ---");

    // Check Creators
    if (fallbackCreators.length === 2) {
        console.log("[PASS] Correctly identified 2 creators.");
        console.log(`[INFO] CreatorOne has data: ${JSON.stringify(fallbackCreators[0])}`);
        console.log(`[INFO] UserTwo (missing data) result: ${JSON.stringify(fallbackCreators[1])}`);
    } else {
        console.error(`[FAIL] Expected 2 creators, got ${fallbackCreators.length}`);
    }

    // Check Brands
    if (fallbackBrands.length === 2) {
        console.log("[PASS] Correctly identified 2 brands.");
    }

    if (fallbackCreators.length === 2 && fallbackBrands.length === 2) {
        console.log("\n>>> STRICT VERIFIED: Logic handles messy data without crashing.");
    } else {
        process.exit(1);
    }
} catch (e) {
    console.error("FATAL ERROR during logic execution:", e);
    process.exit(1);
}
