/**
 * Test script for Visual Intelligence - Gemini Vision API
 * 
 * This script tests the analyzeVisualContent function with sample Instagram images.
 * Run with: tsx tests/test-visual-intelligence.ts
 */

import { analyzeVisualContent } from '../services/geminiService.js';

// Sample Instagram image URLs (public posts)
const sampleImages = [
    'https://scontent.cdninstagram.com/v/t51.2885-15/example1.jpg',
    'https://scontent.cdninstagram.com/v/t51.2885-15/example2.jpg',
    'https://scontent.cdninstagram.com/v/t51.2885-15/example3.jpg'
];

async function testVisualIntelligence() {
    console.log('🧪 Testing Visual Intelligence...\n');

    try {
        console.log(`📸 Analyzing ${sampleImages.length} images...`);

        const result = await analyzeVisualContent(sampleImages, 'full');

        console.log('\n✅ Analysis Complete!\n');
        console.log('='.repeat(50));

        console.log('\n🏷️  DETECTED BRANDS:');
        if (result.brands.length > 0) {
            result.brands.forEach((brand, i) => {
                console.log(`  ${i + 1}. ${brand.name} (${brand.confidence}% confidence)`);
                console.log(`     Image: ${brand.imageUrl.substring(0, 50)}...`);
            });
        } else {
            console.log('  No brands detected');
        }

        console.log('\n🎨 AESTHETIC TAGS:');
        if (result.aestheticTags.length > 0) {
            console.log(`  ${result.aestheticTags.join(', ')}`);
        } else {
            console.log('  No tags identified');
        }

        console.log('\n🌈 COLOR PALETTE:');
        if (result.colorPalette.length > 0) {
            result.colorPalette.forEach((color, i) => {
                console.log(`  ${i + 1}. ${color}`);
            });
        } else {
            console.log('  No colors extracted');
        }

        console.log('\n💬 VIBE DESCRIPTION:');
        console.log(`  ${result.vibeDescription || 'No description generated'}`);

        console.log('\n📦 DETECTED PRODUCTS:');
        if (result.products.length > 0) {
            result.products.forEach((product, i) => {
                console.log(`  ${i + 1}. [${product.category}] ${product.description}`);
            });
        } else {
            console.log('  No products detected');
        }

        console.log('\n' + '='.repeat(50));
        console.log('\n✨ Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

// Run test
testVisualIntelligence();
