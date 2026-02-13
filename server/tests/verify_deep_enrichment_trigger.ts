import { jobOrchestrator } from '../services/jobOrchestrator.js';
import { mongoService } from '../services/mongoService.js';

async function verifyDeepEnrichmentTrigger() {
    console.log("🧪 Verifying Deep Enrichment Trigger logic (Improved)...");

    const mockAnalytics = {
        nodes: [
            {
                id: "node2",
                label: "@incomplete_user",
                group: "creator",
                data: {
                    username: "incomplete_user",
                    followerCount: 0,
                    followingCount: 0,
                    biography: "I am hollow",
                    postsCount: 0
                }
            }
        ],
        links: []
    };

    const gaps = (jobOrchestrator as any).identifyEnrichmentGaps(mockAnalytics);
    console.log("Identified Gaps:", gaps);

    if (!gaps.includes('incomplete_user')) {
        console.error("❌ identifyEnrichmentGaps failed.");
        process.exit(1);
    }

    console.log("Step 2: Mocking everything...");

    let actorCalled = false;
    let targetUsernames: string[] = [];

    // Completely replace runApifyActor on the instance
    const originalRunApifyActor = jobOrchestrator.runApifyActor;
    jobOrchestrator.runApifyActor = async (actorId: string, input: any) => {
        console.log(`[TEST MOCK] runApifyActor called with identifier: ${actorId}`);
        if (actorId === 'dSCLg0C3YEZ83HzYX' || actorId === 'apify/instagram-profile-scraper') {
            actorCalled = true;
            targetUsernames = input.usernames;
        }
        return { items: [], datasetId: 'mock-dataset' };
    };

    // Mock ALL mongoService methods that might be called
    (mongoService as any).updateDataset = async (id: any, updates: any) => {
        console.log(`[TEST MOCK] updateDataset called for ${id}`, updates);
        return true;
    };
    (mongoService as any).updateGraphSnapshot = async (id: any, data: any) => {
        console.log(`[TEST MOCK] updateGraphSnapshot called for ${id}`);
        return true;
    };

    try {
        const mockProfileMap = new Map();
        console.log("Triggering performDeepEnrichment...");
        await jobOrchestrator.performDeepEnrichment(mockAnalytics, 'test-dataset', 'test-job', mockProfileMap);
        console.log("performDeepEnrichment finished execution.");
    } catch (e: any) {
        console.error("🔥 performDeepEnrichment THREW an error:", e.message);
    }

    // Restore
    jobOrchestrator.runApifyActor = originalRunApifyActor;

    console.log("Actor Called Result:", actorCalled);
    console.log("Target Usernames Result:", targetUsernames);

    if (actorCalled && targetUsernames.includes('incomplete_user')) {
        console.log("🎊 VERIFICATION SUCCESS!");
    } else {
        console.error("❌ VERIFICATION FAILURE");
        process.exit(1);
    }
}

verifyDeepEnrichmentTrigger().catch(console.error);
