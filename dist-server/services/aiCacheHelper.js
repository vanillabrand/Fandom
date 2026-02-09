/**
 * AI Cache Integration Helper
 *
 * Wrapper function for Gemini API calls with automatic caching.
 * Use this in place of direct ai.models.generateContent() calls.
 */
import { AICacheService } from '../server/services/aiCacheService.js';
/**
 * Call Gemini API with automatic caching
 *
 * @param aiClient - GoogleGenAI client instance
 * @param options - Configuration options
 * @returns Response with cache metadata
 */
export async function callGeminiWithCache(aiClient, options) {
    const { model, prompt, config, cacheTTL = 24, bypassCache = false } = options;
    // 1. Check cache first (unless bypassed)
    if (!bypassCache) {
        try {
            const cached = await AICacheService.get(prompt, model);
            if (cached) {
                console.log(`💰 [AI Cache] Saved API call for model ${model}`);
                return {
                    text: cached.text || cached,
                    fromCache: true,
                    cost: 0
                };
            }
        }
        catch (error) {
            console.warn('[AI Cache] Error reading cache, proceeding with API call:', error);
        }
    }
    // 2. Call Gemini API
    console.log(`🔄 [AI Cache] Calling Gemini API for model ${model}`);
    const response = await aiClient.models.generateContent({
        model,
        contents: prompt,
        config
    });
    if (!response || !response.text) {
        throw new Error('Gemini API returned empty response');
    }
    // 3. Cache the response
    try {
        await AICacheService.set(prompt, model, { text: response.text }, cacheTTL);
    }
    catch (error) {
        console.warn('[AI Cache] Error storing cache:', error);
        // Don't throw - caching is optional
    }
    // 4. Calculate approximate cost (rough estimate)
    const inputTokens = Math.ceil(prompt.length / 4); // ~4 chars per token
    const outputTokens = Math.ceil(response.text.length / 4);
    const costPer1MInputTokens = 0.075; // $0.075 per 1M input tokens (Gemini 2.0 Flash)
    const costPer1MOutputTokens = 0.30; // $0.30 per 1M output tokens
    const cost = (inputTokens / 1_000_000 * costPer1MInputTokens) +
        (outputTokens / 1_000_000 * costPer1MOutputTokens);
    return {
        text: response.text,
        fromCache: false,
        cost
    };
}
/**
 * Get AI cache statistics
 */
export async function getAICacheStats() {
    try {
        return await AICacheService.getStats();
    }
    catch (error) {
        console.warn('[AI Cache] Error getting stats:', error);
        return {
            totalEntries: 0,
            totalHits: 0,
            avgHitsPerEntry: 0,
            oldestEntry: null,
            newestEntry: null
        };
    }
}
/**
 * Invalidate AI cache entries
 *
 * @param modelPattern - Optional regex pattern to match model names
 * @returns Number of entries invalidated
 */
export async function invalidateAICache(modelPattern) {
    try {
        return await AICacheService.invalidate(modelPattern);
    }
    catch (error) {
        console.warn('[AI Cache] Error invalidating cache:', error);
        return 0;
    }
}
