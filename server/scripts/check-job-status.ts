import { config } from 'dotenv';
import path from 'path';

// Prioritize .env.local
const envLocalPath = 'c:\\Users\\bruce\\Documents\\Clients\\Fandom\\.env.local';
const envPath = 'c:\\Users\\bruce\\Documents\\Clients\\Fandom\\.env';
console.log("Loading env...");
const resultLocal = config({ path: envLocalPath });
if (resultLocal.error) {
    console.log("Local env not found, trying .env");
    config({ path: envPath });
}


async function check() {
    try {
        console.log("Importing MongoService...");
        const { mongoService } = await import('../services/mongoService.js');

        const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI || process.env.MONGO_URL;
        if (!uri) {
            console.error("CRITICAL: No MongoDB URI found in env vars!");
            process.exit(1);
        }

        console.log("Connecting to Mongo (URI length: " + uri.length + ")...");
        await mongoService.connect(uri);
        console.log("Connected.");

        const db = mongoService.getDb();
        const jobs = await db.collection('jobs')
            .find({ id: { $regex: /^TEST_INTEGRITY_/ } })
            .sort({ createdAt: -1 })
            .limit(1)
            .toArray();

        if (jobs.length) {
            const job = jobs[0];
            console.log("Latest Test Job:", job.id);
            console.log("Status:", job.status);
            if (job.error) console.log("Error:", job.error);

            const fs = await import('fs');
            const outPath = 'c:\\Users\\bruce\\Documents\\Clients\\Fandom\\verification_result.txt';
            console.log("Writing result to:", outPath);
            fs.writeFileSync(outPath, `Job: ${job.id}\nStatus: ${job.status}\nError: ${job.error}\nQuality: ${job.qualityScore}\nDataset: ${job.result?.datasetId}\nAudit: ${JSON.stringify(job.metadata?.minerAudit)}`);
            console.log("File written.");
        } else {
            console.log("No test job found.");
        }
        await mongoService.disconnect();
    } catch (e) {
        console.error("Script Error:", e);
    }
}
check().catch(err => {
    console.error("Unhandled Rejection in check():", err);
    process.exit(1);
});
