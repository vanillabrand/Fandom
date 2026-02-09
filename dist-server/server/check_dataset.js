import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load env
const rootDir = path.resolve(__dirname, '../');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') });
const URI = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
const TARGET_ID = '2d48293a-cb59-4fd8-ab42-462c21b7dccc';
async function check() {
    if (!URI) {
        console.error("No Mongo URI found");
        return;
    }
    console.log("Connecting to Mongo...");
    const client = await MongoClient.connect(URI);
    const db = client.db('fandom_analytics');
    console.log(`Checking for Dataset ID: ${TARGET_ID}`);
    const dataset = await db.collection('datasets').findOne({ id: TARGET_ID });
    if (dataset) {
        console.log("✅ Dataset FOUND in 'datasets' collection:");
        console.log("- Name:", dataset.name);
        console.log("- Platform:", dataset.platform);
        console.log("- Metadata:", dataset.metadata);
    }
    else {
        console.error("❌ Dataset NOT FOUND in 'datasets' collection.");
        // Check if it exists with different ID type?
        const byObjId = await db.collection('datasets').findOne({ _id: TARGET_ID });
        if (byObjId)
            console.log("⚠️ Found by _id (should not happen for UUID)");
    }
    console.log("\nChecking 'records' collection for datasetId...");
    const records = await db.collection('records').find({ datasetId: TARGET_ID }).toArray();
    console.log(`Found ${records.length} records.`);
    if (records.length > 0) {
        const r = records[0];
        console.log("Sample Record Type:", r.recordType);
        // Estimate size
        const roughSize = JSON.stringify(r).length;
        console.log(`Sample Record Size (JSON chars): ${roughSize}`);
        if (roughSize > 15 * 1024 * 1024) {
            console.warn("⚠️ WARNING: Record is close to or exceeds 16MB BSON limit!");
        }
    }
    await client.close();
}
check().catch(console.error);
