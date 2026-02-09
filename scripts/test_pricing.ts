
import { costCalculator } from '../server/services/costCalculator.js';
import { mongoService } from '../server/services/mongoService.js';

// Mock DB
(mongoService as any).getPricingConfig = async () => {
    return {
        margin: 1.5,
        costs: { scrapingPer1000: 5.0, geminiPerToken: 0.000001, apifyComputeUnit: 0.25, apifyProxyPerGB: 0.2, forumScoutPerRecord: 0.01 }
    };
};

async function test() {
    console.log("Testing Cost Calculator...");

    // Test 1: Standard Scraper
    const actorId = 'apify/instagram-scraper'; // Rate 4.70 USD in scraper_detail.json
    const count = 1000;
    const res1 = await costCalculator.calculateStepPrice(actorId, count);

    console.log(`Test 1 (Standard Scraper, 1000 recs):`);
    console.log(`Base Rate (Expected): $4.70`);
    console.log(`Result: GBP ${res1.estimatedCost} (Base GBP: ${res1.baseCost})`);

    // Expected: 4.70 * 0.8 (GBP) * 1.5 (Margin) = 3.76 * 1.5 = 5.64
    if (Math.abs(res1.estimatedCost - 5.64) < 0.1) console.log("✅ PASS");
    else console.log(`❌ FAIL (Expected ~5.64, got ${res1.estimatedCost})`);

    // Test 2: Profile Scraper
    const actorId2 = 'apify/instagram-profile-scraper'; // Rate 4.60 USD
    const res2 = await costCalculator.calculateStepPrice(actorId2, 1000);
    console.log(`Test 2 (Profile Scraper, 1000 recs):`);
    console.log(`Result: GBP ${res2.estimatedCost}`);
    // Expected: 4.60 * 0.8 * 1.5 = 3.68 * 1.5 = 5.52
    if (Math.abs(res2.estimatedCost - 5.52) < 0.1) console.log("✅ PASS");
    else console.log(`❌ FAIL (Expected ~5.52, got ${res2.estimatedCost})`);

    // Test 3: Unknown (Fallback)
    const res3 = await costCalculator.calculateStepPrice('unknown/actor', 1000);
    console.log(`Test 3 (Fallback, 1000 recs):`);
    console.log(`Result: GBP ${res3.estimatedCost}`);
    // Expected: 5.00 * 0.8 * 1.5 = 6.00
    if (Math.abs(res3.estimatedCost - 6.00) < 0.1) console.log("✅ PASS");
    else console.log(`❌ FAIL (Expected ~6.00, got ${res3.estimatedCost})`);
}

test().catch(console.error);
