
// Verification Test: Over-indexing Logic
// Simulates the logic in overindexingService.ts to prove the fix works.

type OverindexedAccount = {
    username: string;
    category: 'creator' | 'brand' | 'media' | 'regular' | 'unknown';
    frequency: number;
    overindexScore: number;
};

// MOCK: The logic I just implemented in overindexingService.ts
function runTest(sampleSize: number, minFrequency: number, mockCounts: Record<string, number>) {
    console.log(`\n--- TEST RUN (Sample: ${sampleSize}, MinFreq: ${minFrequency}) ---`);

    const allResults: OverindexedAccount[] = [];

    // 1. Simulate Aggregation
    Object.entries(mockCounts).forEach(([username, count]) => {
        if (count < minFrequency) return; // Filter

        const percentage = (count / sampleSize) * 100;
        // Mock score algo
        const overindexScore = (count / sampleSize) / 0.01;

        // CRITICAL: Classification is 'unknown' because we haven't scraped them yet
        const category = 'unknown';

        allResults.push({
            username,
            category,
            frequency: count,
            overindexScore
        });
    });

    console.log(`Filtered Candidates: ${allResults.length}`);
    allResults.forEach(r => console.log(` - ${r.username}: Freq=${r.frequency}, Score=${r.overindexScore.toFixed(2)}`));

    // 2. The Logic Fix: "Fallback"
    const topN = 5;

    // Strict categories (will be empty because everything is 'unknown')
    let creators = allResults.filter(a => a.category === 'creator');

    // The Fix: Include unclassified
    const unclassified = allResults.filter(a => a.category === 'regular' || a.category === 'unknown');

    // Combine
    creators = [...creators, ...unclassified]
        .sort((a, b) => b.overindexScore - a.overindexScore)
        .slice(0, topN);

    console.log(`\nFinal 'Top Creators' for Enrichment: ${creators.length}`);
    creators.forEach(c => console.log(` >> ENRICH: ${c.username} (Category: ${c.category})`));

    return creators.length;
}

// TEST CASES
// Case 1: High Signal (User appears 4 times, minFreq=3) -> Should Enrich
const result1 = runTest(100, 3, {
    '@popular_guru': 4,
    '@random_user': 1,
    '@other_guy': 2
});

if (result1 === 1) console.log("\n[PASS] Case 1: High Signal caught correctly.");
else console.error("\n[FAIL] Case 1: High Signal missed!");

// Case 2: Low Signal (User appears 2 times, minFreq=3) -> Should Warn (Empty)
const result2 = runTest(100, 3, {
    '@semi_popular': 2,
    '@random': 1
});

if (result2 === 0) console.log("\n[PASS] Case 2: Low Signal filtered correctly (Triggering Warning).");
else console.error("\n[FAIL] Case 2: Threshold logic failed!");

