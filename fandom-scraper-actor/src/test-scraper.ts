/**
 * Test script for fandom-scraper-actor
 * 
 * Tests Instagram and TikTok scraping with sample queries
 */

import { runActor } from './main.js';

async function runTests() {
    console.log('🧪 Starting Scraper Tests...\n');

    // Test 1: Instagram Profile Scraping
    console.log('📸 Test 1: Instagram Profile Scraping');
    try {
        await runActor({
            platform: 'instagram',
            dataType: 'profile',
            targets: ['https://www.instagram.com/cristiano/'],
            limit: 1,
            debug: true
        });
        console.log('✅ Instagram profile test passed\n');
    } catch (error: any) {
        console.error('❌ Instagram profile test failed:', error.message, '\n');
    }

    // Test 2: Instagram Posts Scraping
    console.log('📸 Test 2: Instagram Posts Scraping');
    try {
        await runActor({
            platform: 'instagram',
            dataType: 'posts',
            targets: ['https://www.instagram.com/cristiano/'],
            limit: 3,
            debug: true
        });
        console.log('✅ Instagram posts test passed\n');
    } catch (error: any) {
        console.error('❌ Instagram posts test failed:', error.message, '\n');
    }

    // Test 3: TikTok Profile Scraping
    console.log('🎵 Test 3: TikTok Profile Scraping');
    try {
        await runActor({
            platform: 'tiktok',
            dataType: 'profile',
            targets: ['https://www.tiktok.com/@khaby.lame'],
            limit: 1,
            debug: true
        });
        console.log('✅ TikTok profile test passed\n');
    } catch (error: any) {
        console.error('❌ TikTok profile test failed:', error.message, '\n');
    }

    // Test 4: TikTok Posts Scraping
    console.log('🎵 Test 4: TikTok Posts Scraping');
    try {
        await runActor({
            platform: 'tiktok',
            dataType: 'posts',
            targets: ['https://www.tiktok.com/@khaby.lame'],
            limit: 3,
            debug: true
        });
        console.log('✅ TikTok posts test passed\n');
    } catch (error: any) {
        console.error('❌ TikTok posts test failed:', error.message, '\n');
    }

    console.log('🎉 All tests completed!');
}

// Run tests
runTests().catch(console.error);
