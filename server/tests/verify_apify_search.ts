
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') });

async function testSearchPayload() {
    const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
    if (!apifyToken) {
        console.error("No APIFY_TOKEN found");
        return;
    }

    const payload = {
        "search": "who are the main influencers in the Ecclesiastical community?",
        "searchType": "user",
        "searchLimit": 1,
        "proxy": {
            "useApifyProxy": true
        }
    };

    const actorId = "apify/instagram-api-scraper";

    console.log(`Testing Actor: ${actorId}`);
    console.log("Payload:", JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(`https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/runs?token=${apifyToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log("\n✅ SUCCESS: Run started successfully!");
            console.log("Run ID:", data.data.id);
            console.log("Status:", data.data.status);
            console.log(`https://console.apify.com/actors/${actorId.replace('/', '~')}/runs/${data.data.id}`);
        } else {
            console.error("\n❌ FAILED: Apify rejected the request.");
            console.error("Status:", response.status);
            console.error("Error:", JSON.stringify(data, null, 2));
        }

    } catch (error: any) {
        console.error("Network Error:", error.message);
    }
}

testSearchPayload();
