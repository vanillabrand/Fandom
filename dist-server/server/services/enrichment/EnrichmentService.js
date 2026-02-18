// Helper for image proxying (to avoid CORS/Referer issues with Instagram/TikTok images)
export const proxyMediaUrl = (url) => {
    if (!url)
        return '';
    if (url.startsWith('data:'))
        return url; // Already base64
    if (url.includes('/api/proxy/image'))
        return url; // Already proxied
    // Use internal proxy endpoint
    return `/api/proxy/image?url=${encodeURIComponent(url)}`;
};
export class EnrichmentService {
    /**
     * Enrich a single node with profile data
     */
    static enrichNode(node, profile) {
        if (!node || !profile)
            return;
        if (!node.data)
            node.data = {};
        const existingEvidence = node.data.evidence || node.evidence;
        const existingProvenance = node.data.provenance || node.provenance;
        const existingCitation = node.data.citation || node.citation;
        // 1. Basic Identity
        node.data.fullName = profile.fullName || node.data.fullName || node.label;
        node.data.profilePicUrl = proxyMediaUrl(profile.profilePicUrl || node.data.profilePicUrl || '');
        node.data.bio = profile.biography || node.data.bio || '';
        node.data.sourceUrl = profile.externalUrl || `https://instagram.com/${profile.username}`;
        // 2. Metrics (Prioritize Profile Data > Existing Node Data > 0)
        node.data.followers = (profile.followersCount ?? node.data.followerCount ?? 0).toLocaleString();
        node.data.followerCount = profile.followersCount ?? node.data.followerCount ?? 0;
        node.data.followingCount = profile.followsCount ?? node.data.followingCount ?? 0;
        // 3. Content Metrics
        node.data.postCount = profile.postsCount ?? profile.mediaCount ?? (profile.latestPosts ? profile.latestPosts.length : 0);
        node.data.isVerified = profile.isVerified === true; // Trigger UI badge
        node.data.isPrivate = profile.isPrivate === true;
        // 4. IDs & Handles
        node.data.id = profile.id || node.data.id || node.id;
        node.data.username = profile.username || node.data.username || node.username;
        node.data.handle = profile.username ? `@${profile.username.replace('@', '')}` : (node.data.handle || node.handle);
        // 5. Evidence preservation
        if (existingEvidence)
            node.data.evidence = existingEvidence;
        if (existingProvenance)
            node.data.provenance = existingProvenance;
        if (existingCitation)
            node.data.citation = existingCitation;
        // 6. Visual Props (Top Level)
        node.label = node.data.fullName || node.label;
        node.profilePic = node.data.profilePicUrl;
        node.val = Math.max(node.val || 10, 10); // Grow only
        // 7. Flat Sync (for lists)
        const flatSyncFields = [
            'followers', 'followerCount', 'followersCount',
            'following', 'followingCount', 'followsCount',
            'posts', 'postCount', 'postsCount',
            'engagementRate', 'avgLikes', 'avgComments',
            'bio', 'biography', 'profilePicUrl', 'url', 'id', 'username',
            'fullName', 'isBusinessAccount', 'isVerified'
        ];
        flatSyncFields.forEach(field => {
            if (node.data[field] !== undefined) {
                node[field] = node.data[field];
            }
        });
        // 8. Attach Latest Posts (Images/Videos)
        if (profile.latestPosts && profile.latestPosts.length > 0) {
            node.data.latestPosts = profile.latestPosts.map(post => ({
                url: post.url,
                type: post.type,
                caption: post.caption,
                imageUrl: proxyMediaUrl(post.displayUrl || post.url),
                videoUrl: proxyMediaUrl(post.videoUrl),
                date: post.timestamp
            }));
        }
    }
    /**
     * Hydrate a standardized profile from a map based on node candidates
     */
    static findProfileForNode(node, profileMap) {
        if (!node)
            return undefined;
        // [FIX] Enhanced matching with more candidates
        const rawCandidates = [
            node.id,
            node.data?.handle,
            node.data?.username,
            node.label,
            node.name,
            node.handle
        ].filter(k => k && typeof k === 'string');
        const candidates = rawCandidates.map(k => k.toLowerCase().replace('@', '').trim());
        for (const key of candidates) {
            const profile = profileMap.get(key);
            if (profile)
                return profile;
        }
        return undefined;
    }
    /**
     * Traverses and enriches a graph structure (Works for both Tree and Graph)
     */
    static enrichGraph(analytics, profileMap) {
        if (!analytics || !analytics.root)
            return 0;
        let hydrationCount = 0;
        const traverseAndHydrate = (node) => {
            if (!node)
                return;
            const profile = EnrichmentService.findProfileForNode(node, profileMap);
            if (profile) {
                EnrichmentService.enrichNode(node, profile);
                hydrationCount++;
            }
            else {
                // [NEW] Sanitize Hallucinated URLs for un-hydrated nodes
                if (node.data && node.data.profilePicUrl) {
                    if (node.data.profilePicUrl.includes('fxxx.fbcdn') || node.data.profilePicUrl.includes('instagram.fxxx')) {
                        node.data.profilePicUrl = '';
                    }
                }
            }
            // Recurse
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(traverseAndHydrate);
            }
        };
        // Start from Root
        traverseAndHydrate(analytics.root);
        return hydrationCount;
    }
}
