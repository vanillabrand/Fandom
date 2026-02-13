
import { JobOrchestrator } from './server/services/jobOrchestrator.js';

async function testRound4Fixes() {
    const orchestrator = JobOrchestrator.getInstance();

    console.log("--- Testing Round 4 Fixes (Robust Normalization) ---");

    // Case 1: Singular Field Names (followerCount, postCount)
    const raw1 = {
        username: 'astrokobi',
        followerCount: 1100000,
        followingCount: 500,
        postCount: 726,
        biography: 'Space creator'
    };
    const profile1 = (orchestrator as any).normalizeToStandardProfile(raw1);
    console.log("Case 1 (Singular):", {
        followers: profile1.followersCount,
        following: profile1.followsCount,
        posts: profile1.postsCount
    });
    // Expected: 1100000, 500, 726

    // Case 2: Underscore Field Names (followers_count)
    const raw2 = {
        username: 'test_user',
        followers_count: 50000,
        following_count: 100,
        media_count: 10,
        bio: 'Testing'
    };
    const profile2 = (orchestrator as any).normalizeToStandardProfile(raw2);
    console.log("Case 2 (Underscores):", {
        followers: profile2.followersCount,
        following: profile2.followsCount,
        posts: profile2.postsCount
    });
    // Expected: 50000, 100, 10

    // Case 3: Instagram edge pattern
    const raw3 = {
        username: 'edge_user',
        edge_followed_by: { count: 999 },
        edge_follow: { count: 111 },
        edge_owner_to_timeline_media: { count: 88 },
        biography: 'Edge'
    };
    const profile3 = (orchestrator as any).normalizeToStandardProfile(raw3);
    console.log("Case 3 (Edges):", {
        followers: profile3.followersCount,
        following: profile3.followsCount,
        posts: profile3.postsCount
    });
    // Expected: 999, 111, 88

    // Case 4: Search Mode mapping
    const raw4 = {
        pk: '12345',
        username: 'search_user',
        fullName: 'Search User',
        followers_count: 777,
        following_count: 888,
        postsCount: 999
    };
    const profile4 = (orchestrator as any).normalizeToStandardProfile(raw4);
    console.log("Case 4 (Search/PK):", {
        followers: profile4.followersCount,
        following: profile4.followsCount,
        posts: profile4.postsCount
    });
    // Expected: 777, 888, 999 (mapped via followers_count fallback)
}

testRound4Fixes().catch(console.error);
