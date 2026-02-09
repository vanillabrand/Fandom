/**
 * Comprehensive Test Suite for Fandom Scraper Actor
 * Covers 20+ defined scenarios for Instagram and TikTok
 * 
 * Usage: npx ts-node tests/scenarios.test.ts
 */

// Force Local Mode - Pre-Import Configuration
delete process.env.APIFY_IS_AT_HOME; // Ensure local mode (unset it)
process.env.APIFY_TOKEN = '';
process.env.APIFY_API_TOKEN = '';
process.env.APIFY_DEFAULT_KEYVALUE_STORE_ID = 'default';
process.env.APIFY_DEFAULT_DATASET_ID = 'default';
process.env.APIFY_DEFAULT_REQUEST_QUEUE_ID = 'default';

// Local storage isolation (Required to prevent Cloud access)
process.env.APIFY_LOCAL_STORAGE_DIR = './storage_test';

// process.env.APIFY_TOKEN = ''; // Redundant if local storage is set, but safe to keep empty
// import { runActor } from '../src/main.js';

interface TestScenario {
    id: number;
    name: string;
    input: {
        platform: 'instagram' | 'tiktok';
        dataType: 'profile' | 'posts' | 'followers' | 'following';
        targets: string[];
    };
    expectedResult: string;
}

const SCENARIOS: TestScenario[] = [
    // --- INSTAGRAM PROFILES ---
    { id: 1, name: "IG Profile - Brand (Nike)", input: { platform: 'instagram', dataType: 'profile', targets: ['https://www.instagram.com/nike/'] }, expectedResult: "Valid Profile Data" },
    { id: 2, name: "IG Profile - Creator (Cristiano)", input: { platform: 'instagram', dataType: 'profile', targets: ['https://www.instagram.com/cristiano/'] }, expectedResult: "Valid Profile Data" },
    { id: 3, name: "IG Profile - Username Format", input: { platform: 'instagram', dataType: 'profile', targets: ['adidas'] }, expectedResult: "Valid Profile Data (Auto-fix URL)" }, // Need to verify if logic handles raw usernames
    { id: 4, name: "IG Profile - Private Account", input: { platform: 'instagram', dataType: 'profile', targets: ['https://www.instagram.com/private_test_account_placeholder/'] }, expectedResult: "Limited Data or Error" },
    { id: 5, name: "IG Profile - Invalid User", input: { platform: 'instagram', dataType: 'profile', targets: ['https://www.instagram.com/this_user_does_not_exist_99999/'] }, expectedResult: "Error / No Data" },

    // --- INSTAGRAM POSTS ---
    { id: 6, name: "IG Posts - Brand Timeline", input: { platform: 'instagram', dataType: 'posts', targets: ['https://www.instagram.com/nike/'] }, expectedResult: "List of Posts" },
    { id: 7, name: "IG Single Post - Direct URL", input: { platform: 'instagram', dataType: 'posts', targets: ['https://www.instagram.com/p/C-example-post/'] }, expectedResult: "Single Post Data" },

    // --- INSTAGRAM STATS ---
    { id: 8, name: "IG Followers - Public Check", input: { platform: 'instagram', dataType: 'followers', targets: ['https://www.instagram.com/nike/'] }, expectedResult: "Follower Count/Sample" },
    { id: 9, name: "IG Following - Public Check", input: { platform: 'instagram', dataType: 'following', targets: ['https://www.instagram.com/nike/'] }, expectedResult: "Following Count/Sample" },

    // --- TIKTOK PROFILES ---
    { id: 10, name: "TT Profile - Brand (Chipotle)", input: { platform: 'tiktok', dataType: 'profile', targets: ['https://www.tiktok.com/@chipotle'] }, expectedResult: "Valid Profile Data" },
    { id: 11, name: "TT Profile - Creator (Charli)", input: { platform: 'tiktok', dataType: 'profile', targets: ['https://www.tiktok.com/@charlidamelio'] }, expectedResult: "Valid Profile Data" },
    { id: 12, name: "TT Profile - Raw Handle", input: { platform: 'tiktok', dataType: 'profile', targets: ['khaby.lame'] }, expectedResult: "Valid Profile Data (Auto-fix URL)" },
    { id: 13, name: "TT Profile - Invalid User", input: { platform: 'tiktok', dataType: 'profile', targets: ['https://www.tiktok.com/@this_user_does_not_exist_99999'] }, expectedResult: "Error / No Data" },

    // --- TIKTOK POSTS ---
    { id: 14, name: "TT Posts - Brand Feed", input: { platform: 'tiktok', dataType: 'posts', targets: ['https://www.tiktok.com/@chipotle'] }, expectedResult: "List of Videos" },
    { id: 15, name: "TT Single Video - Direct URL", input: { platform: 'tiktok', dataType: 'posts', targets: ['https://www.tiktok.com/@chipotle/video/7300000000000000000'] }, expectedResult: "Single Video Data" },

    // --- TIKTOK STATS ---
    { id: 16, name: "TT Followers - Count Check", input: { platform: 'tiktok', dataType: 'followers', targets: ['https://www.tiktok.com/@chipotle'] }, expectedResult: "Follower Stats" },
    { id: 17, name: "TT Following - Count Check", input: { platform: 'tiktok', dataType: 'following', targets: ['https://www.tiktok.com/@chipotle'] }, expectedResult: "Following Stats" },

    // --- EDGE CASES / FORMATS ---
    { id: 18, name: "IG Mobile URL", input: { platform: 'instagram', dataType: 'profile', targets: ['https://m.instagram.com/nike'] }, expectedResult: "Valid Profile Data" },
    { id: 19, name: "TT Mobile URL", input: { platform: 'tiktok', dataType: 'profile', targets: ['https://m.tiktok.com/v/73000000.html'] }, expectedResult: "Valid Data" },
    { id: 20, name: "Mixed Targets", input: { platform: 'instagram', dataType: 'profile', targets: ['nike', 'https://instagram.com/adidas'] }, expectedResult: "Multiple Profiles" }
];

async function main() {
    console.log("🚀 Starting Comprehensive Scraper Test Suite (20 Scenarios)...\n");

    // We can't run all 20 in parallel easily without massive resource usage locally.
    // We will run a subset or prompt for specific ID.
    // For this automated check, let's run a "Sanity Check" of 1 IG and 1 TT scenario to verify the code flows.
    // Running all 20 against real live sites might trigger blocks immediately in this dev environment.

    const scenariosToRun = SCENARIOS; // Run ALL Scenarios

    // Dynamic import to enforce local env vars
    const { runActor } = await import('../src/main.js');

    for (const scenario of scenariosToRun) {
        console.log(`\n---------------------------------------------------------`);
        console.log(`Testing Scenario #${scenario.id}: ${scenario.name}`);
        console.log(`Target: ${scenario.input.targets[0]}`);
        console.log(`Expected: ${scenario.expectedResult}`);
        console.log(`---------------------------------------------------------`);

        try {
            await runActor(scenario.input);
            console.log(`✅ Scenario #${scenario.id} Completed without Crash.`);
        } catch (e) {
            console.error(`❌ Scenario #${scenario.id} FAILED:`, e);
        }
    }
}

main();
