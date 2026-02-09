import express from 'express';
import { AICacheService } from '../services/aiCacheService.js';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Helper to get API key
const getApiKey = () => {
    return process.env.GEMINI_API_KEY || process.env.API_KEY;
};

// Lazy initialization for GoogleGenAI client
let aiClient: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!aiClient) {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error("Google Gemini API Key is missing. Please check your environment configuration.");
        }
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
};

/**
 * POST /api/ai/generate
 * 
 * Generate AI content with automatic caching
 * 
 * Body:
 * - model: string (e.g., "gemini-3-flash-preview")
 * - prompt: string
 * - config: object (optional, Gemini config)
 * - cacheTTL: number (optional, hours, default 24)
 * - bypassCache: boolean (optional, default false)
 */
router.post('/ai/generate', authMiddleware, async (req, res) => {
    const { model, prompt, config, cacheTTL = 24, bypassCache = false } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!model) {
        return res.status(400).json({ error: 'Model is required' });
    }

    try {
        // 1. Check cache first (unless bypassed)
        if (!bypassCache) {
            const cached = await AICacheService.get(prompt, model);
            if (cached) {
                console.log(`💰 [AI Cache] Cache hit for model ${model} (saved API call)`);
                return res.json({
                    text: cached.text || cached,
                    fromCache: true,
                    cost: 0,
                    cacheHit: true
                });
            }
        }

        // 2. Call Gemini API
        console.log(`🔄 [AI Cache] Cache miss - calling Gemini API for model ${model}`);
        const ai = getAiClient();

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: config || {
                temperature: 0,
                maxOutputTokens: 30000,
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
                ]
            }
        });

        if (!response || !response.text) {
            throw new Error('Gemini API returned empty response');
        }

        // 3. Cache the response
        try {
            await AICacheService.set(prompt, model, { text: response.text }, cacheTTL);
            console.log(`✅ [AI Cache] Response cached for ${cacheTTL} hours`);
        } catch (cacheError) {
            console.warn('[AI Cache] Error storing cache (non-fatal):', cacheError);
            // Don't throw - caching is optional
        }

        // 4. Calculate approximate cost
        const inputTokens = Math.ceil(prompt.length / 4); // ~4 chars per token
        const outputTokens = Math.ceil(response.text.length / 4);

        // Gemini 2.0 Flash pricing (as of Feb 2026)
        const costPer1MInputTokens = 0.075; // $0.075 per 1M input tokens
        const costPer1MOutputTokens = 0.30; // $0.30 per 1M output tokens

        const cost = (inputTokens / 1_000_000 * costPer1MInputTokens) +
            (outputTokens / 1_000_000 * costPer1MOutputTokens);

        console.log(`💵 [AI Cache] API call cost: $${cost.toFixed(4)} (${inputTokens} in + ${outputTokens} out tokens)`);

        res.json({
            text: response.text,
            fromCache: false,
            cost,
            cacheHit: false,
            tokens: {
                input: inputTokens,
                output: outputTokens
            }
        });
    } catch (error: any) {
        console.error('[AI API] Error:', error);
        res.status(500).json({
            error: error.message || 'AI generation failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/ai/cache-stats
 * 
 * Get AI cache statistics
 */
router.get('/ai/cache-stats', authMiddleware, async (req, res) => {
    try {
        const stats = await AICacheService.getStats();
        res.json(stats);
    } catch (error: any) {
        console.error('[AI Cache Stats] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/ai/cache-invalidate
 * 
 * Invalidate cache entries matching a pattern
 * 
 * Body:
 * - modelPattern: string (optional, regex pattern to match model names)
 */
router.post('/ai/cache-invalidate', authMiddleware, async (req, res) => {
    try {
        const { modelPattern } = req.body;
        const count = await AICacheService.invalidate(modelPattern);

        console.log(`🗑️  [AI Cache] Invalidated ${count} cache entries`);
        res.json({
            success: true,
            invalidatedCount: count,
            message: `Invalidated ${count} cache entries`
        });
    } catch (error: any) {
        console.error('[AI Cache Invalidate] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
