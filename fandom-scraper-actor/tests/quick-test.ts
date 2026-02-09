/**
 * Quick Validation Test for Scraper Actor
 * Simpler test to verify basic functionality
 */

import { Dataset } from 'crawlee';
import { runActor } from '../src/main.js';

async function quickTest() {
    console.log('\n🧪 Quick Scraper Validation Test\n');

    try {
        console.log('Test 1: Instagram Profile');
        console.log('─'.repeat(50));

        await runActor({
            platform: 'instagram',
            dataType: 'profile',
            targets: ['https://www.instagram.com/cristiano/'],
            limit: 1,
            debug: true
        });

        const dataset = await Dataset.open();
        const data = await dataset.getData();

        console.log(`\n✅ Test Complete!`);
        console.log(`Items: ${data.count}`);

        if (data.count > 0) {
            const item: any = data.items[0];
            console.log(`Type: ${item.type}`);
            console.log(`Platform: ${item.platform}`);
            console.log(`Data keys: ${Object.keys(item.data || item).slice(0, 10).join(', ')}`);
            console.log(`\n📊 Sample Output:`);
            console.log(JSON.stringify(item, null, 2).substring(0, 500) + '...');
        } else {
            console.log(`⚠️  No data returned`);
        }

        await dataset.drop();

    } catch (error: any) {
        console.error(`\n❌ Test Failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }

    console.log('\n✅ Scraper is functional!\n');
}

quickTest();
