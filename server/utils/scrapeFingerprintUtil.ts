import crypto from 'crypto';

/**
 * Scrape Fingerprinting Utility
 * Generates unique fingerprints for scrape operations to avoid duplicates
 */

export interface ScrapeFingerprintMetadata {
    platform: string;
    targetProfile?: string;
    dataType?: string;
    tags?: string[];
}

export interface ScrapeFingerprint {
    fingerprint: string;
    actorName: string;
    payload: any;
    payloadHash: string;
    executedAt: Date;
    datasetId: string;
    recordCount: number;
    metadata: ScrapeFingerprintMetadata;
    expiresAt?: Date;
}

/**
 * Sort object keys recursively for consistent hashing
 */
function sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }

    const sorted: any = {};
    Object.keys(obj)
        .sort()
        .forEach(key => {
            sorted[key] = sortObjectKeys(obj[key]);
        });

    return sorted;
}

/**
 * Generate unique fingerprint for a scrape operation
 * @param actorName - Apify actor name (e.g., "apify/instagram-scraper")
 * @param payload - Scrape configuration object
 * @returns SHA-256 hash fingerprint
 */
export function generateScrapeFingerprint(
    actorName: string,
    payload: any
): string {
    // Sort payload keys for consistent hashing
    const sortedPayload = sortObjectKeys(payload);
    const payloadString = JSON.stringify(sortedPayload);

    // Create fingerprint: SHA-256(actorName + sortedPayload)
    const fingerprint = crypto
        .createHash('sha256')
        .update(actorName + payloadString)
        .digest('hex');

    return fingerprint;
}

/**
 * Generate payload hash separately for indexing
 */
export function generatePayloadHash(payload: any): string {
    const sortedPayload = sortObjectKeys(payload);
    const payloadString = JSON.stringify(sortedPayload);

    return crypto
        .createHash('sha256')
        .update(payloadString)
        .digest('hex');
}

/**
 * Extract metadata from payload for better searchability
 */
export function extractMetadataFromPayload(
    actorName: string,
    payload: any
): ScrapeFingerprintMetadata {
    const metadata: ScrapeFingerprintMetadata = {
        platform: 'unknown',
        tags: []
    };

    // Detect platform from actor name
    if (actorName.includes('instagram')) {
        metadata.platform = 'instagram';
    } else if (actorName.includes('tiktok')) {
        metadata.platform = 'tiktok';
    } else if (actorName.includes('twitter') || actorName.includes('x-scraper')) {
        metadata.platform = 'twitter';
    } else if (actorName.includes('youtube')) {
        metadata.platform = 'youtube';
    }

    // Extract target profile
    if (payload.username) {
        metadata.targetProfile = payload.username;
    } else if (payload.usernames && Array.isArray(payload.usernames)) {
        metadata.targetProfile = payload.usernames[0];
        if (payload.usernames.length > 1) {
            metadata.tags?.push('batch');
        }
    } else if (payload.handles && Array.isArray(payload.handles)) {
        metadata.targetProfile = payload.handles[0];
    }

    // Detect data type
    if (payload.resultsLimit || payload.maxPosts) {
        metadata.dataType = 'posts';
    } else if (payload.scrapeFollowers) {
        metadata.dataType = 'followers';
    } else if (payload.scrapeFollowing) {
        metadata.dataType = 'following';
    } else if (payload.scrapeComments) {
        metadata.dataType = 'comments';
    }

    // Add tags based on configuration
    if (payload.resultsLimit) {
        metadata.tags?.push(`limit:${payload.resultsLimit}`);
    }

    return metadata;
}

/**
 * Calculate TTL (Time To Live) based on data type
 * Different data types have different freshness requirements
 */
export function calculateTTL(dataType?: string): number {
    const ttlHours: Record<string, number> = {
        'posts': 24,          // Posts change frequently
        'followers': 168,     // 7 days - followers change slower
        'following': 168,     // 7 days
        'profile': 720,       // 30 days - profile data rarely changes
        'comments': 24,       // Comments can be dynamic
        'default': 72         // 3 days default
    };

    return ttlHours[dataType || 'default'] || ttlHours.default;
}

/**
 * Check if a fingerprint is still fresh based on TTL
 */
export function isFingerprintFresh(
    executedAt: Date,
    dataType?: string,
    customTTLHours?: number
): boolean {
    const ttlHours = customTTLHours || calculateTTL(dataType);
    const ageHours = (Date.now() - executedAt.getTime()) / (1000 * 60 * 60);

    return ageHours <= ttlHours;
}
