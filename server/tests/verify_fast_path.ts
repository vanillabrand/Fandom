
import { JobOrchestrator } from '../services/jobOrchestrator.js';
import dotenv from 'dotenv';
dotenv.config();

const orchestrator = JobOrchestrator.getInstance();

async function runTest() {
    const query = "Map the overindexed profiles in followings of followers of @nike";
    console.log(`\nTesting Query: "${query}"`);

    try {
        // Mock params: sampleSize=100, existingDatasets=[], ignoreCache=true, useDeepAnalysis=false, seedContext="", postLimit=2
        const plan = await orchestrator.analyzeMapRequirements(query, 100, [], true, false, "", 2);

        console.log("\n--- Plan Result ---");
        console.log("Intent:", plan.intent);
        console.log("Reasoning:", plan.reasoning);
        console.log("Steps:", plan.steps.length);
        console.log("Existing Dataset IDs:", plan.existingDatasetIds);

        if (plan.reasoning.includes("Fast Path")) {
            console.log("\n✅ SUCCESS: Fast Path usage confirmed in reasoning.");
        } else {
            console.log("\n❌ FAILURE: Fast Path NOT used. Check logs.");
        }

    } catch (error) {
        console.error("Test Failed:", error);
    }
    process.exit(0);
}

runTest();
