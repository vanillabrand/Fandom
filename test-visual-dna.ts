// Test script to verify Visual DNA functionality
import { analyzeVisualContent } from './services/geminiService.js';

const testImages = [
    'https://instagram.fscl3-1.fna.fbcdn.net/v/t51.2885-19/123456789_123456789_123456789_n.jpg',
    'https://instagram.fscl3-1.fna.fbcdn.net/v/t51.2885-19/987654321_987654321_987654321_n.jpg'
];

console.log('[Test] Starting Visual DNA test...');
console.log('[Test] Test images:', testImages);

try {
    const result = await analyzeVisualContent(testImages, 'vibe');
    console.log('[Test] ✅ Visual DNA Result:', JSON.stringify(result, null, 2));
} catch (error: any) {
    console.error('[Test] ❌ Visual DNA Error:', error.message);
    console.error('[Test] Error details:', error);
}
