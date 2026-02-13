
import { JobOrchestrator } from './server/services/jobOrchestrator.js';

async function testFullNameResolution() {
    const orchestrator = JobOrchestrator.getInstance();

    console.log("--- Testing Full Name Resolution & Bio Extraction ---");

    // Case 1: Label has spaces, but username is provided
    const analytics1 = {
        nodes: [
            { id: 'node1', label: 'Kobi Brown', group: 'creator', data: { username: 'astrokobi' } }
        ]
    };
    const gaps1 = (orchestrator as any).identifyEnrichmentGaps(analytics1);
    console.log("Case 1 (Label with space, Username present):", gaps1);
    // Expected: ['astrokobi']

    // Case 2: Label has spaces, no username, but bio has @handle
    const analytics2 = {
        nodes: [
            {
                id: 'node2',
                label: 'Kobi Brown',
                group: 'creator',
                data: {
                    bio: 'Interested in space? Check out my main acc @astrokobi'
                }
            }
        ]
    };
    const gaps2 = (orchestrator as any).identifyEnrichmentGaps(analytics2);
    console.log("Case 2 (Label with space, No username, Handle in Bio):", gaps2);
    // Expected: ['astrokobi']

    // Case 3: Label has spaces, no username, no bio handle
    const analytics3 = {
        nodes: [
            { id: 'node3', label: 'Kobi Brown', group: 'creator', data: { bio: 'Just a space enthusiast' } }
        ]
    };
    const gaps3 = (orchestrator as any).identifyEnrichmentGaps(analytics3);
    console.log("Case 3 (Label with space, No resolution candidate):", gaps3);
    // Expected: [] (Cannot resolve)

    // Case 4: Label is handle with @
    const analytics4 = {
        nodes: [
            { id: 'node4', label: '@astrokobi', group: 'creator', data: {} }
        ]
    };
    const gaps4 = (orchestrator as any).identifyEnrichmentGaps(analytics4);
    console.log("Case 4 (Label is @handle):", gaps4);
    // Expected: ['astrokobi']

    // Case 5: Unified Metric Mapping check
    const p = {
        username: 'astrokobi',
        fullName: 'Kobi Brown',
        followersCount: 1000000,
        followsCount: 500,
        postsCount: 726
    };
    const hydrated = (orchestrator as any).hydrateNodeData(p, 'creator');
    console.log("Case 5 (Metric Unification):", {
        followerCount: hydrated.data.followerCount,
        followingCount: hydrated.data.followingCount,
        postsCount: hydrated.data.postsCount,
        postCount: hydrated.data.postCount
    });
    // Expected: postCount: 726
}

testFullNameResolution().catch(console.error);
