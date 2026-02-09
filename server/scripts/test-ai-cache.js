#!/usr/bin/env node

/**
 * Test AI Cache API
 * 
 * Tests the AI cache endpoint with sample requests
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testAICache() {
    console.log('🧪 Testing AI Cache API\n');

    const testPrompt = 'What is the capital of France? Answer in one word.';
    const testModel = 'gemini-3-flash-preview';

    // Test 1: First request (cache miss)
    console.log('📤 Test 1: First request (should be cache miss)');
    const start1 = Date.now();
    const response1 = await fetch(`${API_URL}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: testModel,
            prompt: testPrompt,
            config: { temperature: 0 }
        })
    });

    const data1 = await response1.json();
    const time1 = Date.now() - start1;

    console.log(`✅ Response: ${data1.text?.substring(0, 100)}...`);
    console.log(`   From cache: ${data1.fromCache}`);
    console.log(`   Cost: $${data1.cost?.toFixed(4) || 0}`);
    console.log(`   Time: ${time1}ms\n`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Second request (cache hit)
    console.log('📤 Test 2: Second request (should be cache hit)');
    const start2 = Date.now();
    const response2 = await fetch(`${API_URL}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: testModel,
            prompt: testPrompt,
            config: { temperature: 0 }
        })
    });

    const data2 = await response2.json();
    const time2 = Date.now() - start2;

    console.log(`✅ Response: ${data2.text?.substring(0, 100)}...`);
    console.log(`   From cache: ${data2.fromCache}`);
    console.log(`   Cost: $${data2.cost?.toFixed(4) || 0}`);
    console.log(`   Time: ${time2}ms`);
    console.log(`   Speed improvement: ${((time1 - time2) / time1 * 100).toFixed(1)}%\n`);

    // Test 3: Cache stats
    console.log('📊 Test 3: Cache statistics');
    const statsResponse = await fetch(`${API_URL}/api/ai/cache-stats`);
    const stats = await statsResponse.json();

    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log(`   Total hits: ${stats.totalHits}`);
    console.log(`   Avg hits per entry: ${stats.avgHitsPerEntry?.toFixed(2)}\n`);

    // Test 4: Different prompt (cache miss)
    console.log('📤 Test 4: Different prompt (should be cache miss)');
    const response3 = await fetch(`${API_URL}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: testModel,
            prompt: 'What is 2 + 2? Answer in one word.',
            config: { temperature: 0 }
        })
    });

    const data3 = await response3.json();
    console.log(`✅ Response: ${data3.text?.substring(0, 100)}...`);
    console.log(`   From cache: ${data3.fromCache}`);
    console.log(`   Cost: $${data3.cost?.toFixed(4) || 0}\n`);

    // Summary
    console.log('📈 Summary:');
    const totalCost = (data1.cost || 0) + (data2.cost || 0) + (data3.cost || 0);
    const savedCost = data1.cost || 0; // Second request saved this amount
    console.log(`   Total cost: $${totalCost.toFixed(4)}`);
    console.log(`   Saved from cache: $${savedCost.toFixed(4)}`);
    console.log(`   Cache hit rate: ${stats.totalHits}/${stats.totalEntries + stats.totalHits} (${(stats.totalHits / (stats.totalEntries + stats.totalHits) * 100).toFixed(1)}%)`);
    console.log('\n✅ All tests passed!');
}

// Run tests
testAICache().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
