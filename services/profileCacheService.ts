/**
 * Profile Cache Service
 * Handles caching of follower counts to avoid redundant API calls
 */

const API_BASE = '/api';

export interface ProfileCacheEntry {
    username: string;
    platform: string;
    followers: number;
    cachedAt: Date;
}

/**
 * Get cached follower count for a profile
 * Returns null if not cached or cache expired (>7 days)
 */
export const getCachedFollowerCount = async (
    username: string,
    platform: string
): Promise<number | null> => {
    try {
        const response = await fetch(
            `${API_BASE}/profile-cache/${platform}/${encodeURIComponent(username)}`
        );

        if (response.status === 404) return null;
        if (!response.ok) return null;

        const data = await response.json();
        return data.followers;
    } catch (error) {
        console.error('[ProfileCache] Error fetching cache:', error);
        return null;
    }
};

/**
 * Cache follower count for a profile (7-day retention)
 */
export const cacheFollowerCount = async (
    username: string,
    platform: string,
    followers: number
): Promise<void> => {
    try {
        await fetch(`${API_BASE}/profile-cache`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, platform, followers })
        });
    } catch (error) {
        console.error('[ProfileCache] Error caching follower count:', error);
    }
};

/**
 * Get follower count with caching
 * Checks cache first, then calls API if needed
 */
export const getFollowerCountWithCache = async (
    username: string,
    platform: string,
    fetchFn: () => Promise<number>
): Promise<number> => {
    // Check cache first
    const cached = await getCachedFollowerCount(username, platform);
    if (cached !== null) {
        console.log(`[ProfileCache] Cache hit for @${username} (${platform}): ${cached} followers`);
        return cached;
    }

    // Cache miss - fetch from API
    console.log(`[ProfileCache] Cache miss for @${username} (${platform}) - fetching...`);
    const followers = await fetchFn();

    // Cache the result
    await cacheFollowerCount(username, platform, followers);

    return followers;
};
