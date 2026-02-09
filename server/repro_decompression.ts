
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const rootDir = path.resolve(__dirname, '../');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') });

const URI = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
const DATASET_ID = 'bc6389d3-49cf-425d-b22c-d3d83b1b00e1';

// COPY OF THE LOGIC IN MongoService
function unwrapRecordData(r: any): any {
    let shouldDecompress = r.compression === 'gzip';
    let rawData = r.data;

    console.log(`[DEBUG] Processing record. Compression: ${r.compression}`);
    console.log(`[DEBUG] rawData type: ${typeof rawData}, constructor: ${rawData?.constructor?.name}`);

    // Handle MongoDB Binary type
    if (rawData && rawData._bsontype === 'Binary') {
        console.log("[DEBUG] Detected BSON Binary");
        rawData = rawData.buffer;
        console.log(`[DEBUG] Extracted buffer. isBuffer: ${Buffer.isBuffer(rawData)}, keys: ${Object.keys(rawData)}`);
    } else if (rawData && rawData.type === 'Buffer') {
        rawData = Buffer.from(rawData.data);
    }

    // Auto-detect Gzip header (1F 8B)
    if (!shouldDecompress && Buffer.isBuffer(rawData) && rawData.length > 2 && rawData[0] === 0x1f && rawData[1] === 0x8b) {
        shouldDecompress = true;
        console.log("[DEBUG] Auto-detected Gzip header");
    }

    if (shouldDecompress && rawData) {
        try {
            console.log("[DEBUG] Attempting decompression...");
            const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData.toString('binary'), 'binary');
            // Check headers
            if (buffer.length > 2) console.log(`[DEBUG] Header: ${buffer[0].toString(16)} ${buffer[1].toString(16)}`);

            const decompressed = zlib.gunzipSync(buffer);
            console.log(`[DEBUG] Decompression success! Length: ${decompressed.length}`);
            return JSON.parse(decompressed.toString());
        } catch (e: any) {
            console.error('[DEBUG] Decompression failed:', e.message);
            // If base64 string, try decoding that? 
            if (typeof rawData === 'string' && rawData.startsWith('H4s')) {
                try {
                    const b64 = Buffer.from(rawData, 'base64');
                    const d2 = zlib.gunzipSync(b64);
                    return JSON.parse(d2.toString());
                } catch (e2) { /* ignore */ }
            }
            return r.data; // Return raw as fallback
        }
    }
    return r.data;
}


async function verify() {
    if (!URI) {
        console.error("No Mongo URI found");
        return;
    }
    const client = await MongoClient.connect(URI);
    const db = client.db('fandom_analytics');

    console.log(`\n🔍 REPRODUCING DECOMPRESSION for Dataset: ${DATASET_ID}`);

    const records = await db.collection('records').find({ datasetId: DATASET_ID }).limit(1).toArray();

    if (records.length === 0) {
        console.log("❌ No records found!");
    } else {
        const r = records[0];
        try {
            const result = unwrapRecordData(r);
            if (result && typeof result === 'object' && !Buffer.isBuffer(result) && !result._bsontype) {
                console.log("✅ SUCCESS: Unwrapped valid JSON object.");
            } else {
                console.log("❌ FAILED: Returned raw/binary data.");
            }
        } catch (e) {
            console.error("❌ CRASHED:", e);
        }
    }

    await client.close();
}

verify().catch(console.error);
