import { startAgenda, getAgenda, JOB_MINER_COMPOSITE } from '../server/queue/agenda.js';
import { mongoService } from '../server/services/mongoService.js';
import dotenv from 'dotenv';
import path from 'path';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runTest() {
    // 1. Connect Mongo
    const mongoUri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("Missing Mongo URI");

    await mongoService.connect(mongoUri);
    console.log("✅ Mongo Connected");

    // 2. Start Agenda
    await startAgenda();
    const agenda = getAgenda();

    // 3. Define a generic test job just in case
    agenda.define('test-echo', async (job) => {
        console.log("🔊 [Echo Job] Received:", job.attrs.data);
    });

    // 4. Dispatch Test Job
    console.log("🚀 Dispatching Test Job...");
    await agenda.now('test-echo', { message: 'Hello World' });

    // 5. Dispatch Composite Job (Real Data Test)
    const jobId = `job_test_${Date.now()}`;
    // Use a real handle that is safe and likely to have data (e.g., @lego)
    const testQuery = 'map trends for @guinness';
    console.log(`🚀 Dispatching Composite Job ${jobId} for query "${testQuery}"...`);

    // Create Mock Job in Mongo first (as the processor expects it)
    await mongoService.createJob({
        id: jobId,
        userId: 'test-user-real',
        type: 'map_generation',
        status: 'queued',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { query: testQuery, sampleSize: 20 } // Low sample size for speed
    });

    await agenda.now(JOB_MINER_COMPOSITE, {
        jobId,
        query: testQuery,
        userId: 'test-user-real',
        sampleSize: 20
    });

    console.log("⏳ Waiting for processors to run (Ctrl+C to stop)...");
}

runTest().catch(console.error);
