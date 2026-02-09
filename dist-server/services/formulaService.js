export const FormulaService = {
    /**
     * Normalizes disparate scraper outputs into a common format for formula calculation.
     */
    normalizeData: (actorId, item) => {
        // Default structure
        const normalized = {
            id: item.id || item.shortCode || Math.random().toString(36).substr(2, 9),
            source: 'unknown',
            author: 'unknown',
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            url: '',
            username: item.username || undefined, // Default fallback
        };
        // --- INSTAGRAM MAPPINGS ---
        // [FIX] Support TheNetaji Followers/Following Scraper
        if (actorId.includes('followers') || actorId.includes('following') || actorId.includes('thenetaji')) {
            normalized.source = 'instagram';
            // Handle both flat and nested 'user' object structures
            const userObj = item.user || item;
            normalized.author = userObj.username || item.username || 'unknown';
            normalized.username = normalized.author; // [FIX] Explicitly set username
            normalized.text = userObj.full_name || item.full_name || ''; // Use Full Name as text proxy? Or Bio?
            normalized.url = `https://instagram.com/${normalized.author}`;
            // If it has a 'user' object, it might have extra fields
            if (item.user) {
                normalized.likes = item.user.follower_count || 0; // Followers as weight
            }
        }
        else if (actorId.includes('instagram-scraper') || actorId.includes('instagram-api-scraper')) {
            normalized.source = 'instagram';
            normalized.author = item.ownerUsername || item.username || 'unknown';
            normalized.username = normalized.author; // [FIX]
            normalized.text = item.caption || item.text || '';
            normalized.likes = item.likesCount || item.likeCount || 0;
            normalized.comments = item.commentsCount || item.commentCount || 0;
            normalized.views = item.videoViewCount || item.viewCount || 0;
            normalized.url = item.url || `https://instagram.com/p/${item.shortCode}`;
            if (item.timestamp)
                normalized.timestamp = item.timestamp;
        }
        else if (actorId.includes('instagram-comment-scraper')) {
            normalized.source = 'instagram';
            normalized.author = item.ownerUsername;
            normalized.username = item.ownerUsername; // [FIX]
            normalized.text = item.text;
            normalized.likes = item.likesCount || 0;
            normalized.url = item.ownerProfilePicUrl; // Fallback or metadata
        }
        else if (actorId.includes('profile-scraper')) {
            normalized.source = 'instagram';
            normalized.author = item.username || item.fullName || 'unknown';
            normalized.username = item.username; // [FIX]
            normalized.text = item.biography || '';
            // Map followers to likes as a "weight" proxy if needed, or keep 0
            normalized.likes = item.followersCount || 0;
            normalized.url = `https://instagram.com/${item.username}`;
        }
        // --- TIKTOK MAPPINGS ---
        else if (actorId.includes('tiktok')) {
            normalized.source = 'tiktok';
            // Clockworks often uses 'authorMeta' or 'user' object
            const authorObj = item.authorMeta || item.user || {};
            normalized.author = authorObj.name || authorObj.nickname || item.author || 'unknown';
            normalized.username = authorObj.name || authorObj.uniqueId || item.author; // [FIX]
            normalized.text = item.text || item.desc || '';
            // Metric mapping
            normalized.likes = item.diggCount || item.likes || 0;
            normalized.comments = item.commentCount || item.comments || 0;
            normalized.shares = item.shareCount || item.shares || 0;
            normalized.views = item.playCount || item.views || 0;
            normalized.url = item.webVideoUrl || item.videoUrl || '';
        }
        return normalized;
    },
    /**
     * Executes a mathematical formula on a single data point.
     */
    calculate: (formula, data) => {
        const { likes, comments, shares, views } = data;
        const totalInteractions = likes + comments + shares;
        switch (formula) {
            case 'engagement_absolute':
                return totalInteractions;
            case 'engagement_rate_views':
                return views > 0 ? (totalInteractions / views) * 100 : 0;
            case 'virality_score':
                // High shares relative to likes indicates virality
                return likes > 0 ? (shares / likes) * 100 : 0;
            case 'comment_ratio':
                return likes > 0 ? (comments / likes) * 100 : 0;
            default:
                return 0;
        }
    },
    /**
     * Calculates aggregate metrics across an entire dataset.
     */
    calculateAggregate: (formula, dataset) => {
        if (!dataset || dataset.length === 0)
            return 0;
        const sum = (field) => dataset.reduce((acc, curr) => acc + (Number(curr[field]) || 0), 0);
        const avg = (field) => sum(field) / dataset.length;
        switch (formula) {
            case 'avg_likes':
                return avg('likes');
            case 'avg_engagement_absolute':
                return (sum('likes') + sum('comments') + sum('shares')) / dataset.length;
            case 'total_reach_proxy':
                return sum('views');
            case 'share_of_voice_estimated':
                // Placeholder: simplistic count within this dataset (assuming dataset represents "market")
                // In reality, this needs a benchmark dataset. 
                // Returning count for now as a "volume" metric.
                return dataset.length;
            case 'sentiment_proxy':
                // Calculation: Comment/Like ratio as a proxy for "Discussion Intensity"
                // High discussion can be controversial (negative) or hype (positive).
                const totalLikes = sum('likes');
                return totalLikes > 0 ? (sum('comments') / totalLikes) * 100 : 0;
            default:
                return 0;
        }
    },
    /**
     * Compare two datasets (Benchmark vs Target)
     * Returns % difference
     */
    compare: (metric, target, benchmark) => {
        const valA = FormulaService.calculateAggregate(metric, target);
        const valB = FormulaService.calculateAggregate(metric, benchmark);
        if (valB === 0)
            return 0;
        return ((valA - valB) / valB) * 100; // Growth Rate
    }
};
