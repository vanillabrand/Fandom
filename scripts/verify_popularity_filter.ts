
// Mock the Normalization Logic from orchestrationService.ts

const matches = [
    { matchedContent: "Game", category: "Topic" },
    { matchedContent: "game", category: "Topic" }, // Case diff
    { matchedContent: "   Apple  ", category: "Topic" }, // Whitespace diff
    { matchedContent: "apple", category: "Topic" },
    { matchedContent: "Unique", category: "Topic" } // Singleton (Should be filtered out)
];

console.log("Input Matches:", matches.map(m => m.matchedContent));

// --- COPIED LOGIC START ---
// 1. [FIX] Normalize & Aggregate Matches (Case-Insensitive)
const normalizedGroups = new Map<string, { label: string, count: number, matches: any[] }>();

matches.forEach((m: any) => {
    if (!m.matchedContent) return;
    const key = m.matchedContent.trim().toLowerCase();
    if (!normalizedGroups.has(key)) {
        normalizedGroups.set(key, {
            label: m.matchedContent, // Keep first instance as display label
            count: 0,
            matches: []
        });
    }
    const entry = normalizedGroups.get(key)!;
    entry.count++;
    entry.matches.push(m);

    // Heuristic: Prefer Capitalized Label if available
    if (m.matchedContent[0] === m.matchedContent[0].toUpperCase() && entry.label[0] !== entry.label[0].toUpperCase()) {
        entry.label = m.matchedContent;
    }
});

// [POPULARITY FILTER] Only show topics mentioned multiple times
const MIN_OCCURRENCES = 2;

const popularAnswers = Array.from(normalizedGroups.values())
    .filter(g => g.count >= MIN_OCCURRENCES)
    .map(g => g.label);

console.log(`[Popularity Filter] ${normalizedGroups.size} normalized topics -> ${popularAnswers.length} popular topics`);
console.log("Popular Topics:", popularAnswers);

// --- VERIFICATION ---
const passed = popularAnswers.includes("Game") && popularAnswers.includes("   Apple  ") || popularAnswers.includes("Apple") || popularAnswers.includes("apple");
const singletonFiltered = !popularAnswers.includes("Unique");

if (popularAnswers.length === 2 && singletonFiltered) {
    console.log("✅ TEST PASSED: Normalization correctly aggregated topics and filtered singletons.");
} else {
    console.error("❌ TEST FAILED: Logic did not behave as expected.");
    process.exit(1);
}
