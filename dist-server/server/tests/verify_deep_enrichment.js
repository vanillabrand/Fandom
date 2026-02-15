import { jobOrchestrator } from '../services/jobOrchestrator.js';
async function verifyEnrichmentGaps() {
    console.log("🧪 Verifying Deep Enrichment Gap Detection...");
    const testNodes = [
        {
            id: 'valid',
            group: 'creator',
            data: {
                followerCount: 1000,
                followingCount: 500,
                postsCount: 100,
                biography: "This is a valid bio for a creator."
            }
        },
        {
            id: 'missing_followers',
            group: 'creator',
            data: {
                followerCount: 0,
                followingCount: 500,
                postsCount: 100,
                biography: "Valid bio."
            }
        },
        {
            id: 'missing_posts',
            group: 'creator',
            data: {
                followerCount: 1000,
                followingCount: 500,
                postsCount: '-',
                biography: "Valid bio."
            }
        },
        {
            id: 'placeholder_bio',
            group: 'creator',
            data: {
                followerCount: 1000,
                followingCount: 500,
                postsCount: 100,
                biography: "Bio unavailable"
            }
        },
        {
            id: 'short_bio',
            group: 'creator',
            data: {
                followerCount: 1000,
                followingCount: 500,
                postsCount: 100,
                biography: "Hi"
            }
        }
    ];
    const analytics = {
        graph: { nodes: testNodes, links: [] }
    };
    console.log("Detecting gaps...");
    const gaps = await jobOrchestrator.identifyEnrichmentGaps(analytics);
    console.log("Gaps identified:", gaps);
    if (gaps.includes('valid'))
        throw new Error("❌ 'valid' node incorrectly identified as gap");
    if (!gaps.includes('missing_followers'))
        throw new Error("❌ Failed to detect missing followers (0)");
    if (!gaps.includes('missing_posts'))
        throw new Error("❌ Failed to detect missing posts ('-')");
    if (!gaps.includes('placeholder_bio'))
        throw new Error("❌ Failed to detect placeholder bio");
    if (!gaps.includes('short_bio'))
        throw new Error("❌ Failed to detect short bio");
    console.log("✅ Deep Enrichment Gap Detection Verified");
    console.log("\n✨ All Enrichment Verifications Passed!");
}
verifyEnrichmentGaps().catch(err => {
    console.error(err);
    process.exit(1);
});
