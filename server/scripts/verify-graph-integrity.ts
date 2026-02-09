import { config } from 'dotenv';
import path from 'path';

// Prioritize .env.local
const envLocalPath = 'c:\\Users\\bruce\\Documents\\Clients\\Fandom\\.env.local';
const envPath = 'c:\\Users\\bruce\\Documents\\Clients\\Fandom\\.env';

console.log("Attempting to load .env.local...");
const resultLocal = config({ path: envLocalPath });

if (resultLocal.error) {
    console.warn("Could not load .env.local, trying .env...");
    const result = config({ path: envPath });
    if (result.error) console.warn("Could not load .env either.");
} else {
    console.log("Loaded .env.local successfully.");
}

async function runTest() {
    console.log("🧪 Starting Graph Integrity Verification Test...");

    try {
        console.log("Importing services...");
        const { mongoService } = await import('../services/mongoService.js');
        const { JobOrchestrator } = await import('../services/jobOrchestrator.js');
        console.log("Services imported successfully.");

        const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI || process.env.MONGO_URL;
        console.log("MONGO_DB_CONNECT present:", !!process.env.MONGO_DB_CONNECT);
        console.log("MONGODB_URI present:", !!process.env.MONGODB_URI);
        console.log("MONGO_URL present:", !!process.env.MONGO_URL);

        if (uri) {
            console.log("Using URI starting with:", uri.substring(0, 15) + "...");
        } else {
            console.error("CRITICAL: No MongoDB URI found in env vars!");
            process.exit(1);
        }

        console.log("APIFY_API_TOKEN present:", !!(process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN));
        console.log("GEMINI_API_KEY present:", !!(process.env.GEMINI_API_KEY || process.env.API_KEY));

        try {
            await mongoService.connect(uri);
            console.log("Checking DB Connection: Connected");
        } catch (e) {
            console.error("DB Connection Failed:", e);
            process.exit(1);
        }

        // 1. Create a Test Job
        const jobId = 'TEST_INTEGRITY_' + Date.now();
        const testQuery = '@nike';

        const job = {
            id: jobId,
            type: 'map_generation',
            userId: 'test-admin',
            status: 'queued',
            progress: 0,
            metadata: {
                query: testQuery,
                sampleSize: 10,
                postLimit: 1,
                ignoreCache: true,
                // Explicit plan to bypass AI flakiness/errors
                plan: {
                    intent: 'brand_analysis',
                    steps: [
                        {
                            id: 'scrape_seed',
                            actorId: 'apify/instagram-api-scraper',
                            description: 'Scrape Nike profile',
                            input: {
                                "search": "nike",
                                "searchType": "user",
                                "resultsType": "details",
                                "limit": 5
                            }
                        }
                    ]
                }
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        console.log(`📝 Creating Test Job: ${jobId}`);

        try {
            const db = mongoService.getDb();
            await db.collection('jobs').insertOne(job);
        } catch (e) {
            console.error("Failed to insert job:", e);
            process.exit(1);
        }

        // 2. Trigger Orchestrator
        console.log("🚀 Triggering Job Processing...");
        const orchestrator = JobOrchestrator.getInstance();
        const startTime = Date.now();

        try {
            // Access private method via cast
            await (orchestrator as any).processJob(job);
            console.log(`✅ Job Processing Finished in ${(Date.now() - startTime) / 1000}s`);
        } catch (e) {
            console.error("❌ Job Processing execution failed:", e);
        }

        // 3. Verify Results
        console.log("🔍 Verifying Job Result...");
        const db = mongoService.getDb();
        const resultJob = await db.collection('jobs').findOne({ id: jobId });

        if (!resultJob) {
            console.error("❌ Job not found in DB.");
            process.exit(1);
        }

        console.log(`📊 Final Status: ${resultJob.status}`);

        if (resultJob.status === 'completed') {
            const result = resultJob.result;
            const checks = {
                hasResult: !!result,
                hasDatasetId: !!result?.datasetId,
                hasQualityScore: (resultJob.qualityScore || 0) > 0,
                hasConfidenceScore: (resultJob.confidenceScore || 0) > 0,
                hasMinerAudit: !!resultJob.metadata?.minerAudit
            };

            console.table(checks);

            if (Object.values(checks).every(v => v)) {
                console.log("✅ PASSED: Graph Integrity Verified.");
                if (resultJob.metadata?.minerAudit) {
                    console.log("Audit Passed:", resultJob.metadata.minerAudit.passed);
                }
            } else {
                console.error("⚠️ PARTIAL PASS.");
            }
        } else {
            console.error(`❌ FAILED: Job Status ${resultJob.status}`);
            console.error(`Error: ${resultJob.error}`);
        }

        await mongoService.disconnect();
        process.exit(0);

    } catch (e) {
        console.error("Critical Script Error:", e);
        process.exit(1);
    }
}

runTest();
