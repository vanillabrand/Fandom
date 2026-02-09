
import * as crypto from 'crypto';

/**
 * Returns a JSON string with keys strictly sorted recursively.
 * Ensures deterministic hashing for caching.
 * 
 * @param obj - The object to stringify
 */
export function canonicalize(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
        // We do NOT sort arrays, as order often matters in inputs (e.g. priority)
        // We just recurse into elements
        const strList = obj.map(item => canonicalize(item));
        return `[${strList.join(',')}]`;
    }

    const keys = Object.keys(obj).sort();
    const parts = keys.map(key => {
        const val = canonicalize(obj[key]);
        // To verify we are matching JSON.stringify behavior precisely with keys
        // We wrap property names in quotes
        return `"${key}":${val}`;
    });

    return `{${parts.join(',')}}`;
}

/**
 * Generates SHA-256 fingerprint for Apify Caching
 */
export function getFingerprint(actorId: string, input: any): string {
    const canonicalInput = canonicalize(input);
    return crypto.createHash('sha256').update(`${actorId}:${canonicalInput}`).digest('hex');
}
