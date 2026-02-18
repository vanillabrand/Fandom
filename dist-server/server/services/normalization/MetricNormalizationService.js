export class MetricNormalizationService {
    /**
     * Safe Metric Parser
     * Handles numbers, strings with commas (e.g. "1,234"), and nulls.
     */
    static parse(val) {
        if (val === null || val === undefined)
            return null;
        if (typeof val === 'number')
            return val;
        if (typeof val === 'string') {
            // [ROBUST] Handle common social media formats: "1.3M", "10k", "1,234"
            const sanitized = val.toLowerCase().replace(/,/g, '').replace(/\s/g, '').trim();
            if (!sanitized)
                return null;
            let multiplier = 1;
            if (sanitized.endsWith('m'))
                multiplier = 1000000;
            else if (sanitized.endsWith('k'))
                multiplier = 1000;
            const numericPart = sanitized.replace(/[mk]$/, '');
            const parsed = parseFloat(numericPart);
            return isNaN(parsed) ? null : Math.round(parsed * multiplier);
        }
        return null;
    }
    /**
     * UNIFIED METRIC EXTRACTOR
     * Safely probes an object for various common metric aliases using null-coalescing.
     */
    static extract(obj, type) {
        if (!obj)
            return null;
        const aliases = {
            followers: [
                // Priority 1: Nested RICH data (Search/Discovery source) - Most Reliable
                obj.data?.followersCount, obj.data?.followerCount, obj.data?.followers_count, obj.data?.follower_count, obj.data?.followers,
                // Priority 2: Top-level specific count fields
                obj.followersCount, obj.followerCount, obj.followers_count, obj.follower_count,
                // Priority 3: API specific objects
                obj.edge_followed_by?.count, obj.edgeFollowedBy?.count,
                obj.metaData?.followersCount, obj.metaData?.followerCount,
                obj.owner?.followersCount, obj.owner?.followerCount, obj.owner?.followers_count, obj.owner?.follower_count,
                obj.owner?.edge_followed_by?.count,
                // Priority 4: Top-level general fields (often have false 0s in stubs)
                obj.followers
            ],
            following: [
                // Priority 1: Nested RICH data
                obj.data?.followsCount, obj.data?.followingCount, obj.data?.following_count, obj.data?.follows_count, obj.data?.following, obj.data?.follows,
                // Priority 2: Top-level specific count fields
                obj.followsCount, obj.followingCount, obj.following_count, obj.follows_count,
                // Priority 3: API specific objects
                obj.edge_follow?.count, obj.edgeFollow?.count,
                obj.metaData?.followingCount, obj.metaData?.followsCount,
                obj.owner?.followingCount, obj.owner?.followsCount, obj.owner?.following_count, obj.owner?.follows_count,
                obj.owner?.edge_follow?.count,
                // Priority 4: Top-level general fields
                obj.follows, obj.following
            ],
            posts: [
                // Priority 1: Nested RICH data
                obj.data?.postsCount, obj.data?.mediaCount, obj.data?.postCount, obj.data?.posts_count, obj.data?.media_count, obj.data?.posts,
                // Priority 2: Top-level specific count fields
                obj.postsCount, obj.mediaCount, obj.postCount, obj.posts_count, obj.media_count,
                // Priority 3: API specific objects
                obj.edge_owner_to_timeline_media?.count, obj.edgeOwnerToTimelineMedia?.count,
                obj.metaData?.postsCount, obj.metaData?.mediaCount, obj.metaData?.postCount, obj.metaData?.posts_count,
                obj.owner?.postsCount, obj.owner?.mediaCount, obj.owner?.postCount, obj.owner?.posts_count, obj.owner?.media_count,
                obj.owner?.edge_owner_to_timeline_media?.count,
                // Priority 4: Top-level general fields
                obj.posts
            ]
        };
        const candidates = aliases[type] || [];
        let firstZero = null;
        for (const val of candidates) {
            if (val !== undefined && val !== null) {
                const parsed = this.parse(val);
                if (parsed !== null) {
                    if (parsed > 0)
                        return parsed; // [PRIORITY] Found a real count!
                    // [FIX] Only accept 0 if it comes from a tailored field, not a generic one like 'posts' which might be a stub
                    // We only "remember" the zero if it seems credible (e.g. from an API object)
                    if (firstZero === null)
                        firstZero = 0;
                }
            }
        }
        // [STRICT] If we only found 0s, return null to force re-enrichment ONLY if the field was likely a stub
        // But for now, returning 0 is safer than null if we genuinely think it's 0. 
        // Logic: specific fields (followersCount) = 0 is likely real. Generic (followers) = 0 might be stub.
        return firstZero;
    }
}
