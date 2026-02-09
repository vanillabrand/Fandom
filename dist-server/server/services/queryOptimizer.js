/**
 * Query Optimizer Service
 * Handles deterministic query parsing and intent detection using algorithmic logic.
 * This reduces reliance on AI for simple, pattern-based queries.
 */
export class QueryOptimizer {
    /**
     * Main entry point for query optimization
     */
    static optimize(query) {
        const cleanQuery = query.toLowerCase().trim();
        const targetProfile = this.extractHandle(query);
        const platform = query.toLowerCase().includes('tiktok') ? 'tiktok' : 'instagram';
        // 1. Check for Over-indexing / Brand Affinity patterns
        if (this.isOverindexing(cleanQuery)) {
            return {
                intent: 'over_indexing',
                targetProfile,
                platform,
                focusCategory: this.extractFocusCategory(cleanQuery),
                confidence: 1.0,
                searchKeywords: targetProfile ? [targetProfile] : [],
                isDeterministic: true
            };
        }
        // 2. Check for Audience Overlap
        if (this.isAudienceOverlap(cleanQuery)) {
            const handles = this.extractHandles(query);
            return {
                intent: 'audience_overlap',
                targetProfile: handles.length > 0 ? handles[0] : null,
                platform,
                focusCategory: null,
                confidence: 0.95,
                searchKeywords: handles,
                isDeterministic: true
            };
        }
        // 3. Check for Comparison
        if (this.isComparison(cleanQuery)) {
            const handles = this.extractHandles(query);
            if (handles.length >= 2) {
                return {
                    // Map comparison queries to audience_overlap for now as it's the closest existing workflow
                    intent: 'audience_overlap',
                    targetProfile: handles[0],
                    platform,
                    focusCategory: null,
                    confidence: 0.9,
                    searchKeywords: handles,
                    isDeterministic: true
                };
            }
        }
        // 4. Check for Influencer Identification patterns
        if (this.isInfluencerSearch(cleanQuery)) {
            const category = this.extractFocusCategory(cleanQuery);
            return {
                intent: 'influencer_identification',
                targetProfile,
                platform,
                focusCategory: category,
                confidence: 0.9,
                searchKeywords: category ? [category] : [],
                isDeterministic: true
            };
        }
        // 5. Check for Competitor Content
        if (this.isCompetitorContent(cleanQuery)) {
            return {
                intent: 'competitor_content_analysis',
                targetProfile,
                platform,
                focusCategory: null,
                confidence: 0.95,
                searchKeywords: targetProfile ? [targetProfile] : [],
                isDeterministic: true
            };
        }
        // 6. Check for Hashtag Tracking
        if (this.isHashtagTracking(cleanQuery)) {
            // Extract hashtag
            const hashtagMatch = cleanQuery.match(/#([a-z0-9_]+)/);
            const hashtag = hashtagMatch ? hashtagMatch[1] : null;
            return {
                intent: 'hashtag_tracking', // Need to add to Intent type!
                targetProfile: null,
                platform,
                focusCategory: null,
                confidence: 0.95,
                searchKeywords: hashtag ? [hashtag] : [],
                isDeterministic: true
            };
        }
        // 7. Check for Geo Discovery patterns
        const location = this.extractLocation(cleanQuery);
        if (location) {
            return {
                intent: 'geo_discovery',
                targetProfile,
                platform,
                focusCategory: location,
                confidence: 0.8,
                searchKeywords: [location],
                isDeterministic: true
            };
        }
        // Default to general map (let AI decide if this isn't high confidence)
        return {
            intent: 'general_map',
            targetProfile,
            platform,
            focusCategory: null,
            confidence: 0.1,
            searchKeywords: [],
            isDeterministic: false
        };
    }
    /**
     * Extracts Instagram/TikTok handle from query
     */
    static extractHandle(query) {
        const handleRegex = /@([a-zA-Z0-9_.]+)/;
        const urlRegex = /instagram\.com\/([a-zA-Z0-9_.]+)/;
        const handleMatch = query.match(handleRegex);
        if (handleMatch)
            return handleMatch[1];
        const urlMatch = query.match(urlRegex);
        if (urlMatch)
            return urlMatch[1];
        // [FIX] Try to extract username without @ symbol
        // Pattern: "rustlersuk followers", "followers of rustlersuk", etc.
        const usernamePattern = /\b([a-z0-9_]{3,30})\s+(followers?|followings?)/i;
        const usernameMatch = query.match(usernamePattern);
        if (usernameMatch)
            return usernameMatch[1];
        return null;
    }
    /**
     * New: Extracts all handles for multi-route queries
     */
    static extractHandles(query) {
        const handleRegex = /@([a-zA-Z0-9_.]+)/g;
        const matches = [];
        let match;
        while ((match = handleRegex.exec(query)) !== null) {
            matches.push(match[1]);
        }
        return matches;
    }
    /**
     * Determines if query is about over-indexing
     */
    static isOverindexing(query) {
        const keywords = [
            'over-indexed', 'over indexed', 'overindexed', 'affinity',
            'who do they follow', 'accounts popular among',
            'map the subcultures', 'followers of', 'talking about',
            'audience map', 'community map'
        ];
        return keywords.some(k => query.includes(k)) || (query.includes('what other') && query.includes('follow'));
    }
    /**
     * Determines if query is about finding influencers
     */
    static isInfluencerSearch(query) {
        const keywords = ['find', 'show me', 'who are the', 'influencers', 'creators', 'rising stars'];
        return (keywords.some(k => query.includes(k)) && !this.isOverindexing(query)) || query.includes('niche');
    }
    /**
     * Determines if query is a comparison
     */
    static isComparison(query) {
        const keywords = [' vs ', ' versus ', ' compare ', ' difference between ', ' or '];
        return keywords.some(k => query.includes(k));
    }
    /**
     * Determines if query is about audience overlap
     */
    static isAudienceOverlap(query) {
        const keywords = ['overlap', 'intersection', 'common followers', 'shared audience', 'same fans'];
        return keywords.some(k => query.includes(k));
    }
    /**
     * Determines if query is competitor content analysis
     */
    static isCompetitorContent(query) {
        const keywords = ['content performs', 'best content', 'top posts from', 'most engaging'];
        return keywords.some(k => query.includes(k));
    }
    /**
     * Determines if query is hashtag tracking
     */
    static isHashtagTracking(query) {
        const keywords = ['track #', 'analyze #', 'hashtag performance', 'monitor hashtag'];
        return keywords.some(k => query.includes(k));
    }
    /**
     * Extracts "focus category" (e.g. "drinks" from "What other drinks do fans of @nike follow?")
     */
    static extractFocusCategory(query) {
        // Pattern: "what other [CATEGORY]..."
        const whatOtherMatch = query.match(/what other ([a-z0-9\s]+?) (do|are|is|fans)/i);
        if (whatOtherMatch)
            return whatOtherMatch[1].trim();
        // Pattern: "find [CATEGORY] influencers"
        const findMatch = query.match(/find ([a-z0-9\s]+?) (influencers|creators|stars)/i);
        if (findMatch)
            return findMatch[1].trim();
        return null;
    }
    /**
     * Extracts location names
     */
    static extractLocation(query) {
        const commonLocations = ['london', 'nyc', 'paris', 'tokyo', 'berlin', 'osaka', 'manchester', 'birmingham'];
        return commonLocations.find(loc => query.includes(loc)) || null;
    }
}
