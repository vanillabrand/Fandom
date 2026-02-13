
import { JobOrchestrator } from './server/services/jobOrchestrator.js';

async function testRound2Fixes() {
    const orchestrator = JobOrchestrator.getInstance();

    console.log("--- Testing Round 2 Fixes (Jack Grealish Case) ---");

    // Case 1: Jack Grealish with @pumafootball in bio
    const analytics1 = {
        nodes: [
            {
                id: 'jack_node',
                label: 'Jack Grealish',
                group: 'creator',
                data: {
                    bio: 'Everton & England @pumafootball Athlete'
                }
            }
        ]
    };
    const gaps1 = (orchestrator as any).identifyEnrichmentGaps(analytics1);
    console.log("Case 1 (Jack Grealish - Slugify vs Bio):", gaps1);
    // Expected: ['jackgrealish'] (NOT pumafootball)

    // Case 2: Kobi Brown with @astrokobi in bio (Bio handle is candidate, but slugified exists)
    // Actually our logic says if slugified is radically different, use slugified.
    // 'kobibrown' is fairly similar to 'astrokobi' in context? 
    // Wait, 'astrokobi' doesn't contain 'kobi'? Yes it does. 'astrokobi'.includes('kobi').
    // So 'cleanHandle' = 'astrokobi'.
    const analytics2 = {
        nodes: [
            {
                id: 'kobi_node',
                label: 'Kobi Brown',
                group: 'creator',
                data: {
                    bio: 'Interested in space? @astrokobi'
                }
            }
        ]
    };
    const gaps2 = (orchestrator as any).identifyEnrichmentGaps(analytics2);
    console.log("Case 2 (Kobi Brown - Bio match verified):", gaps2);
    // Expected: ['astrokobi'] (because 'astrokobi' includes 'kobi' from slugified 'kobibrown')

    // Case 3: Sub-list scanning
    const analytics3 = {
        creators: [
            { id: 'c1', label: 'Harry Kane', group: 'creator', data: {} }
        ],
        brands: [
            { id: 'b1', label: 'Spurs', group: 'brand', data: {} }
        ]
    };
    const gaps3 = (orchestrator as any).identifyEnrichmentGaps(analytics3);
    console.log("Case 3 (Sub-lists):", gaps3);
    // Expected: ['harrykane', 'spurs']

    // Case 4: Hydration candidate matching (topContent)
    const analytics4 = {
        topContent: [
            {
                title: "Goal!",
                author: "@jackgrealish",
                ownerUsername: "jackgrealish"
            }
        ]
    };
    // Mock profile map
    const profileMap = new Map();
    profileMap.set('jackgrealish', { username: 'jackgrealish', followersCount: 70000000 });

    const hydrated = await (orchestrator as any).enrichFandomAnalysisParallel(analytics4, profileMap);
    console.log("Case 4 (topContent Hydration):", {
        author: hydrated.topContent[0].author,
        followerCount: hydrated.topContent[0].data?.followerCount
    });
    // Expected: followerCount: 70000000
}

testRound2Fixes().catch(console.error);
