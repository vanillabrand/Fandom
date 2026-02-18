export interface StandardizedProfile {
    // Core Identifiers
    id: string; // Unified string ID
    username: string;
    fullName: string | null;

    // Profile Details
    biography: string | null;
    bio?: string | null; // Alias
    description?: string; // Alias for biography
    profilePicUrl: string | null;
    externalUrl: string | null;
    url?: string; // Alias for externalUrl

    // Metrics
    followersCount: number | null;
    followerCount?: number | null; // Alias
    followers_count?: number | null; // Alias
    followsCount: number | null;
    followingCount?: number | null; // Alias
    following_count?: number | null; // Alias
    postsCount: number | null; // Total posts count
    mediaCount?: number | null; // Alias for postsCount
    postCount?: number | null; // Alias
    posts_count?: number | null; // Alias

    // Metadata
    isPrivate: boolean | null;
    isVerified: boolean | null;
    isBusinessAccount: boolean | null;
    engagementRate: number | string | null;    // Calculated engagement rate (can be "1.2%" string)
    avgLikes?: number | null;
    avgComments?: number | null;

    // Content
    latestPosts: Array<{
        id: string;
        caption: string;
        url: string; // Permalink
        displayUrl: string; // Image/Video Source
        videoUrl?: string;
        videoViewCount?: number;
        timestamp: Date | string;
        likesCount: number;
        commentsCount: number;
        type: 'Image' | 'Video' | 'Sidecar';
        children?: Array<{
            id: string;
            type: 'Image' | 'Video';
            url: string;
            displayUrl: string;
            videoUrl?: string; // If child is video
        }>;
    }>;

    // Discovery
    query?: string;
    source?: string;
    evidence?: string;
    relatedProfiles?: Array<{
        id: string;
        username: string;
        full_name?: string;
        is_verified?: boolean;
        profile_pic_url?: string;
    }>; // [NEW] Related profiles for graph connectivity
}

export interface AnalysisResult {
    summary: string;
    analytics: {
        creators: any[];
        brands: any[];
        clusters: any[];
        topics: any[];
        subtopics?: any[]; // [FIX] Add subtopics
        overindexing?: any[]; // [FIX] Add overindexing
        nonRelatedInterests: any[];
        topContent: any[];
        aestheticTags: any;
        vibeDescription: any;
        colorPalette: any;
        visualAnalysis?: any; // [FIX] Add visualAnalysis typings
        visualTheme?: any; // [FIX] Add visualTheme typings
    };
    minerAudit?: {
        passed: boolean;
        issues: string[];
        suggestions: string[];
        timestamp: Date;
    };
}
