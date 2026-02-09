
import { analyzeQuery } from '../services/queryValidationService.js';
import { calculateOverindexing } from '../services/overindexingService.js'; // Just to check import

console.log("Starting Landing Page Query Verification...");

const queries = [
    { q: "map the over-indexed brands that followers of @twilio follow", expected: "overindexed" },
    { q: "find profiles who are developers for followers of @twilio", expected: "bio_search" },
    { q: "map the overindexed brands that followers of @underarmourfc follow", expected: "overindexed" },
    { q: "what subtopics are followers of @nike and @mrbeast talking about", expected: "topic_analysis" },
    { q: "compare Nike vs Adidas", expected: "comparison" },
    { q: "analyze the language of swifties", expected: "topic_analysis" },
    { q: "Where are the fans located?", expected: "geo_discovery" },
    { q: "map of the fandom", expected: "geo_discovery" },
    { q: "find developers that have more than 5000 followers", expected: "bio_search" },
    { q: "compare the overindexed brands of followers of @nike with those of @mrbeast", expected: "comparison" },
    { q: "map the overindexed profiles of the followers of @irnbru", expected: "overindexed" }
];

let passed = 0;
let failed = 0;

queries.forEach((testCase, idx) => {
    console.log(`\nTest ${idx + 1}: "${testCase.q}"`);

    const analysis = analyzeQuery(testCase.q);
    console.log(`   -> Detected Intent: ${analysis.intent}`);
    console.log(`   -> Detected Target: ${analysis.targetProfile || 'None'}`);

    if (analysis.intent === testCase.expected) {
        console.log("   [PASS] Intent matches.");
        passed++;
    } else {
        console.error(`   [FAIL] Expected '${testCase.expected}', got '${analysis.intent}'`);
        failed++;

        // Special case: 'comparison' might be detected as 'overindexed' if strict regex triggers first
        // We can accept partial matches if needed, but let's aim for strict first
    }
});

console.log(`\nSummary: ${passed}/${queries.length} passed.`);

if (failed === 0) {
    console.log(">>> ALL LANDING PAGE QUERIES VERIFIED.");
} else {
    console.error(">>> VERIFICATION FAILED.");
    process.exit(1);
}
