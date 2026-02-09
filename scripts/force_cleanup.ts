
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

// Helper to look for env var in a file
function getEnvValue(filePath: string, key: string): string | null {
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(`${key}=`)) {
                return trimmed.replace(`${key}=`, '').replace(/['"]/g, '').trim();
            }
        }
    }
    return null;
}

const envPath = path.join(process.cwd(), '.env');
const localEnvPath = path.join(process.cwd(), '.env.local');

let MONGO_URI = getEnvValue(envPath, 'MONGO_DB_CONNECT') ||
    getEnvValue(localEnvPath, 'MONGO_DB_CONNECT') ||
    process.env.MONGO_DB_CONNECT;

if (!MONGO_URI) {
    // Fallback to MONGODB_URI just in case, or check process
    MONGO_URI = getEnvValue(envPath, 'MONGODB_URI') ||
        getEnvValue(localEnvPath, 'MONGODB_URI') ||
        process.env.MONGODB_URI;
}

if (!MONGO_URI) {
    console.error("❌ MONGO_DB_CONNECT (or MONGODB_URI) could not be extracted from .env, .env.local, or environment.");
    process.exit(1);
}

// Masked URI for logs
const masked = MONGO_URI.substring(0, 15) + '...';
console.log(`Usage URI: ${masked}`);

async function forceCleanup() {
    console.log("🚨 STARTING EMERGENCY STORAGE CLEANUP (v4) 🚨");

    // Disable deprecation warning for now
    const client = new MongoClient(MONGO_URI!);

    try {
        await client.connect();
        const db = client.db();
        console.log("✅ Connected to MongoDB");

        // 1. Delete ALL Records
        const recordsCollection = db.collection('records');
        const recordCount = await recordsCollection.countDocuments();
        console.log(`Found ${recordCount} records.`);

        if (recordCount > 0) {
            console.log("Deleting all records...");
            await recordsCollection.deleteMany({});
            console.log("✅ All records deleted.");
        }

        // 2. Delete ALL Datasets
        const datasetsCollection = db.collection('datasets');
        const datasetCount = await datasetsCollection.countDocuments();
        console.log(`Found ${datasetCount} datasets.`);

        if (datasetCount > 0) {
            console.log("Deleting all datasets...");
            await datasetsCollection.deleteMany({});
            console.log("✅ All datasets deleted.");
        }

        console.log("-----------------------------------");
        console.log("🎉 STORAGE CLEARED SUCCESSFULLY.");

    } catch (error) {
        console.error("❌ Cleanup failed:", error);
    } finally {
        await client.close();
    }
}

forceCleanup().catch(console.error);
