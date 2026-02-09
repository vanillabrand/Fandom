/**
 * Media URL Proxy Helper (Server-Side)
 * Transforms media URLs to use the Apify proxy for CORS-free loading
 */

const DOMAINS_TO_PROXY = [
    'cdninstagram.com',
    'fbcdn.net',
    'tiktokcdn.com',
    'p16-sign', // TikTok
    'v16-webapp', // TikTok Video
    'scontent',  // Facebook CDN
    'googleusercontent' // Google hosted content
];

/**
 * Transform a media URL to use the proxy endpoint
 */
export function proxyMediaUrl(url: string | undefined | null): string | undefined {
    if (!url) return undefined;

    // Check if URL needs proxying
    const shouldProxy = DOMAINS_TO_PROXY.some(domain => url.includes(domain));

    if (shouldProxy) {
        // [FIX] Defensive check: Don't double-proxy if already prefixed
        if (url.includes('/api/proxy-image')) return url;

        // Return proxy URL format that client expects
        return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }

    return url;
}

/**
 * Apply proxy transformation to all media URLs in an object
 * Handles common field names: profilePic, profilePicUrl, profile_pic_url, imageUrl, thumbnailUrl, etc.
 */
export function proxyMediaFields(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const result = { ...obj };

    // List of common media URL field names
    const mediaFields = [
        'profilePic',
        'profilePicUrl',
        'profile_pic_url',
        'profilePicUrlHD',
        'profile_pic_url_hd',
        'imageUrl',
        'image_url',
        'thumbnailUrl',
        'thumbnail_url',
        'displayUrl',
        'display_url',
        'url', // Generic
        'img',
        'picture',
        'mediaUrl',
        'videoUrl',
        'video_url'
    ];

    // Transform each media field
    for (const field of mediaFields) {
        if (field in result && typeof result[field] === 'string') {
            result[field] = proxyMediaUrl(result[field]);
        }
    }

    return result;
}

/**
 * Apply proxy transformation to array of objects
 */
export function proxyMediaArray(items: any[]): any[] {
    return items.map(item => proxyMediaFields(item));
}
