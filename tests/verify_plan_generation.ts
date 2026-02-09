
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');
console.log(`Loading env from: ${envPath}`);
dotenv.config({ path: envPath });

if (!process.env.GEMINI_API_KEY) {
    console.error("CRITICAL: GEMINI_API_KEY is missing from env!");
    process.exit(1);
}

import { jobOrchestrator } from '../server/services/jobOrchestrator.js';

async function verifyPlanGeneration() {
    console.log(">>> Verifying Plan Generation Logic...");

    // Test Case: "Map the rising subcultures of @nike fans"
    // This triggers the complex prompt that was failing.
    const query = "Map the rising subcultures of @nike fans on Instagram";
    const sampleSize = 100;

    try {
        console.log(`Analyzing query: "${query}"...`);
        const plan = await jobOrchestrator.analyzeMapRequirements(query, sampleSize, [], true, false); // ignoreCache=true

        console.log("\n>>> Plan Generated Successfully!");
        console.log("Intent:", plan.intent);
        console.log("Steps:", plan.steps?.length || 0);

        if (plan.steps && plan.steps.length > 0) {
            console.log("First Step:", plan.steps[0].description);
            console.log("First Actor:", plan.steps[0].actorId);
        } else {
            console.warn("WARNING: Plan has no steps!");
        }

        if (plan.intent) {
            console.log("[PASS] Valid plan structure returned.");
        } else {
            console.error("[FAIL] Plan missing intent.");
            process.exit(1);
        }

    } catch (error: any) {
        console.error("\n[FAIL] Plan Generation Failed:", error.message);
        if (error.message.includes("AI returned invalid JSON")) {
            console.error("FATAL: JSON Parsing issue persists.");
        }
        process.exit(1);
    }
}

verifyPlanGeneration();
