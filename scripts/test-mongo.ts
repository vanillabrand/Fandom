
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { mongoService } from '../server/services/mongoService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

console.log("Loading env from:", rootDir);
dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') }); // Fallback

async function test() {
    console.log("MONGO_DB_CONNECT:", process.env.MONGO_DB_CONNECT ? "SET" : "MISSING");
    if (!process.env.MONGO_DB_CONNECT && !process.env.MONGODB_URI) {
        console.error("No Mongo Connection String");
        return;
    }

    try {
        console.log("Connecting...");
        await mongoService.connect(process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI!);
        console.log("Connected.");

        console.log("Fetching Questions...");
        const result = await mongoService.getLatestMarketingQuestions();
        console.log("Result:", result);

        await mongoService.disconnect();
    } catch (err: any) {
        console.error("Test Failed:", err);
    }
}

test();
