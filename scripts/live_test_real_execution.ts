
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from "@google/genai";

// 1. Load Environment Variables (Manual Parse since dotenv might not be installed)
const envPath = path.resolve(process.cwd(), '.env.local');
const envVars: any = {};

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const regex = /^\s*(?:export\s+)?([\w_]+)\s*=\s*(.*)$/gm;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        envVars[key] = value;
    }
    console.log("Parsed Keys:", Object.keys(envVars)); // Debug info
}

// 2. Setup Clients
const APIFY_TOKEN = envVars.VITE_APIFY_API_TOKEN || envVars.APIFY_API_TOKEN || envVars.APIFY_TOKEN || process.env.VITE_APIFY_API_TOKEN;
const GEMINI_KEY = envVars.VITE_GEMINI_API_KEY || envVars.GEMINI_API_KEY || envVars.API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!APIFY_TOKEN || !GEMINI_KEY) {
    console.error(">>> ERROR: Missing Credentials. APIFY_TOKEN or GEMINI_KEY not found in .env.local");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// 3. Define Real Execution Logic
async function runRealTest() {
    console.log(">>> [LIVE TEST] Starting REAL Execution against External APIs...");
    console.log(`> Apify Token: ${APIFY_TOKEN.substring(0, 5)}...`);
    console.log(`> Gemini Key: ${GEMINI_KEY.substring(0, 5)}...`);

    // A. Trigger Check
    const query = "map the movies and food that followers of @therock are into";
    console.log(`\n> Query: "${query}"`);

    // Copy-paste Trigger Logic from Orchestration
    const q = query.toLowerCase();
    const triggers = ['food', 'movie', 'snack', 'eat', 'watch', 'into'];
    const needsContent = triggers.some(t => q.includes(t));
    console.log(`> Semantic Trigger: ${needsContent} (Expected: true)`);

    if (!needsContent) return;

    // B. Real Apify Call
    console.log("\n>>> [STEP B] LIVE APIFY SCRAPE (instagram-api-scraper)...");
    const actorId = "apify/instagram-api-scraper";
    const runInput = {
        directUrls: ["https://www.instagram.com/therock/"],
        resultsType: "posts",
        resultsLimit: 3
    };

    console.log("\n====== [1] REAL APIFY INPUT PAYLOAD ======");
    console.log(JSON.stringify(runInput, null, 2));
    console.log("==========================================");

    try {
        const safeActorId = actorId.replace('/', '~');
        const response = await fetch(`https://api.apify.com/v2/acts/${safeActorId}/runs?token=${APIFY_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(runInput)
        });

        // ... Existing polling logic ...
        const runData = await response.json();
        // remove DEBUG log since we have clear section now
        // console.log("Raw Apify Response:", JSON.stringify(runData, null, 2)); 

        if (!runData.data) {
            console.error("Critical Apify Error: 'data' field missing.", runData);
            return;
        }

        const runId = runData.data.id;
        console.log(`> Actor Started. Run ID: ${runId}`);

        // Poll for completion (Simple Polling)
        console.log("> Waiting for results (max 60s)...");
        let status = 'RUNNING';
        let datasetId = '';

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 5000)); // Wait 5s
            const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
            const statusJson = await statusRes.json();

            if (!statusJson.data) {
                console.log("Polling Error:", statusJson);
                continue;
            }
            status = statusJson.data.status;
            process.stdout.write(".");
            if (status === 'SUCCEEDED') {
                datasetId = statusJson.data.defaultDatasetId;
                break;
            }
        }
        console.log(`\n> Actor Status: ${status}`);

        if (status === 'SUCCEEDED') {
            // Fetch Dataset
            const dataRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
            const items = await dataRes.json();

            console.log("\n====== [2] REAL APIFY OUTPUT (Raw Sample Item) ======");
            if (items.length > 0) {
                // Clone and truncate massive fields for readability
                const sample = { ...items[0] };
                if (sample.caption && sample.caption.length > 100) sample.caption = sample.caption.substring(0, 100) + "...";
                delete sample.owner; delete sample.coauthor_producers; delete sample.tagged_users; // Remove noise
                console.log(JSON.stringify(sample, null, 2));
            } else {
                console.log("(No items returned)");
            }
            console.log("=====================================================");

            const posts = items.map((p: any) => ({ u: p.ownerUsername, t: p.caption, l: p.url })).slice(0, 5);

            // C. Real Gemini Call
            console.log("\n>>> [STEP C] LIVE GEMINI 3 ANALYSIS (gemini-2.0-flash-exp)...");
            const model = "gemini-3-flash-preview";
            const prompt = `
            DATASET: ${JSON.stringify(posts)}
            TASK: Extract specific Food and Movie entities mentioned in these posts.
            QUERY: "${query}"
            OUTPUT: JSON Array [{ "matchedContent": "...", "category": "...", "originalPost": "...", "context": "...", "username": "...", "sentiment": 0.5, "emotion": "Joy" }]
            CRITICAL: 'originalPost' MUST contain the FULL text of the post where the match was found.
            `;

            console.log("\n====== [3] REAL GEMINI PROMPT ======");
            console.log(prompt.trim());
            console.log("====================================");

            const aiRes = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: { responseMimeType: 'application/json' }
            });

            console.log("\n====== [4] REAL GEMINI OUTPUT ======");
            console.log(aiRes.text);
            console.log("====================================");

            console.log("\n>>> [SUCCESS] REAL END-TO-END EXECUTION VERIFIED.");
        } else {
            console.error("> Apify Run Failed or Timed Out.");
        }

    } catch (e) {
        console.error("API Error", e);
    }
}

runRealTest();
