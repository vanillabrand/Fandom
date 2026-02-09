/**
 * Server-Side AI Cache Integration Guide
 * 
 * Since geminiService.ts runs in both browser and Node.js environments,
 * AI caching must be implemented server-side only.
 */

## Approach 1: Server-Side API Endpoint (Recommended)

Create a dedicated API endpoint that handles AI requests with caching:

### 1. Create API Route: `server/routes/ai.ts`

```typescript
import express from 'express';
import { AICacheService } from '../services/aiCacheService.js';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

// POST /api/ai/generate
router.post('/ai/generate', async (req, res) => {
    const { model, prompt, config, cacheTTL = 24, bypassCache = false } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    
    try {
        // 1. Check cache first
        if (!bypassCache) {
            const cached = await AICacheService.get(prompt, model);
            if (cached) {
                console.log(`💰 [AI Cache] Cache hit for model ${model}`);
                return res.json({
                    text: cached.text || cached,
                    fromCache: true,
                    cost: 0
                });
            }
        }
        
        // 2. Call Gemini API
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config
        });
        
        if (!response || !response.text) {
            throw new Error('Gemini API returned empty response');
        }
        
        // 3. Cache the response
        await AICacheService.set(prompt, model, { text: response.text }, cacheTTL);
        
        // 4. Calculate cost
        const inputTokens = Math.ceil(prompt.length / 4);
        const outputTokens = Math.ceil(response.text.length / 4);
        const cost = (inputTokens / 1_000_000 * 0.075) + (outputTokens / 1_000_000 * 0.30);
        
        res.json({
            text: response.text,
            fromCache: false,
            cost
        });
    } catch (error: any) {
        console.error('[AI API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/ai/cache-stats
router.get('/ai/cache-stats', async (req, res) => {
    try {
        const stats = await AICacheService.getStats();
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
```

### 2. Mount Route in `server/index.js`

```typescript
import aiRoutes from './routes/ai.js';

// ... existing code ...

app.use('/api', aiRoutes);
```

### 3. Update Client-Side Code

Modify `services/geminiService.ts` to use the API endpoint when running in browser:

```typescript
const isServer = typeof window === 'undefined';

async function callGeminiWithCache(model: string, prompt: string, config: any) {
    if (isServer) {
        // Server-side: Use AI cache service directly
        const { callGeminiWithCache } = await import('./aiCacheHelper.js');
        return callGeminiWithCache(getAiClient(), { model, prompt, config });
    } else {
        // Client-side: Call API endpoint
        const response = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, config })
        });
        
        if (!response.ok) {
            throw new Error('AI API request failed');
        }
        
        return response.json();
    }
}

// Then use it in fetchFandomAnalysis:
const cachedResponse = await callGeminiWithCache(
    "gemini-3-flash-preview",
    prompt,
    {
        temperature: 0,
        maxOutputTokens: 30000,
        safetySettings: [...]
    }
);

const responseText = cachedResponse.text;
```

---

## Approach 2: Server-Side Only Service (Alternative)

Move all Gemini API calls to server-side only and expose via API:

### 1. Create `server/services/aiService.ts`

```typescript
import { GoogleGenAI } from '@google/genai';
import { AICacheService } from './aiCacheService.js';

export class AIService {
    private static client: GoogleGenAI;
    
    private static getClient() {
        if (!this.client) {
            const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
            this.client = new GoogleGenAI({ apiKey });
        }
        return this.client;
    }
    
    static async generateWithCache(
        model: string,
        prompt: string,
        config: any,
        cacheTTL: number = 24
    ) {
        // Check cache
        const cached = await AICacheService.get(prompt, model);
        if (cached) {
            return { text: cached.text || cached, fromCache: true, cost: 0 };
        }
        
        // Call API
        const ai = this.getClient();
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config
        });
        
        // Cache response
        await AICacheService.set(prompt, model, { text: response.text }, cacheTTL);
        
        // Calculate cost
        const cost = this.calculateCost(prompt, response.text);
        
        return { text: response.text, fromCache: false, cost };
    }
    
    private static calculateCost(prompt: string, response: string): number {
        const inputTokens = Math.ceil(prompt.length / 4);
        const outputTokens = Math.ceil(response.length / 4);
        return (inputTokens / 1_000_000 * 0.075) + (outputTokens / 1_000_000 * 0.30);
    }
}
```

### 2. Use in Job Orchestrator

```typescript
import { AIService } from './aiService.js';

// In jobOrchestrator.ts:
const response = await AIService.generateWithCache(
    'gemini-3-flash-preview',
    prompt,
    config,
    24 // TTL hours
);

console.log(`AI Response (from cache: ${response.fromCache}, cost: $${response.cost?.toFixed(4)})`);
```

---

## Testing

### 1. Test Cache Hit
```bash
# First request (cache miss)
curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3-flash-preview","prompt":"Hello world"}'

# Second request (cache hit)
curl -X POST http://localhost:3000/api/ai/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3-flash-preview","prompt":"Hello world"}'
```

### 2. Check Stats
```bash
curl http://localhost:3000/api/ai/cache-stats
```

Expected output:
```json
{
  "totalEntries": 1,
  "totalHits": 1,
  "avgHitsPerEntry": 1,
  "oldestEntry": "2026-02-05T12:00:00.000Z",
  "newestEntry": "2026-02-05T12:00:00.000Z"
}
```

---

## Recommendation

**Use Approach 1** (API endpoint) for maximum flexibility:
- ✅ Works with existing client-side code
- ✅ Centralized caching logic
- ✅ Easy to monitor and debug
- ✅ Can add authentication/rate limiting later

**File**: `server/routes/ai.ts` (create this file with the code above)
