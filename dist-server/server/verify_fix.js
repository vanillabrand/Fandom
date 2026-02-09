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
async function verify() {
    if (!URI) {
        console.error("No Mongo URI found");
        return;
    }
    const client = await MongoClient.connect(URI);
    const db = client.db('fandom_analytics');
    console.log(`\n🔍 VERIFICATION START for Dataset: ${TARGET_ID}`);
    console.log("==================================================");
    // TEST 1: The OLD Way (Aggregation)
    console.log("\n🧪 TEST 1: Attempting fetch via OLD Aggregation (should fail)...");
    try {
        const pipeline = [
            { $match: { id: TARGET_ID } },
            {
                $lookup: {
                    from: 'records',
                    localField: 'id',
                    foreignField: 'datasetId',
                    as: 'records_doc'
                }
            },
            {
                $addFields: {
                    data: {
                        $map: { input: "$records_doc", as: "r", in: "$$r.data" }
                    }
                }
            },
            { $project: { records_doc: 0 } }
        ];
        const results = await db.collection('datasets').aggregate(pipeline).toArray();
        console.log(`❌ UNEXPECTED SUCCESS: Fetched ${results.length} docs via aggregation.`);
    }
    catch (err) {
        console.log(`✅ EXPECTED FAILURE: Aggregation failed as expected.`);
        console.log(`   Error: ${err.message}`);
        if (err.message.includes("BSONObj size")) {
            console.log("   --> CONFIRMED: Error is due to BSON 16MB limit.");
        }
    }
    // TEST 2: The NEW Way (Split Queries)
    console.log("\n🧪 TEST 2: Attempting fetch via NEW Split Queries (should succeed)...");
    try {
        const tStart = Date.now();
        const dataset = await db.collection('datasets').findOne({ id: TARGET_ID });
        if (!dataset)
            throw new Error("Dataset not found in 'datasets'");
        const records = await db.collection('records').find({ datasetId: TARGET_ID }).toArray();
        const data = records.map(r => r.data);
        const tEnd = Date.now();
        console.log(`✅ SUCCESS: Fetched dataset + ${records.length} records in ${tEnd - tStart}ms.`);
        // Calculate approx size
        const jsonSize = JSON.stringify(data).length;
        console.log(`   Content Size (JSON): ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   (This is >16MB BSON size which is why aggregation failed)`);
    }
    catch (err) {
        console.error(`❌ FAILED: New method failed: ${err.message}`);
    }
    console.log("\n==================================================");
    await client.close();
}
verify().catch(console.error);
