import { costCalculator } from '../services/costCalculator.js';
import { mongoService } from '../services/mongoService.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
async function verifyCost() {
    console.log("Connecting to Mongo...");
    const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
    if (!uri)
        throw new Error("Missing MONGO_DB_CONNECT or MONGODB_URI");
    await mongoService.connect(uri);
    console.log("Fetching Pricing Config...");
    const config = await mongoService.getPricingConfig();
    console.log("Pricing Config:", JSON.stringify(config, null, 2));
    const sampleSizes = [1, 50, 100, 250, 500, 1000, 20000];
    for (const size of sampleSizes) {
        console.log(`\n--- Calculating Cost for sampleSize: ${size} ---`);
        const cost = await costCalculator.calculateQueryBuilderCost(size);
        console.log(`Total Cost: ${cost.totalCost}`);
        console.log(`Charged Amount (with margin): £${cost.chargedAmount.toFixed(2)}`);
        console.log("Breakdown:", JSON.stringify(cost.breakdown, null, 2));
        if (Math.abs(cost.chargedAmount - 94.23) < 1.0) {
            console.log("******** MATCH FOUND for £94.23 *********");
        }
    }
    await mongoService.disconnect();
}
verifyCost().catch(console.error);
