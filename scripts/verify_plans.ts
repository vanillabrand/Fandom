
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load Environment Variables
const envPath = path.resolve(process.cwd(), ".env.local");
console.log("Loading .env from:", envPath);
try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const geminiLine = envContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
    if (geminiLine) {
        process.env.GEMINI_API_KEY = geminiLine.split('=')[1].trim();
    }
} catch (e) {
    console.warn("Failed to read .env.local manually, checking process.env...");
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

// The EXACT Prompt from jobOrchestrator.ts (v3.1)
const generatePrompt = (query: string, sampleSize: number) => {
    let dynamicPostLimit = 3;
    if (sampleSize <= 100) dynamicPostLimit = 10;
    else if (sampleSize <= 500) dynamicPostLimit = 5;
    else dynamicPostLimit = 3;

    const strictActorRegistry = `
    1. Network Scraper (Followers/Following):
       - ID: "thenetaji/instagram-followers-followings-scraper"
       - Input: { "username": ["target"], "type": "followers"|"followings", "max_count": ${sampleSize} }
       - Note: Use 'max_count', NOT 'limit'.

    2. Profile Enricher (Details):
       - ID: "apify/instagram-profile-scraper"
       - Input: { "usernames": ["user1", "user2"] }

    3. Content Scraper (Posts):
       - ID: "apify/instagram-api-scraper"
       - Input: { "directUrls": ["https://..."], "resultsType": "posts", "resultsLimit": 3 } (See Dynamic Rules)
    `;

    return `
    Task: You are an Intelligent Orchestrator for a Fandom Mapping system.
    Goal: Create a "Scrape Plan" to answer the user's query perfectly using ONLY the allowed actors.

    User Query: "${query}"
    Sample Size: ${sampleSize} (Base Nodes)
    Dynamic Post Limit: ${dynamicPostLimit} (Use this for 'resultsLimit' in Content Scraper)

    ALLOWED ACTORS (STRICT):
    ${strictActorRegistry}

    Instructions:
    1. **STRATEGY FIRST**: Define the scraping strategy (Actors/Steps) based on User Query intent.
       - **Network Mapping**: Use 'thenetaji'.
       - **Enrichment**: If using 'thenetaji', you MUST add a second step with 'apify/instagram-profile-scraper' to get full bios/pics.
       - **Content Analysis**: Use 'apify/instagram-api-scraper' with 'directUrls'.

    2. **MANDATORY DATASET REUSE**:
       - If a Local Dataset matches perfectly, reuse it (set 'existingDatasetIds' and 'steps': []).
       
    3. Identify the user's INTENT:
       - "sensitivity_analysis" / "brand_affinity" (Two-Hop: Followers -> Followings)
       - "influencer_identification" (Search -> Filter)
       - "network_clusters" (Two-Hop: Followers -> Followings)
       - "subject_matter" (Followers -> Posts)
       - "bio_search" (Followers + Enrich -> Filter)

    **CRITICAL RULES:**
    1. **Two-Hop Intents (Affinity, Clusters)**: 
       - Step 1: 'thenetaji' (Followers)
       - Step 2: 'apify/instagram-profile-scraper' (Enrichment - Mandatory)
       - Step 3: 'thenetaji' (Followings)
    
    2. **Input Schemas**:
       - 'thenetaji': Use 'max_count' (NOT 'limit').
       - 'api-scraper': Use 'directUrls' (NOT 'usernames').
       - 'search': Use simple keywords (e.g. "fashion london").

    **OUTPUT JSON STRUCTURE:**
    {
      "intent": "intent_key",
      "reasoning": "Explanation...",
      "existingDatasetIds": [],
      "steps": [
        {
          "stepId": "step_1",
          "description": "Scrape followers",
          "actorId": "thenetaji/instagram-followers-followings-scraper",
          "input": { "username": ["target"], "type": "followers", "max_count": ${sampleSize} }
        }
      ],
      "filter": { "minFollowers": 5000 }
    }
    `;
};

const TEST_QUERIES = [
    "What do fans of @nike also buy?",
    "Find the different tribes within the @crypto community",
    "Map the network of @gymshark followers",
    "Communities that follow @visual_composer",
    "Similar brands to @lululemon for men",
    "Find authentic vegan chefs in New York",
    "Emerging street fashion influencers in Tokyo",
    "Tech reviewers with high engagement under 100k followers",
    "Find sustainable beauty creators in UK",
    "Identify micro-influencers for pet food brands",
    "What are @warhammer40k fans talking about?",
    "Trending topics in the @formula1 community",
    "What memes do @wendys followers share?",
    "Analyze the sentiment of @tesla owners",
    "Key themes in @sephora's audience",
    "Find YC founders who follow @paulg",
    "Identify marketing directors following @hubspot",
    "Find investors in the @a16z network",
    "Show me real estate agents in @miami",
    "Find doctors who follow @hubermanlab"
];

async function testQuery(query: string) {
    try {
        const prompt = generatePrompt(query, 500);
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0 }
        });

        const text = result.response.text();
        const plan = JSON.parse(text);
        const errors: string[] = [];

        // 1. Check Networks use thenetaji
        // Exclude explicit enrichment/content actors from this check to avoid false positives from description matching
        const networkSteps = plan.steps.filter((s: any) =>
            ((s.description || '').toLowerCase().includes('follower') || s.input.type === 'followers') &&
            !s.actorId.includes('profile-scraper') &&
            !s.actorId.includes('api-scraper')
        );
        networkSteps.forEach((s: any) => {
            if (s.actorId !== 'thenetaji/instagram-followers-followings-scraper')
                errors.push(`Network step used wrong actor: ${s.actorId}`);
            if (!s.input.max_count) errors.push(`Network step missing 'max_count'`);
            if (s.input.limit) errors.push(`Network step used banned 'limit'`);
        });

        // 2. Check Enrichment for Two-Hop
        if (['brand_affinity', 'network_clusters', 'sensitivity_analysis'].includes(plan.intent)) {
            const enrichStep = plan.steps.find((s: any) => s.actorId === 'apify/instagram-profile-scraper');
            if (!enrichStep) errors.push(`Two-Hop intent '${plan.intent}' missing Enrichment Step`);
        }

        // 3. Check Content Scraper uses directUrls
        const contentSteps = plan.steps.filter((s: any) => s.actorId === 'apify/instagram-api-scraper');
        contentSteps.forEach((s: any) => {
            if (!s.input.directUrls) errors.push(`Content step missing 'directUrls'`);
        });

        return { query, success: errors.length === 0, errors, plan };

    } catch (e: any) {
        return { query, success: false, errors: [e.message] };
    }
}

async function runTests() {
    console.log("🚀 Starting Parallel Verification (20 Queries)...");

    // Run in batches of 5 to avoid rate limits
    const batchSize = 5;
    const results: any[] = [];

    for (let i = 0; i < TEST_QUERIES.length; i += batchSize) {
        const batch = TEST_QUERIES.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1}...`);
        const batchResults = await Promise.all(batch.map(q => testQuery(q)));
        results.push(...batchResults);
    }

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\nResults: ${passed} Passed, ${failed} Failed`);

    const logContent = results.map(r => `Query: "${r.query}"\nSuccess: ${r.success}\nErrors: ${JSON.stringify(r.errors)}\nPlan: ${JSON.stringify(r.plan, null, 2)}\n------------------\n`).join('\n');
    fs.writeFileSync('verification.log', logContent);

    if (failed > 0) {
        console.log("FAILURES (See verification.log):");
        results.filter(r => !r.success).forEach(r => {
            console.log(`\nQuery: "${r.query}"`);
            r.errors.forEach((e: string) => console.log(` - ${e}`));
        });
        process.exit(1);
    } else {
        console.log("🎉 ALL TESTS PASSED.");
        process.exit(0);
    }
}

runTests();
