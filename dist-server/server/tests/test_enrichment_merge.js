import { jobOrchestrator } from '../services/jobOrchestrator.js';
async function testEnrichment() {
    console.log("🧪 Testing aggregateProfiles enrichment logic...");
    const mockRecords = [
        // 1. Minimal record from network scraper (Followers)
        {
            username: "testuser",
            id: "123456",
            followersCount: 0, // Hollow
            isVerified: false,
            type: "followers"
        },
        // 2. Rich record from API scraper (Details)
        {
            username: "testuser",
            metaData: {
                followersCount: 50000,
                biography: "Verified bio from API",
                verified: true,
                fullName: "Test User HD"
            },
            profilePicUrlHD: "https://hd-pic.com/pic.jpg",
            type: "details"
        },
        // 3. Record with 'owner' object (Profile Scraper)
        {
            username: "testuser",
            owner: {
                follower_count: 55000, // Higher than before
                biography: "Slightly different bio",
                full_name: "Test User Long Name"
            }
        }
    ];
    // Access private method via casting to any for testing
    const aggregated = jobOrchestrator.aggregateProfiles(mockRecords);
    const profile = aggregated[0];
    console.log("Aggregated Profile Result:", JSON.stringify(profile, null, 2));
    // Assertions
    const passes = profile.followersCount === 55000 &&
        profile.isVerified === true &&
        (profile.biography === "Slightly different bio" || profile.biography === "Verified bio from API") &&
        profile.fullName === "Test User Long Name" &&
        profile.profilePicUrl === "https://hd-pic.com/pic.jpg";
    if (passes) {
        console.log("✅ aggregateProfiles Test PASSED");
    }
    else {
        console.error("❌ aggregateProfiles Test FAILED");
        process.exit(1);
    }
}
testEnrichment().catch(console.error);
