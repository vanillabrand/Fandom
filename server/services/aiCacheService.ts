/**
 * AI Cache Service
 * 
 * Caches AI/Gemini API responses to reduce costs and improve performance.
 * Implements intelligent caching with TTL and cache invalidation.
 */

import { mongoService } from './mongoService.js';
import crypto from 'crypto';

export interface CacheEntry {
    key: string;
    prompt: string;
    model: string;
    response: any;
    createdAt: Date;
    expiresAt: Date;
    hitCount: number;
}

export class AICacheService {
    /**
     * Ensure required indexes exist for optimal performance
     */
    static async ensureIndexes(): Promise<void> {
        try {
            const db = mongoService.getDb();

            // Unique index on cache key
            await db.collection('ai_cache').createIndex(
                { key: 1 },
                { unique: true }
            );

            // TTL index on expiration date
            await db.collection('ai_cache').createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0 }
            );

            console.log('✅ [AI Cache] Indexes verified');
        } catch (error) {
            console.warn('[AI Cache] Index creation failed (may already exist):', error);
        }
    }

    /**
     * Generate a deterministic cache key from prompt and model
     */
    private static generateCacheKey(prompt: string, model: string): string {
        // Normalize prompt (trim, lowercase for case-insensitive matching)
        const normalizedPrompt = prompt.trim().toLowerCase();

        return crypto
            .createHash('sha256')
            .update(`${model}:${normalizedPrompt}`)
            .digest('hex');
    }

    /**
     * Get cached AI response if available and not expired
     */
    static async get(prompt: string, model: string): Promise<any | null> {
        try {
            const db = mongoService.getDb();
            const cacheKey = this.generateCacheKey(prompt, model);

            const cached = await db.collection<CacheEntry>('ai_cache').findOne({
                key: cacheKey,
                expiresAt: { $gt: new Date() }
            });

            if (cached) {
                console.log(`✅ [AI Cache] HIT for model ${model} (saved API call)`);

                // Increment hit counter
                await db.collection('ai_cache').updateOne(
                    { key: cacheKey },
                    { $inc: { hitCount: 1 } }
                );

                return cached.response;
            }

            console.log(`❌ [AI Cache] MISS for model ${model}`);
            return null;

        } catch (error) {
            console.warn('[AI Cache] Error reading cache:', error);
            return null; // Fail gracefully
        }
    }

    /**
     * Store AI response in cache with TTL
     */
    static async set(
        prompt: string,
        model: string,
        response: any,
        ttlHours: number = 24
    ): Promise<void> {
        try {
            const db = mongoService.getDb();
            const cacheKey = this.generateCacheKey(prompt, model);
            const now = new Date();
            const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

            await db.collection<CacheEntry>('ai_cache').updateOne(
                { key: cacheKey },
                {
                    $set: {
                        key: cacheKey,
                        prompt: prompt.substring(0, 1000), // Store truncated for debugging
                        model,
                        response,
                        createdAt: now,
                        expiresAt,
                        hitCount: 0
                    }
                },
                { upsert: true }
            );

            console.log(`💾 [AI Cache] Stored response for model ${model} (TTL: ${ttlHours}h)`);

        } catch (error) {
            console.warn('[AI Cache] Error storing cache:', error);
            // Don't throw - caching is optional
        }
    }

    /**
     * Invalidate cache entries matching a pattern
     */
    static async invalidate(modelPattern?: string): Promise<number> {
        try {
            const db = mongoService.getDb();

            const filter: any = {};
            if (modelPattern) {
                filter.model = { $regex: modelPattern, $options: 'i' };
            }

            const result = await db.collection('ai_cache').deleteMany(filter);

            console.log(`🗑️  [AI Cache] Invalidated ${result.deletedCount} entries`);
            return result.deletedCount;

        } catch (error) {
            console.warn('[AI Cache] Error invalidating cache:', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    static async getStats(): Promise<{
        totalEntries: number;
        totalHits: number;
        avgHitsPerEntry: number;
        oldestEntry: Date | null;
        newestEntry: Date | null;
    }> {
        try {
            const db = mongoService.getDb();

            const stats = await db.collection<CacheEntry>('ai_cache').aggregate([
                {
                    $group: {
                        _id: null,
                        totalEntries: { $sum: 1 },
                        totalHits: { $sum: '$hitCount' },
                        oldestEntry: { $min: '$createdAt' },
                        newestEntry: { $max: '$createdAt' }
                    }
                }
            ]).toArray();

            if (stats.length === 0) {
                return {
                    totalEntries: 0,
                    totalHits: 0,
                    avgHitsPerEntry: 0,
                    oldestEntry: null,
                    newestEntry: null
                };
            }

            const result = stats[0];
            return {
                totalEntries: result.totalEntries,
                totalHits: result.totalHits,
                avgHitsPerEntry: result.totalEntries > 0
                    ? Math.round(result.totalHits / result.totalEntries * 10) / 10
                    : 0,
                oldestEntry: result.oldestEntry,
                newestEntry: result.newestEntry
            };

        } catch (error) {
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
     * Clean up expired entries (manual cleanup, TTL index handles auto-cleanup)
     */
    static async cleanup(): Promise<number> {
        try {
            const db = mongoService.getDb();

            const result = await db.collection('ai_cache').deleteMany({
                expiresAt: { $lt: new Date() }
            });

            console.log(`🧹 [AI Cache] Cleaned up ${result.deletedCount} expired entries`);
            return result.deletedCount;

        } catch (error) {
            console.warn('[AI Cache] Error during cleanup:', error);
            return 0;
        }
    }
}
