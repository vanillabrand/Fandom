import { JobOrchestrator } from '../services/jobOrchestrator.js';
import { mongoService } from '../services/mongoService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
async function verifyKeywordExtraction() {
    console.log("Initializing...");
    // Mock Mongo connection not strictly needed for analyzeMapRequirements if we don't save anything, 
    // but JobOrchestrator might check connection in some places?
    // analyzeMapRequirementsServer calls getExistingDatasets which needs DB.
    // We can try without connecting if we pass empty existingDatasets, but let's connect to be safe.
    const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
    if (uri) {
        await mongoService.connect(uri);
    }
    else {
        console.warn("No Mongo URI found, skipping connection (might fail if DB is required)");
    }
    const orchestrator = JobOrchestrator.getInstance();
    const testCases = [
        { q: "Who are the main influencers in the Ecclesiastical community?", expected: "Ecclesiastical" },
        { q: "Find fashion influencers in London", expected: "fashion london" },
        { q: "software developers with >5k followers", expected: "software developer" }
    ];
    console.log(`Running ${testCases.length} Test Cases via Gemini (Real API Call)...`);
    for (const test of testCases) {
        console.log(`\n--------------------------------------------------`);
        console.log(`QUERY: "${test.q}"`);
        try {
            // sampleSize 50, empty datasets, ignoreCache=true
            const plan = await orchestrator.analyzeMapRequirements(test.q, 50, [], true, false);
            console.log("Plan Intent:", plan.intent);
            if (plan.search_keywords) {
                console.log("✅ EXTRACTED KEYWORDS:", plan.search_keywords);
                const match = plan.search_keywords.some((k) => k.toLowerCase().includes(test.expected.toLowerCase()) || test.expected.toLowerCase().includes(k.toLowerCase()));
                if (match)
                    console.log("   -> MATCHES EXPECTATION");
                else
                    console.warn(`   -> EXPECTED "${test.expected}", GOT ${JSON.stringify(plan.search_keywords)}`);
            }
            else {
                console.warn("❌ NO 'search_keywords' FIELD IN RESPONSE!");
                console.log("Full Plan:", JSON.stringify(plan, null, 2));
            }
            // Check the first step input to see if Gemini put it in 'search' directly too
            const searchStep = plan.steps.find((s) => s.actorId.includes('instagram-scraper') || s.actorId.includes('instagram-api-scraper'));
            if (searchStep && searchStep.input.search) {
                console.log(`Step 1 'search' param used by AI: "${searchStep.input.search}"`);
            }
        }
        catch (e) {
            console.error("Error generating plan:", e.message);
        }
    }
    if (uri)
        await mongoService.disconnect();
}
verifyKeywordExtraction().catch(console.error);
