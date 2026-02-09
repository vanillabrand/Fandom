
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
const DATASET_ID = 'bc6389d3-49cf-425d-b22c-d3d83b1b00e1';

async function verify() {
    if (!URI) {
        console.error("No Mongo URI found");
        return;
    }
    const client = await MongoClient.connect(URI);
    const db = client.db('fandom_analytics');

    console.log(`\n🔍 INSPECTING RECORDS for Dataset: ${DATASET_ID}`);

    const records = await db.collection('records').find({ datasetId: DATASET_ID }).limit(1).toArray();

    if (records.length === 0) {
        console.log("❌ No records found!");
    } else {
        const r = records[0];
        console.log("--------------------------------------------------");
        console.log("Record Keys:", Object.keys(r));
        console.log("Compression Flag:", r.compression);
        console.log("Data Type (typeof):", typeof r.data);

        if (r.data) {
            console.log("Data Constructor:", r.data.constructor ? r.data.constructor.name : 'None');

            if (Buffer.isBuffer(r.data)) {
                console.log("Data IS Buffer (Node.js Buffer)");
                console.log("Length:", r.data.length);
                console.log("Hex start:", r.data.toString('hex').substring(0, 20));
            } else if (r.data._bsontype === 'Binary') {
                console.log("Data IS MongoDB Binary");
                console.log("Subtype:", r.data.sub_type);
                console.log("Buffer Length:", r.data.buffer.length);
            } else if (typeof r.data === 'string') {
                console.log("Data IS String");
                console.log("Start:", r.data.substring(0, 50));
            } else {
                console.log("Data is something else:", JSON.stringify(r.data).substring(0, 100));
            }
        }
    }

    console.log("--------------------------------------------------");
    await client.close();
}

verify().catch(console.error);
