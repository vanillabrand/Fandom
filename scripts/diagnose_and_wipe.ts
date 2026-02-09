
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
    MONGO_URI = getEnvValue(envPath, 'MONGODB_URI') ||
        getEnvValue(localEnvPath, 'MONGODB_URI') ||
        process.env.MONGODB_URI;
}

if (!MONGO_URI) {
    console.error("❌ MONGO_DB_CONNECT could not be extracted.");
    process.exit(1);
}

const masked = MONGO_URI.substring(0, 15) + '...';
console.log(`Connection URI: ${masked}`);

async function run() {
    const client = new MongoClient(MONGO_URI!);
    try {
        await client.connect();
        console.log("✅ Connected to Cluster");

        // 1. List All Databases to find the culprit
        const adminDb = client.db().admin();
        let dbList;
        try {
            dbList = await adminDb.listDatabases();
        } catch (e: any) {
            console.error("Failed to list databases (permissions?):", e.message);
            // Fallback to default DB in URI if list fails
            dbList = { databases: [{ name: client.db().databaseName }] };
        }

        console.log("\n📊 Databases on Cluster:");
        console.log("-----------------------");

        let targetDbName = '';
        let maxDataTypeSize = 0;

        for (const dbInfo of dbList.databases) {
            const sizeMb = (dbInfo.sizeOnDisk || 0) / (1024 * 1024);
            console.log(` > ${dbInfo.name} (${sizeMb.toFixed(2)} MB)`);

            // Heuristic: Pick the largest non-system DB
            if (dbInfo.name !== 'admin' && dbInfo.name !== 'local' && dbInfo.name !== 'config') {
                if (sizeMb > maxDataTypeSize) {
                    maxDataTypeSize = sizeMb;
                    targetDbName = dbInfo.name;
                }
            }
        }
        console.log("-----------------------");

        if (!targetDbName) {
            // Default to 'test' if nothing else found
            targetDbName = 'test';
            console.log("⚠️ No obvious user database found. Defaulting to 'test'.");
        }

        console.log(`\n🎯 Targeted Database: '${targetDbName}'`);
        const db = client.db(targetDbName);

        // 2. List Collections in Target
        const collections = await db.listCollections().toArray();
        console.log(`\nFound ${collections.length} collections in '${targetDbName}':`);

        for (const col of collections) {
            // estimatedDocumentCount is fast
            const stats = await db.collection(col.name).estimatedDocumentCount();
            console.log(` - ${col.name}: ~${stats.toLocaleString()} docs`);
        }

        // 3. WIPE
        console.log(`\n🧨 DROPPING COLLECTIONS in '${targetDbName}'...`);

        const targets = ['records', 'datasets', 'jobs', 'usage_logs'];

        for (const target of targets) {
            const exists = collections.find(c => c.name === target);
            if (exists) {
                console.log(`Dropping '${target}'...`);
                try {
                    await db.collection(target).drop();
                    console.log(`✅ Dropped '${target}'`);
                } catch (e: any) {
                    console.error(`❌ Failed to drop '${target}': ${e.message}`);
                }
            } else {
                console.log(`Skipping '${target}' (not found)`);
            }
        }

        console.log("\n✨ Wipe Complete.");

    } catch (e) {
        console.error("Fatal Error:", e);
    } finally {
        await client.close();
    }
}

run().catch(console.error);
