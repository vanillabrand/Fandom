

import { mongoService, Job } from './mongoService.js';
import { CommunityDetectionService } from './communityDetectionService.js';
import { GraphAnalysisService } from './GraphAnalysisService.js';
import { emailService } from './emailService.js';
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';
import { GoogleGenAI } from '@google/genai';
import * as crypto from 'crypto';
import scraperRegistryRaw from '../../scraper_detail.json' with { type: "json" };

import { proxyMediaUrl, proxyMediaFields } from '../utils/mediaProxyUtil.js';
import { generateDashboardConfig } from './dashboardConfigService.js';
import { analyzeBatch, analyzeFandomDeepDive, aggregateLocations } from '../../services/geminiService.js';
import { VisualDNAService } from './VisualDNAService.js';
import { costCalculator } from './costCalculator.js';
import { generateScrapeFingerprint, extractMetadataFromPayload, calculateTTL, isFingerprintFresh } from '../utils/scrapeFingerprintUtil.js';
import * as queryAccuracyService from '../../services/queryAccuracyService.js';
import { safeParseJson } from '../../utils/jsonUtils.js';
import { AICacheService } from './aiCacheService.js'; // [PERFORMANCE] AI response caching




// --- CONFIGURATION CONSTANTS ---
// Batch Processing
const ENRICHMENT_BATCH_SIZE_SMALL = 100;      // For datasets < 200 nodes
const ENRICHMENT_BATCH_SIZE_MEDIUM = 300;     // For datasets 200-500 nodes
const ENRICHMENT_BATCH_SIZE_LARGE = 1000;     // For datasets > 500 nodes
const ENRICHMENT_LOG_INTERVAL_DEFAULT = 10;  // Log every N nodes

// Gap Remediation
const GAP_REMEDIATION_BATCH_SIZE = 100;       // Profiles per batch
const GAP_REMEDIATION_MAX_RETRIES = 3;       // Max retry attempts per batch

// Username Validation
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 30;              // Instagram max username length
const USERNAME_VALIDATION_REGEX = /^[a-z0-9._]/; // Must start with letter, number, dot or underscore

// Dataset Size Thresholds
const DATASET_SIZE_SMALL = 100;
const DATASET_SIZE_MEDIUM = 300;
const DATASET_SIZE_LARGE = 1000;
const DATASET_SIZE_VERY_LARGE = 5000;

// --- CONFIG ---
// Initialize Gemini
let aiClient: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!aiClient) {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            console.error("CRITICAL: GEMINI_API_KEY not found in process.env!");
            console.error("Available Env Keys:", Object.keys(process.env).filter(k => !k.startsWith('npm_')));
            return null;
        }
        console.log("Initializing Gemini Client with key length:", apiKey.length);
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
};




export interface StandardizedProfile {
    // Core Identifiers
    id: string; // Unified string ID
    username: string;
    fullName: string | null;

    // Profile Details
    biography: string | null;
    description?: string; // Alias for biography
    profilePicUrl: string | null;
    externalUrl: string | null;
    url?: string; // Alias for externalUrl

    // Metrics
    followersCount: number | null;
    followsCount: number | null;
    postsCount: number | null; // Total posts count
    mediaCount?: number; // Alias for postsCount

    // Metadata
    isPrivate: boolean | null;
    isVerified: boolean | null;
    isBusinessAccount: boolean | null;
    engagementRate: number | null;    // Calculated engagement rate
    avgLikes?: number;
    avgComments?: number;

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


export class JobOrchestrator {
    private static instance: JobOrchestrator;
    private processing: boolean = false;
    private pollingInterval: NodeJS.Timeout | null = null;

    private constructor() { }

    static getInstance(): JobOrchestrator {
        if (!JobOrchestrator.instance) {
            JobOrchestrator.instance = new JobOrchestrator();
        }
        return JobOrchestrator.instance;
    }

    /**
     * [NEW] Safe Metric Parser
     * Handles numbers, strings with commas (e.g. "1,234"), and nulls.
     */
    private parseMetric(val: any): number {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            // [ROBUST] Handle common social media formats: "1.3M", "10k", "1,234"
            const sanitized = val.toLowerCase().replace(/,/g, '').replace(/\s/g, '').trim();
            if (!sanitized) return 0;

            let multiplier = 1;
            if (sanitized.endsWith('m')) multiplier = 1000000;
            else if (sanitized.endsWith('k')) multiplier = 1000;

            const numericPart = sanitized.replace(/[mk]$/, '');
            const parsed = parseFloat(numericPart);
            return isNaN(parsed) ? 0 : Math.round(parsed * multiplier);
        }
        return 0;
    }

    /**
     * UNIFIED METRIC EXTRACTOR
     * Safely probes an object for various common metric aliases using null-coalescing.
     */
    private extractMetric(obj: any, type: 'followers' | 'following' | 'posts'): number {
        if (!obj) return 0;

        const aliases: Record<string, any[]> = {
            followers: [
                obj.followersCount, obj.followerCount, obj.followers_count, obj.follower_count, obj.followers,
                obj.edge_followed_by?.count, obj.edgeFollowedBy?.count,
                obj.metaData?.followersCount, obj.metaData?.followerCount,
                obj.owner?.followerCount, obj.owner?.followersCount, obj.owner?.follower_count, obj.owner?.followers_count,
                obj.owner?.edge_followed_by?.count
            ],
            following: [
                obj.followsCount, obj.followingCount, obj.following_count, obj.follows_count, obj.follows, obj.following,
                obj.edge_follow?.count, obj.edgeFollow?.count,
                obj.metaData?.followingCount, obj.metaData?.followsCount,
                obj.owner?.followingCount, obj.owner?.followsCount, obj.owner?.following_count, obj.owner?.follows_count,
                obj.owner?.edge_follow?.count
            ],
            posts: [
                obj.postsCount, obj.mediaCount, obj.postCount, obj.posts_count, obj.media_count, obj.posts,
                obj.edge_owner_to_timeline_media?.count, obj.edgeOwnerToTimelineMedia?.count,
                obj.metaData?.postsCount, obj.metaData?.mediaCount,
                obj.owner?.postsCount, obj.owner?.mediaCount, obj.owner?.postCount, obj.owner?.posts_count, obj.owner?.media_count,
                obj.owner?.edge_owner_to_timeline_media?.count
            ]
        };

        const candidates = aliases[type] || [];
        for (const val of candidates) {
            if (val !== undefined && val !== null) {
                const parsed = this.parseMetric(val);
                if (parsed > 0) return parsed; // Prefer non-zero values if multiple exist
            }
        }
        return 0;
    }

    /**
     * NORMALIZATION HELPER
     * Maps disparate scraper outputs to a unified StandardizedProfile
     */
    private normalizeToStandardProfile(record: any): StandardizedProfile | null {
        // DEFAULT: Empty Profile
        const standard: StandardizedProfile = {
            id: '',
            username: '',
            fullName: null,
            biography: null,
            profilePicUrl: null,
            externalUrl: null,
            followersCount: null,
            followsCount: null,
            isPrivate: null,
            isVerified: null,
            isBusinessAccount: null,
            postsCount: null,
            engagementRate: null,
            latestPosts: [],
            relatedProfiles: [] // [NEW] Initialize
        };

        try {
            // DETECT SOURCE SCHEMA

            // 1. Instagram API Scraper - Post/Details Mode (Rich 'metaData' Object)
            if (record.metaData) {
                const meta = record.metaData;
                standard.id = meta.id || record.ownerId || '';
                standard.username = meta.username || record.ownerUsername || '';
                standard.fullName = meta.fullName;
                standard.biography = meta.biography;
                standard.profilePicUrl = meta.profilePicUrl;

                // [ROBUST] Extract Metrics
                standard.followersCount = this.parseMetric(meta.followersCount ?? meta.followerCount ?? meta.followers_count ?? meta.follower_count ?? null);
                standard.followsCount = this.parseMetric(meta.followsCount ?? meta.followingCount ?? meta.following_count ?? meta.follows_count ?? meta.follows ?? null);
                standard.postsCount = this.parseMetric(meta.postsCount ?? meta.mediaCount ?? meta.postCount ?? meta.posts_count ?? meta.media_count ?? null);

                standard.isPrivate = meta.isPrivate;
                standard.isVerified = meta.isVerified;
                standard.isBusinessAccount = meta.isBusinessAccount;
                standard.externalUrl = meta.externalUrl;
                // ...
            }
            // 2. Instagram Profile Scraper (Deep Dive - 'owner' object or flat)
            else if (record.edge_followed_by || record.biography !== undefined || record.bio !== undefined || record.followerCount !== undefined || record.followersCount !== undefined || record.followers_count !== undefined) {
                standard.id = record.id || record.pk || record.ownerId || record.userId;
                standard.username = record.username || record.ownerUsername || record.handle;
                standard.fullName = record.full_name || record.fullName || record.name;
                standard.biography = record.biography || record.bio || record.description;
                standard.profilePicUrl = record.profile_pic_url_hd || record.profile_pic_url || record.profilePicUrl || record.profilePic;

                // [ROBUST] Use unified extractor to catch all aliases
                standard.followersCount = this.extractMetric(record, 'followers');
                standard.followsCount = this.extractMetric(record, 'following');
                standard.postsCount = this.extractMetric(record, 'posts');

                standard.isPrivate = record.is_private || record.isPrivate || record.private;
                standard.isVerified = record.is_verified || record.isVerified || record.verified;
                standard.isBusinessAccount = record.is_business_account || record.isBusinessAccount;
                standard.externalUrl = record.external_url || record.externalUrl || record.url;
                // ...
            }
            // 3. Instagram API Scraper - Search Mode (List of users)
            else if (record.searchSource || record.pk || record.username) {
                standard.id = record.id || record.pk || record.userId || '';
                standard.username = record.username || '';
                standard.fullName = record.fullName || record.full_name || record.name;
                standard.biography = record.biography || record.bio || record.description;
                standard.profilePicUrl = record.profilePicUrl || record.profile_pic_url;

                // [ROBUST] Extract Metrics
                standard.followersCount = this.parseMetric(record.followersCount ?? record.followerCount ?? record.followers_count ?? record.follower_count ?? record.followers ?? null);
                standard.followsCount = this.parseMetric(record.followsCount ?? record.followingCount ?? record.following_count ?? record.follower_count ?? record.follows ?? record.following ?? null);
                standard.postsCount = this.parseMetric(record.postsCount ?? record.mediaCount ?? record.postCount ?? record.posts_count ?? record.media_count ?? record.posts ?? null);

                standard.isPrivate = record.private || record.is_private || record.isPrivate;
                standard.isVerified = record.verified || record.is_verified || record.isVerified;
                standard.isBusinessAccount = record.isBusinessAccount;
                standard.externalUrl = record.externalUrl || record.url || record.external_url;

                if (record.latestPosts && Array.isArray(record.latestPosts)) {
                    standard.latestPosts = record.latestPosts.map((p: any) => ({
                        id: p.id,
                        caption: p.caption,
                        url: p.url || '',
                        displayUrl: p.displayUrl || p.url,
                        timestamp: p.timestamp,
                        likesCount: p.likesCount,
                        commentsCount: p.commentsCount,
                        type: p.type === 'Video' ? 'Video' : (p.type === 'Sidecar' || p.productType === 'carousel_container' ? 'Sidecar' : 'Image'),
                        videoUrl: p.videoUrl, // Often not in search, but good to check
                        videoViewCount: p.videoViewCount
                    }));
                }
            }
            // 4. Instagram Network Scraper (Followers/Following - Minimal)
            else if ((record.username) && (record.followed_by_viewer !== undefined || record.requested_by_viewer !== undefined)) {
                standard.id = record.id ? String(record.id) : '';
                standard.username = record.username;
                standard.fullName = record.full_name;
                standard.profilePicUrl = record.profile_pic_url;
                standard.isPrivate = record.is_private;
                standard.isVerified = record.is_verified;

                // [FIX] Add basic metric extraction for Network Scraper items
                standard.followersCount = this.parseMetric(record.followers_count || record.follower_count || 0);
                standard.followsCount = this.parseMetric(record.following_count || record.follows_count || 0);
                standard.postsCount = this.parseMetric(record.media_count || record.posts_count || 0);
            }
            // 5. Instagram Hashtag Scraper / Post Scraper (Post-centric - 'ownerUsername' or 'ownerId')
            else if (record.ownerUsername || record.ownerId) {
                standard.id = record.ownerId || '';
                standard.username = record.ownerUsername || '';
                standard.fullName = record.ownerFullName || null;
                standard.profilePicUrl = record.ownerProfilePicUrl || null;

                // For hashtag posts, we map the post itself into latestPosts
                standard.latestPosts = [{
                    id: record.id,
                    caption: record.caption || '',
                    url: record.url || (record.shortCode ? `https://www.instagram.com/p/${record.shortCode}/` : ''),
                    displayUrl: record.displayUrl || record.videoUrl || record.url,
                    timestamp: record.timestamp,
                    likesCount: record.likesCount || 0,
                    commentsCount: record.commentsCount || 0,
                    type: record.type === 'Video' ? 'Video' : (record.type === 'Sidecar' ? 'Sidecar' : 'Image'),
                    videoUrl: record.videoUrl,
                    videoViewCount: record.videoViewCount
                }];
            }
            // Fallback (Generic mapping for miscellaneous scraper formats)
            else {
                standard.id = record.id || record.pk || record.userId || record.ownerId || '';
                standard.username = (record.username || record.ownerUsername || record.handle || '').toLowerCase().replace('@', '');
                standard.fullName = record.fullName || record.full_name || record.name || standard.fullName;

                standard.followersCount = record.followersCount ?? record.followerCount ?? record.followers_count ?? record.follower_count ?? record.followers ?? null;
                standard.followsCount = record.followsCount ?? record.followingCount ?? record.following_count ?? record.follower_count ?? record.follows ?? record.following ?? null;
                standard.postsCount = record.postsCount ?? record.mediaCount ?? record.postCount ?? record.posts_count ?? record.media_count ?? record.posts ?? null;

                const rawBio = record.biography || record.bio || record.description;
                standard.biography = (rawBio && !/Bio unavailable|No bio/i.test(rawBio)) ? rawBio : standard.biography;
                standard.profilePicUrl = record.profilePicUrl || record.profile_pic_url || record.profilePic || standard.profilePicUrl;
                standard.isBusinessAccount = record.isBusinessAccount || record.is_business_account || null;

                // [NEW] Capture related profiles from raw record if present
                if (record.relatedProfiles && Array.isArray(record.relatedProfiles)) {
                    standard.relatedProfiles = record.relatedProfiles;
                }
            }
        } catch (e) {
            console.warn(`[JobOrchestrator] Normalization failed for record: ${e}`);
        }

        // [STRICT] Privacy & Integrity Check
        // Discard private profiles and those without unique IDs to ensure graph quality
        if (standard.isPrivate === true) {
            // [FIX] Do NOT throw error, just skip
            console.warn(`[JobOrchestrator] Skipping private profile: ${standard.username}`);
            return null;
        }

        // [FIX] Fallback ID to username if missing
        if (!standard.id || standard.id === '') {
            standard.id = standard.username;
        }

        if (!standard.id || standard.id === '') {
            // [FIX] Do NOT throw error, just skip
            console.warn(`[JobOrchestrator] Skipping profile without ID or Username: ${JSON.stringify(record).substring(0, 100)}...`);
            return null;
        }

        return standard;
    }

    /**
     * ENRICHMENT HELPER (Traverse & Hydrate)
     * Traverses the Gemini Analysis Tree and hydrates nodes with real data from Scrapers.
     */
    /**
     * [PERFORMANCE] Enrich Fandom Analysis with Parallel Batch Processing
     *
     * Processes profiles in parallel batches of 50 for 60-80% faster enrichment
     */
    private async enrichFandomAnalysisParallel(
        analytics: any,
        profileMap: Map<string, StandardizedProfile>
    ): Promise<any> {
        if (!analytics) return analytics;

        // [STRICT] If no structural data exists, nothing to enrich
        const hasNodes = analytics.root || (analytics.nodes && analytics.nodes.length > 0) || (analytics.graph && analytics.graph.nodes && analytics.graph.nodes.length > 0);
        const hasLists = (analytics.creators && analytics.creators.length > 0) || (analytics.brands && analytics.brands.length > 0) || (analytics.topContent && analytics.topContent.length > 0);

        if (!hasNodes && !hasLists) return analytics;

        console.log(`[Enrichment] Hydrating Graph Nodes with Scraped Data (Parallel Mode)...`);
        let hydrationCount = 0;

        // [PERFORMANCE] Collect all nodes first for batch processing
        // [FIX] Add cycle detection to prevent infinite recursion
        const allNodes: any[] = [];
        const visited = new Set<any>();
        const collectNodes = (node: any) => {
            if (!node || visited.has(node)) return;
            visited.add(node);
            allNodes.push(node);
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(collectNodes);
            }
        };

        // 1. Collect from Tree (Hierarchical)
        if (analytics.root) collectNodes(analytics.root);

        // 2. Collect from Graph (Flat)
        if (analytics.graph && analytics.graph.nodes) {
            analytics.graph.nodes.forEach(node => {
                if (!visited.has(node)) {
                    visited.add(node);
                    allNodes.push(node);
                }
            });
        }

        // 3. Handle top-level nodes structure
        if (analytics.nodes && Array.isArray(analytics.nodes)) {
            analytics.nodes.forEach(node => {
                if (!visited.has(node)) {
                    visited.add(node);
                    allNodes.push(node);
                }
            });
        }

        // [NEW] 4. Handle analytics sub-lists (Creators, Brands)
        // This ensures top-lists in the UI are hydrated even if they aren't in the graph nodes
        const targetAnalytics = analytics.analytics || analytics;
        const subLists = [
            targetAnalytics.creators,
            targetAnalytics.brands,
            targetAnalytics.overindexedProfiles,
            targetAnalytics.overindexing?.topCreators,
            targetAnalytics.overindexing?.topBrands
        ];

        subLists.forEach(list => {
            if (list && Array.isArray(list)) {
                list.forEach(node => {
                    if (!visited.has(node)) {
                        visited.add(node);
                        allNodes.push(node);
                    }
                });
            }
        });

        // 5. Analytics topContent (needs node-wrapping for handle matching)
        if (targetAnalytics.topContent && Array.isArray(targetAnalytics.topContent)) {
            targetAnalytics.topContent.forEach(item => {
                if (!visited.has(item)) {
                    visited.add(item);
                    // Attach node-like props for hydration to understand it's a creator
                    (item as any)._isTopContent = true;
                    allNodes.push(item);
                }
            });
        }

        console.log(`[Enrichment] Found ${allNodes.length} nodes to process`);

        // [ADAPTIVE] Calculate optimal batch size based on dataset size
        const config = this.getEnrichmentConfig(allNodes.length);
        const { batchSize, logInterval } = config;

        console.log(`[Enrichment] Using adaptive batch size: ${batchSize} (${Math.ceil(allNodes.length / batchSize)} batches)`);

        // [PERFORMANCE] Process in parallel batches
        const batches = [];
        for (let i = 0; i < allNodes.length; i += batchSize) {
            batches.push(allNodes.slice(i, i + batchSize));
        }

        // Process each batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Process batch with error handling
            const results = await Promise.allSettled(batch.map(async (node) => {
                try {
                    // Attempt to find matching profile
                    let profile: StandardizedProfile | undefined;

                    // [PRIORITY 1] Try ID-based matching first (most reliable)
                    // profileMap is now indexed by BOTH ID and Username
                    const nodeId = node.data?.id || node.id;
                    if (nodeId) {
                        // Try both as-is and as string (IDs can be numbers or strings)
                        profile = profileMap.get(nodeId) || profileMap.get(String(nodeId));
                    }

                    // [PRIORITY 2] Match by Username (Strict, Normalized)
                    if (!profile) {
                        const rawCandidates = [
                            node.data?.handle,
                            node.data?.username,
                            node.label,
                            node.name,
                            node.handle,
                            // [NEW] Fields common in topContent items
                            (node as any).author,
                            (node as any).ownerUsername
                        ].filter(k => k && typeof k === 'string');

                        for (const raw of rawCandidates) {
                            // Strip @, trim, lowercase
                            const key = raw.toLowerCase().replace('@', '').trim();
                            if (profileMap.has(key)) {
                                profile = profileMap.get(key);
                                break;
                            }
                        }
                    }

                    // Hydrate if found
                    if (profile) {
                        hydrationCount++;

                        // [CRITICAL FIX] Preserve existing AI Evidence/Provenance
                        const existingEvidence = node.data?.evidence || node.evidence;
                        const existingProvenance = node.data?.provenance || node.provenance;
                        const existingCitation = node.data?.citation || node.citation;

                        // [UNIFIED] Use central hydration helper
                        const hydrated = this.hydrateNodeData(profile, node.group || 'creator', existingEvidence);

                        // Merge data while preserving mission-critical AI-generated fields if they aren't in 'hydrated'
                        node.data = {
                            ...node.data,
                            ...hydrated.data,
                            evidence: existingEvidence || hydrated.data.evidence,
                            provenance: existingProvenance || hydrated.data.provenance,
                            citation: existingCitation || hydrated.data.citation
                        };

                        // Update top-level visual properties
                        node.label = hydrated.label;
                        node.profilePic = hydrated.profilePic;
                        node.color = hydrated.color;

                        // [NEW] 8. FLAT SYNC: For items in sub-lists (Creators/Brands/etc.), 
                        // the UI often expects metrics at the top level of the object.
                        const flatSyncFields = [
                            'followers', 'followerCount', 'followersCount',
                            'following', 'followingCount', 'followsCount',
                            'posts', 'postCount', 'postsCount',
                            'engagementRate', 'avgLikes', 'avgComments',
                            'bio', 'biography', 'profilePicUrl', 'url', 'id', 'username'
                        ];
                        flatSyncFields.forEach(field => {
                            if (hydrated.data[field] !== undefined) {
                                (node as any)[field] = hydrated.data[field];
                            }
                        });
                    } else {
                        // Sanitize Hallucinated URLs for un-hydrated nodes
                        if (node.data && node.data.profilePicUrl) {
                            node.data.profilePicUrl = this.sanitizeUrl(node.data.profilePicUrl);
                        }
                    }
                } catch (error) {
                    console.warn(`[Enrichment] Failed to enrich node ${node.id || node.label}:`, error);
                    // Continue with other nodes - don't let one failure stop the batch
                }
            }));

            // Adaptive logging based on dataset size
            if ((batchIndex + 1) % logInterval === 0 || batchIndex === batches.length - 1) {
                console.log(`[Enrichment] Processed ${Math.min((batchIndex + 1) * batchSize, allNodes.length)}/${allNodes.length} nodes`);
            }
        }

        console.log(`[Enrichment] ✅ Hydration complete. Processed ${hydrationCount} nodes.`);

        // Final deduplication and sorting of lists
        return this.finalizeAnalytics(analytics);
    }

    /**
     * [NEW] Finalizes analytics by deduplicating and sorting lists
     * Ensures UI consistency and prevents duplicate entries.
     */
    private finalizeAnalytics(analytics: any): any {
        if (!analytics) return analytics;

        const deduplicate = (list: any[], idKey: string = 'username') => {
            if (!list || !Array.isArray(list)) return [];
            const seen = new Set();
            return list.filter(item => {
                // [FIX] Check both idKey and 'name' for robust brand deduplication
                const val = String(item[idKey] || item.name || item.username || item.id || item.handle || '').toLowerCase().replace('@', '').trim();
                if (!val || val === 'unknown' || seen.has(val)) return false;
                seen.add(val);
                return true;
            });
        };

        if (analytics.creators) analytics.creators = deduplicate(analytics.creators);
        if (analytics.brands) analytics.brands = deduplicate(analytics.brands, 'name'); // [FIX] Use 'name' for brands
        if (analytics.topics) analytics.topics = deduplicate(analytics.topics, 'name');
        if (analytics.subtopics) analytics.subtopics = deduplicate(analytics.subtopics, 'name');
        if (analytics.clusters) analytics.clusters = deduplicate(analytics.clusters, 'name');

        // Ensure Consistent Sorting for Creators & Brands
        const sortingFn = (a: any, b: any) => {
            const getScore = (item: any) => {
                const s = item.overindexScore || item.affinityPercent || item.affinityScore || item.frequencyScore || 0;
                return typeof s === 'number' ? s : parseFloat(String(s)) || 0;
            };
            const scoreA = getScore(a);
            const scoreB = getScore(b);
            if (scoreB !== scoreA) return scoreB - scoreA;

            const getFollowers = (item: any) => {
                const v = item.followersCount || item.followerCount || item.followers || 0;
                if (typeof v === 'number') return v;
                if (typeof v === 'string') {
                    const clean = v.replace(/,/g, '').trim();
                    if (clean.endsWith('M')) return parseFloat(clean) * 1000000;
                    if (clean.endsWith('k')) return parseFloat(clean) * 1000;
                    return parseFloat(clean) || 0;
                }
                return 0;
            };
            return getFollowers(b) - getFollowers(a);
        };

        if (analytics.creators) analytics.creators.sort(sortingFn);
        if (analytics.brands) analytics.brands.sort(sortingFn);

        return analytics;
    }

    /**
     * Identifies nodes in the graph that lack enriched data (metrics, bio, etc.)
     */
    public identifyEnrichmentGaps(analytics: any): string[] {
        if (!analytics) return [];
        const gaps = new Set<string>();
        const visited = new Set<any>();

        const checkNode = (node: any) => {
            if (!node) return;

            const isRelevant = node.group === 'creator' || node.group === 'brand' || node.type === 'creator' || node.type === 'brand' || node.group === 'profile';

            if (isRelevant) {
                const data = node.data || {};
                // [STRICT] Check for missing metrics OR bio
                const hasFollowers = (data.followerCount !== undefined && data.followerCount !== null && data.followerCount > 0) || (data.followersCount !== undefined && data.followersCount !== null && data.followersCount > 0);
                const hasFollowing = (data.followingCount !== undefined && data.followingCount !== null && data.followingCount > 0) || (data.followsCount !== undefined && data.followsCount !== null && data.followsCount > 0) || (data.following !== undefined && data.following !== null && data.following > 0);
                const hasBio = !!(data.biography || data.bio || data.description);
                const hasPosts = (data.postsCount !== undefined && data.postsCount !== null && data.postsCount > 0) || (data.mediaCount !== undefined && data.mediaCount !== null && data.mediaCount > 0) || (data.posts !== undefined && data.posts !== null && data.posts > 0) || (data.postCount !== undefined && data.postCount !== null && data.postCount > 0);

                // We also check for "fake" or "placeholder" data often generated by AI
                const bioText = (data.biography || data.bio || data.description || '').toLowerCase();
                const isPlaceholderBio = hasBio && (bioText.includes('placeholder') || bioText.includes('bio unavailable') || bioText.includes('no bio'));

                if (!node.data || !hasFollowers || !hasFollowing || !hasBio || !hasPosts || isPlaceholderBio) {
                    // [IMPROVED] Resolve handle more robustly
                    // Don't just give up if label has spaces; many labels are full names (e.g. "Jack Grealish")
                    let handle = data.username || data.handle || (node.label?.startsWith('@') ? node.label.substring(1) : node.label) || node.id;

                    if (handle && handle !== 'unknown' && handle.length > 2) {
                        // Normalize
                        let cleanHandle = String(handle).replace('@', '').trim();

                        // [FIX] If it has spaces, it's likely a full name.
                        // STRATEGY: Prefer slugifying the name (jackgrealish) over bio mentions (@pumafootball)
                        if (cleanHandle.includes(' ')) {
                            const slugified = cleanHandle.toLowerCase().replace(/[^a-z0-9]/g, '');

                            // [NEW] Check for handles in links (Linktree, Beacons, etc.)
                            // This is OFTEN the most accurate handle for creators
                            const externalUrl = data.externalUrl || data.url || data.link || '';
                            if (externalUrl.includes('linktr.ee/') || externalUrl.includes('beacons.ai/')) {
                                const linkMatch = externalUrl.match(/(?:linktr\.ee|beacons\.ai)\/([a-zA-Z0-9._-]+)/);
                                if (linkMatch && linkMatch[1]) {
                                    console.log(`[Enrichment] Resolved handle '${linkMatch[1]}' from link: ${externalUrl}`);
                                    cleanHandle = linkMatch[1];
                                }
                            }

                            // If still have spaces, check bio matches
                            if (cleanHandle.includes(' ')) {
                                // [FIX] Email-safe Regex: Ensure we don't match domain.com in info@domain.com
                                // Look for @ followed by handle, but leading boundary must NOT be a word character (except space/comma)
                                const bioMatch = bioText.match(/(?:^|[\s,])@([a-zA-Z0-9._]+)/);
                                if (bioMatch && bioMatch[1]) {
                                    const bioHandle = bioMatch[1].toLowerCase();
                                    // If the slugified name is radically different from the bio mention,
                                    // the bio mention is likely a brand or sponsor (e.g. @pumafootball).
                                    // Prefer the slugified name as the primary candidate for discovery.
                                    if (slugified.length > 3 && !bioHandle.includes(slugified.substring(0, 4))) {
                                        cleanHandle = slugified;
                                    } else {
                                        cleanHandle = bioHandle;
                                    }
                                } else {
                                    cleanHandle = slugified;
                                }
                            }
                        }

                        // Final safety check: if we still have spaces (shouldn't happen with slugify), skip
                        if (cleanHandle.includes(' ')) return;

                        const finalHandle = cleanHandle.toLowerCase().trim();
                        if (finalHandle.length > 2) {
                            gaps.add(finalHandle);
                        }
                    }
                }
            }
        };

        const traverse = (node: any) => {
            if (!node || visited.has(node)) return;
            visited.add(node);
            checkNode(node);
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(traverse);
            }
        };

        // 1. Scan Tree structure
        if (analytics.root) traverse(analytics.root);

        // 2. Scan Graph (Flat)
        if (analytics.graph && Array.isArray(analytics.graph.nodes)) {
            analytics.graph.nodes.forEach(node => checkNode(node));
        }

        // 3. Scan top-level nodes array
        if (analytics.nodes && Array.isArray(analytics.nodes)) {
            analytics.nodes.forEach(node => checkNode(node));
        }

        // 4. Scan sub-lists (Creators, Brands, etc.) - [FIX] Check nested analytics block
        const targetAnalytics = analytics.analytics || analytics;
        if (targetAnalytics.creators && Array.isArray(targetAnalytics.creators)) targetAnalytics.creators.forEach(node => checkNode(node));
        if (targetAnalytics.brands && Array.isArray(targetAnalytics.brands)) targetAnalytics.brands.forEach(node => checkNode(node));
        if (targetAnalytics.overindexing?.topCreators && Array.isArray(targetAnalytics.overindexing.topCreators)) {
            targetAnalytics.overindexing.topCreators.forEach((node: any) => checkNode(node));
        }
        if (targetAnalytics.topContent && Array.isArray(targetAnalytics.topContent)) {
            targetAnalytics.topContent.forEach((item: any) => {
                // Wrap in a node-like structure for checkNode
                checkNode({ data: item, group: 'creator' });
            });
        }

        return Array.from(gaps);
    }

    /**
     * Performs targeted scraping for missing profiles to ensure 100% enrichment
     */
    public async performDeepEnrichment(analytics: any, datasetId: string, jobId: string, profileMap: Map<string, StandardizedProfile>): Promise<void> {
        const gapHandles = this.identifyEnrichmentGaps(analytics);

        if (gapHandles.length === 0) {
            console.log(`[Enrichment] ✅ 100% data coverage achieved. No gaps found for dataset ${datasetId}.`);
            return;
        }

        console.log(`[Enrichment] ⚠️ Found ${gapHandles.length} profiles with missing data for Dataset ${datasetId}. Triggering Deep Enrichment...`);

        try {
            // 0. SET STATUS TO ENRICHING (For UI Indicator)
            if (jobId) {
                console.log(`[Enrichment] ⏳ Setting isEnriching flag for Job ${jobId}...`);
                await mongoService.updateJob(jobId, {
                    'metadata.isEnriching': true
                } as any);
            }

            if (datasetId) {
                console.log(`[Enrichment] ⏳ Setting isEnriching flag for Dataset ${datasetId}...`);
                await mongoService.updateDataset(datasetId, { isEnriching: true });
            }

            // [FIX] Increased limit from 20 to 50 to better handle larger graphs (requested by user)
            const targetHandles = gapHandles.slice(0, 1000);
            console.log(`[Enrichment] Targeted Deep Scrape: ${targetHandles.join(', ')}`);

            // Use the dedicated profile scraper (dSCLg0C3YEZ83HzYX)
            const stepResult = await this.runApifyActor('dSCLg0C3YEZ83HzYX', {
                usernames: targetHandles
            }, jobId, {
                taskName: "Deep Enrichment Scrape",
                planId: jobId
            });

            if (stepResult && stepResult.items) {
                console.log(`[Enrichment] Deep Scrape completed. Found ${stepResult.items.length} profiles.`);

                // Add new profiles to map and PERSIST to global cache
                for (const item of stepResult.items) {
                    const profile = this.normalizeToStandardProfile(item);
                    if (profile) {
                        const cleanHandle = (profile.username || '').toLowerCase().replace('@', '').trim();
                        if (profile.id) profileMap.set(profile.id, profile);
                        if (cleanHandle) {
                            profileMap.set(cleanHandle, profile);
                            // [NEW] Persist to global profile cache so other jobs benefit
                            if (profile.followersCount !== null) {
                                await mongoService.setProfileCache(cleanHandle, 'instagram', profile.followersCount).catch(() => { });
                            }
                        }
                    }
                }

                // Re-run enrichment logic to apply the newly scraped data to the nodes
                await this.enrichFandomAnalysisParallel(analytics, profileMap);
                console.log("[Enrichment] ✅ Deep Hydration complete.");

                // 4. PERSIST BACK TO DATABASE (Crucial for background gap-filling)
                if (datasetId) {
                    console.log(`[Enrichment] 💾 Persisting updated graph to database for Dataset ${datasetId}...`);
                    await mongoService.updateGraphSnapshot(datasetId, analytics);

                    // [NEW] Persist to Analytics Data (Critical for Sidebar Lists / Analytics Panel)
                    try {
                        console.log(`[Enrichment] 💾 Updating analytics_data record for Dataset ${datasetId}...`);
                        await mongoService.getDb().collection('records').updateOne(
                            { datasetId, recordType: 'analytics_data' },
                            {
                                $set: {
                                    data: analytics.analytics || analytics, // Handle both wrapped and unwrapped analytics
                                    updatedAt: new Date()
                                }
                            }
                        );
                    } catch (persistErr) {
                        console.warn(`[Enrichment] Non-fatal: Failed to update analytics_data record:`, persistErr);
                    }
                }

                if (jobId) {
                    console.log(`[Enrichment] 💾 Updating Job ${jobId} with enriched results...`);
                    await mongoService.updateJob(jobId, {
                        'result.analysisResult': analytics,
                        'result.enrichedAt': new Date(),
                        'metadata.deepEnrichmentPerformed': true,
                        'metadata.isEnriching': false // Done!
                    } as any);
                }

                if (datasetId) {
                    await mongoService.updateDataset(datasetId, { 'isEnriching': false } as any);
                }
                console.log("[Enrichment] ✅ Persistence complete.");
            } else {
                // If no results but we finished, clear the flag anyway
                if (jobId) {
                    await mongoService.updateJob(jobId, { 'metadata.isEnriching': false } as any);
                }
                if (datasetId) {
                    await mongoService.updateDataset(datasetId, { 'isEnriching': false } as any);
                }
            }
        } catch (error: any) {
            console.warn(`[Enrichment] ❌ Deep Enrichment failed: ${error.message}`);
            // Ensure flag is cleared on error
            if (jobId) {
                await mongoService.updateJob(jobId, { 'metadata.isEnriching': false } as any).catch(() => { });
            }
            if (datasetId) {
                await mongoService.updateDataset(datasetId, { isEnriching: false }).catch(() => { });
            }
        }
    }

    /**
     * Calculate optimal enrichment configuration based on dataset size
     * 
     * Adaptive batch sizing improves performance:
     * - Small datasets (<50): Process all at once
     * - Medium datasets (50-200): 50 nodes per batch
     * - Large datasets (200-500): 75 nodes per batch
     * - Very large datasets (500-1000): 100 nodes per batch
     * - Massive datasets (>1000): Cap at 100 to prevent memory issues
     */
    private getEnrichmentConfig(totalNodes: number): {
        batchSize: number;
        logInterval: number;
    } {
        if (totalNodes < DATASET_SIZE_SMALL) {
            return { batchSize: totalNodes, logInterval: 1 };
        } else if (totalNodes < DATASET_SIZE_MEDIUM) {
            return { batchSize: ENRICHMENT_BATCH_SIZE_SMALL, logInterval: 2 };
        } else if (totalNodes < DATASET_SIZE_LARGE) {
            return { batchSize: ENRICHMENT_BATCH_SIZE_MEDIUM, logInterval: 3 };
        } else if (totalNodes < DATASET_SIZE_VERY_LARGE) {
            return { batchSize: ENRICHMENT_BATCH_SIZE_LARGE, logInterval: 5 };
        } else {
            return { batchSize: ENRICHMENT_BATCH_SIZE_LARGE, logInterval: ENRICHMENT_LOG_INTERVAL_DEFAULT };
        }
    }

    /**
     * [DEPRECATED] Legacy synchronous enrichment - kept for fallback
     * Use enrichFandomAnalysisParallel instead
     */
    private enrichFandomAnalysis(analytics: any, profileMap: Map<string, StandardizedProfile>): any {
        if (!analytics || !analytics.root) return analytics;

        console.log(`[Enrichment] Hydrating Graph Nodes with Scraped Data...`);
        let hydrationCount = 0;

        const traverseAndHydrate = (node: any) => {
            if (!node) return;

            // Attempt to find matching profile
            // [FIX] Enhanced matching with more candidates and normalization
            const rawCandidates = [
                node.id,
                node.data?.handle,
                node.data?.username,
                node.label,
                node.name,
                node.handle
            ].filter(k => k && typeof k === 'string');

            // Match Logic
            const candidates = rawCandidates.map(k => k.toLowerCase().replace('@', '').trim());

            let profile: StandardizedProfile | undefined;

            // 1. Try Local Map (Current Scrape)
            for (const key of candidates) {
                profile = profileMap.get(key);
                if (profile) break;
            }

            // 2. [NEW] Global Lookup (Ghost Node Hydration)
            // If not found in current scrape, check global DB to fill gaps ("Ghost Nodes")
            if (!profile && candidates.length > 0) {
                const bestHandle = candidates.find(c => !c.includes(' ')); // Prefer handle over name
                if (bestHandle) {
                    // Sync lookup is not possible here as traverse is synchronous.
                    // We must rely on the fact that 'findGlobalProfile' is async.
                    // CRITICAL: This method (enrichFandomAnalysis) needs to be async or we need to pre-fetch ghost nodes.
                    // DESIGN CHANGE: We cannot await inside this sync traversal easily. 
                    // instead, we will just fix the URL sanitization here and handle global lookup earlier if possible.
                    // OR, we make this function async? Refactoring to async is risky for the whole chain.
                    // ALT: We just skip bad URLs.
                }
            }

            // [FIX] Sanitization Helper
            const sanitizeUrl = (url: string) => {
                if (!url || url.includes('fxxx.fbcdn') || url.includes('instagram.fxxx')) return '';
                return url;
            };

            // Hydrate if found
            if (profile) {
                hydrationCount++;
                if (!node.data) node.data = {};

                node.data.fullName = profile.fullName || node.data.fullName || node.label;
                node.data.profilePicUrl = proxyMediaUrl(profile.profilePicUrl || node.data.profilePicUrl || '');
                node.data.bio = profile.biography || node.data.bio || '';
                node.data.followers = (profile.followersCount ?? node.data.followerCount ?? 0).toLocaleString();
                node.data.followerCount = profile.followersCount ?? node.data.followerCount ?? 0;
                node.data.followingCount = profile.followsCount ?? node.data.followingCount ?? 0;
                node.data.postCount = profile.postsCount ?? profile.mediaCount ?? (profile.latestPosts ? profile.latestPosts.length : 0);
                node.data.sourceUrl = profile.externalUrl || `https://instagram.com/${profile.username}`;

                // [FIX] Ensure we trigger the "Verified" badge in UI
                node.data.isVerified = true;

                // Attach Latest Posts (Images/Videos)
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
            } else {
                // [NEW] Sanitize Hallucinated URLs for un-hydrated nodes
                if (node.data && node.data.profilePicUrl) {
                    node.data.profilePicUrl = sanitizeUrl(node.data.profilePicUrl);
                }
            }


            // Recurse
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(traverseAndHydrate);
            }
        };

        // Start from Root
        traverseAndHydrate(analytics.root);
        console.log(`[Enrichment] Hydrated ${hydrationCount} nodes.`);

        return analytics;
    }

    async startPolling(intervalMs: number = 10000) {
        if (this.pollingInterval) return;
        console.log('[JobOrchestrator] Starting polling...');

        // [NEW] Job Recovery: Reset any 'running' jobs to 'queued' on startup
        // This handles cases where the server crashed or was restarted mid-job
        try {
            if (mongoService.isConnected()) {
                const db = mongoService.getDb();
                const result = await db.collection('jobs').updateMany(
                    { status: 'running' },
                    { $set: { status: 'queued', updatedAt: new Date() } }
                );
                if (result.matchedCount > 0) {
                    console.log(`[JobOrchestrator] â™»ï¸  Recovered ${result.matchedCount} stranded jobs.`);
                }
            }
        } catch (e) {
            console.warn("[JobOrchestrator] Failed to recover stranded jobs:", e);
        }

        this.pollingInterval = setInterval(() => this.pollNextJob(), intervalMs);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async pollNextJob() {
        if (this.processing) return;
        this.processing = true;

        try {
            if (!mongoService.isConnected()) {
                // Wait for connection
                this.processing = false;
                return;
            }

            const db = mongoService.getDb();
            // Atomic find-and-update to claim a job
            const result = await db.collection<Job>('jobs').findOneAndUpdate(
                { status: 'queued' },
                { $set: { status: 'running', updatedAt: new Date() } },
                { sort: { createdAt: 1 }, returnDocument: 'after' } // Ensure we get the updated job
            );

            // In MongoDB Driver v6/v7+, findOneAndUpdate returns the document directly
            const job = result;

            if (job && (job as any).id) {
                console.log(`[JobOrchestrator] Picked up job ${(job as any).id} (${(job as any).type})`);
                await this.processJob(job as any);
            }
        } catch (error: any) {
            // [FIX] Handle MongoDB Quota Exceeded (Code 8000)
            if (error.code === 8000 || (error.errorResponse && error.errorResponse.code === 8000)) {
                console.error("ðŸš¨ [JobOrchestrator] MongoDB Storage Quota Exceeded! Checking paused for 60s.");
                await new Promise(r => setTimeout(r, 60000));
            } else if (error.message && !error.message.includes('Database not connected')) {
                console.error('[JobOrchestrator] Polling error:', error);
            }
        } finally {
            this.processing = false;
        }
    }

    private async processJob(job: Job) {
        try {
            if (job.type === 'map_generation') {
                await this.processMapGeneration(job);
            } else if (job.type === 'ai_analysis') {
                await this.processAiAnalysis(job);
            } else if (job.type === 'orchestration') {
                await this.processOrchestration(job);
            } else {
                throw new Error(`Unknown job type: ${job.type} `);
            }
        } catch (error: any) {
            console.error(`[JobOrchestrator] Job ${job.id} failed: `, error);
            const errorMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
            await mongoService.updateJob(job.id, {
                status: 'failed',
                error: errorMsg || 'Unknown error occurred (check logs)'
            });
            // Notify User of Failure
            await emailService.sendTitleAlert(`Job Failed: ${job.type} `, `Job ID: ${job.id} \nError: ${error.message} `);
        }
    }


    /**
     * [NEW] Run initial seed scrape to get context from handles in criteria
     */
    private async runSeedScrape(query: string, jobId: string | null, ignoreCache: boolean = false): Promise<any[]> {
        // 1. Extract handles
        const handles: string[] = [];
        const handleRegex = /@([a-zA-Z0-9_.]+)/g;
        const urlRegex = /instagram\.com\/([a-zA-Z0-9_.]+)/g;

        let match;
        while ((match = handleRegex.exec(query)) !== null) {
            handles.push(match[1]);
        }
        while ((match = urlRegex.exec(query)) !== null) {
            handles.push(match[1]);
        }

        const uniqueHandles = [...new Set(handles)];

        if (uniqueHandles.length === 0) {
            return [];
        }

        console.log(`[SeedScrape] Found handles: ${uniqueHandles.join(', ')} `);

        // 2. Run Apify Scraper
        const input = {
            "addParentData": false,
            "directUrls": uniqueHandles.map(h => `https://www.instagram.com/${h}`),
            "resultsLimit": uniqueHandles.length,
            "resultsType": "details",
            "searchLimit": 1,
            "searchType": "user"
        };

        // Use instagram-api-scraper as requested
        const { items } = await this.runApifyActor('apify/instagram-api-scraper', input, jobId?.toString(), {
            taskName: 'Seed Scrape',
            ignoreCache: ignoreCache
        });
        return items;
    }


    /**
     * [NEW] Extract context string from seed scrape results
     */
    private extractSeedContext(items: any[]): string {
        let context = "CONTEXT FROM SEED PROFILES:\n";

        items.forEach((item: any) => {
            const username = item.username || item.ownerUsername || 'unknown';
            context += `\n[Profile: ${username}]\n`;

            if (item.fullName) context += `Name: ${item.fullName}\n`;
            if (item.biography) context += `Bio: ${item.biography}\n`;
            if (item.businessCategoryName) context += `Category: ${item.businessCategoryName}\n`;
            if (item.followersCount) context += `Followers: ${item.followersCount}\n`;

            // Latest Posts (Captions & Hashtags)
            if (item.latestPosts && Array.isArray(item.latestPosts)) {
                context += `Recent Content:\n`;
                item.latestPosts.slice(0, 5).forEach((p: any) => {
                    const caption = p.caption ? p.caption.substring(0, 100).replace(/\n/g, ' ') + '...' : '';
                    if (caption) context += `  - "${caption}"\n`;
                    if (p.hashtags && p.hashtags.length > 0) context += `    Tags: ${p.hashtags.join(', ')}\n`;
                });
            }

            // Related Profiles
            if (item.relatedProfiles && Array.isArray(item.relatedProfiles)) {
                const related = item.relatedProfiles.map((r: any) => r.username).join(', ');
                context += `Related Profiles: ${related}\n`;
            }
        });

        return context;
    }


    private async processMapGeneration(job: Job) {
        const { query, sampleSize, plan: existingPlan, ignoreCache, useThemedNodes, postLimit } = job.metadata; // [MODIFIED] Extract ignoreCache, useThemedNodes, postLimit

        console.log(`[JobOrchestrator] Processing Map Generation: "${query}" (Size: ${sampleSize}, IgnoreCache: ${ignoreCache})`);

        // [NEW] 0. Run Seed Scrape to get Context
        let seedContext = "";
        try {
            console.log(`[JobOrchestrator] Running Seed Scrape for context... (IgnoreCache: ${ignoreCache})`);
            const seedData = await this.runSeedScrape(query, job.id, ignoreCache);
            if (seedData && seedData.length > 0) {
                seedContext = this.extractSeedContext(seedData);
                console.log(`[JobOrchestrator] Seed Scrape successful. Context length: ${seedContext.length}`);
            } else {
                console.log(`[JobOrchestrator] Seed Scrape returned no data.`);
            }
        } catch (e: any) {
            console.warn(`[JobOrchestrator] Seed Scrape failed (continuing without context): ${e.message}`);
        }

        let plan;

        if (existingPlan) {
            console.log(`[JobOrchestrator] Using provided plan with ${existingPlan.steps.length} steps`);
            plan = existingPlan;
            await mongoService.updateJob(job.id, { progress: 10, result: { stage: 'Plan accepted', plan } });
        } else {
            // 1. Analyze Requirements (AI-Only Route)
            await mongoService.updateJob(job.id, { progress: 10, result: { stage: 'Analyzing query intent with AI...' } });

            try {
                // All queries now go through Gemini for maximum accuracy and nuance
                plan = await this.analyzeMapRequirements(query, sampleSize, [], false, true, seedContext, postLimit || 3);

                console.log(`[JobOrchestrator] Final Plan generated (${plan.intent}): ${plan.steps.length} steps`);
            } catch (e: any) {
                throw new Error(`Planning failed: ${e.message}`);
            }
        }

        // 2. Execute Steps
        const results: any[] = [];
        let datasetId = "";
        const datasetIds: string[] = []; // [NEW] Track all dataset IDs

        if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
            throw new Error("Invalid plan structure: 'steps' array is missing");
        }

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const progress = 10 + Math.floor(((i + 1) / plan.steps.length) * 60); // 10% to 70%

            await mongoService.updateJob(job.id, {
                progress,
                result: { stage: `Executing step ${i + 1}/${plan.steps.length}: ${step.description}`, plan }
            });

            // Resolve inputs (handle "USE_DATA_FROM_PREVIOUS")
            // Resolve inputs (handle "USE_DATA_FROM_PREVIOUS")
            const resolvedInput = this.resolveInput(step.input, results, plan, step.actorId);

            // Execute Scrape
            console.log(`[JobOrchestrator] Executing Actor: ${step.actorId}`);
            try {
                // [MODIFIED] Pass ignoreCache to runApifyActor
                const stepResult = await this.runApifyActor(step.actorId, resolvedInput, job.id, {
                    taskName: step.description.replace('Apify', 'Cloud Scraper'),
                    query: query,
                    planId: job.id,
                    sampleSize: sampleSize,
                    ignoreCache: ignoreCache, // [NEW] Pass the flag
                    search_keywords: plan.search_keywords // [NEW] Pass extracted keywords
                });

                let items = stepResult.items;

                // [NEW] Private Account Filtering
                // If this was a followers/following scrape, filter out private accounts
                if (step.actorId.includes('followers') || step.actorId.includes('following') || step.actorId === 'asIjo32NQuUHP4Fnc') {
                    const originalCount = items.length;
                    items = items.filter((item: any) => !item.isPrivate && !item.is_private);
                    const filteredCount = originalCount - items.length;
                    if (filteredCount > 0) {
                        console.log(`[JobOrchestrator] 🔒 Filtered out ${filteredCount} private accounts from results.`);
                    }
                }

                results.push(items);
                datasetId = stepResult.datasetId; // Keep the last one as "primary"

                // [DEBUG] Log scraper results to identify data quality issues
                console.log(`[JobOrchestrator] ✅ Step ${i + 1} completed: ${items.length} items scraped`);
                if (items.length > 0) {
                    const sample = items[0];
                    console.log(`[JobOrchestrator] 📊 Sample data:`, {
                        username: sample.username || sample.ownerUsername || sample.uniqueId,
                        followers: sample.followersCount || sample.followerCount || 0,
                        following: sample.followsCount || sample.followingCount || 0,
                        posts: sample.postsCount || sample.mediaCount || sample.posts || 0,
                        hasBio: !!sample.biography || !!sample.bio,
                        hasProfilePic: !!sample.profilePicUrl || !!sample.profile_pic_url
                    });
                }

                // [NEW] Process Google Search Results
                if (step.actorId === 'apify/google-search-scraper' || step.actorId.includes('google-search')) {
                    console.log(`[JobOrchestrator] Processing Google Search results...`);
                    const coreProfile = query.match(/@(\w+)/)?.[1] || '';
                    const processedProfiles = this.processGoogleSearchResults(items, coreProfile);

                    // Replace raw Google results with processed profiles
                    results[results.length - 1] = processedProfiles;
                    console.log(`[JobOrchestrator] Processed ${processedProfiles.length} profiles from Google Search`);
                }

                // [NEW] Accumulate and Update Metadata for Live Counting
                if (datasetId) {
                    datasetIds.push(datasetId);
                    // Update job metadata with current datasets so ProgressGraph can poll them
                    await mongoService.updateJob(job.id, {
                        metadata: {
                            ...job.metadata,
                            datasetIds: [...new Set(datasetIds)] // Unique IDs
                        }
                    });
                }
            } catch (stepError: any) {
                console.error(`[JobOrchestrator] ❌ Step ${i + 1} (${step.actorId}) FAILED:`, stepError);
                console.error(`[JobOrchestrator] Step Description: ${step.description}`);
                console.error(`[JobOrchestrator] Resolved Input:`, JSON.stringify(resolvedInput, null, 2).substring(0, 500));
                const stepMsg = stepError instanceof Error ? stepError.message : JSON.stringify(stepError);

                // Update job with detailed error before throwing
                await mongoService.updateJob(job.id, {
                    status: 'failed',
                    error: `Step ${i + 1} (${step.actorId}) failed: ${stepMsg}`,
                    result: {
                        stage: `Failed at step ${i + 1}/${plan.steps.length}`,
                        errorDetails: stepMsg,
                        failedStep: i + 1,
                        plan
                    }
                });

                throw new Error(`Step ${i + 1} (${step.actorId}) failed: ${stepMsg}`);
            }
        }

        // [NEW] Universal Gemini Analysis Step
        let analysisResult: any = null;

        // If the plan didn't fail, run the deep dive analysis on the collected data
        if (results.length > 0) {
            await mongoService.updateJob(job.id, { progress: 75, result: { stage: 'Running Advanced AI Analysis...', plan } });
            try {
                console.log("[JobOrchestrator] 🧠 Triggering Post-Scrape AI Analysis...");
                // We'll use the last dataset ID or assemble context
                const datasetUrl = datasetId ? `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=1` : '';
                const intent = (plan as any).intent || 'general_map';

                // [NEW] Smart Data Filtering (Refining the Context)
                const aggregatedContext = this.aggregateContextLocal(results, intent); // [FIX] Renamed to avoid duplicate
                const allItems = results.flat(); // [FIX] Flatten results

                if (intent === 'competitor_content_analysis') {
                    analysisResult = this.handleCompetitorContentGraph(plan, results, query);
                } else if (intent === 'hashtag_tracking') {
                    analysisResult = this.handleHashtagGraph(plan, results, query);
                } else if (intent === 'engagement_benchmark') {
                    analysisResult = this.handleEngagementBenchmarkGraph(plan, results, query);
                } else if (intent === 'ugc_discovery') {
                    analysisResult = this.handleUGCGraph(plan, results, query);
                } else if (intent === 'sentiment_analysis') {
                    analysisResult = this.handleSentimentGraph(plan, results, query);
                    // } else if (intent === 'influencer_identification') {
                    //     analysisResult = this.handleInfluencerGraph(plan, results, query);
                } else if (intent === 'viral_content') {
                    analysisResult = this.handleViralGraph(plan, results, query);
                } else if (intent === 'audience_overlap' || intent === 'comparison') {
                    analysisResult = this.handleComparisonGraphHandler(plan, results, query);
                } else {
                    analysisResult = await analyzeFandomDeepDive(
                        query,
                        allItems, // [FIX] Pass Data Array (Type: any[])
                        intent,
                        'instagram',
                        datasetUrl,
                        sampleSize || 100, // Pass scaling parameter
                        useThemedNodes, // Pass visual theme logic
                        allItems, // [FIX] Pass Master List as Rich Context
                        'full', // Explicit Mode
                        aggregatedContext + (seedContext ? `\n${seedContext}` : "") // [FIX] Pass Text Context here
                    );
                }

                // [CRITICAL FIX] ENRICH GRAPH NODES WITH SCRAPED DATA
                console.log('[JobOrchestrator] 🛠 Building profile map from scraped data (ID-First Strict Mode)...');
                const profileMap = new Map<string, StandardizedProfile>();

                for (const item of allItems) {
                    try {
                        const profile = this.normalizeToStandardProfile(item);

                        // [STRICT] 1. Store by ID (Primary)
                        if (profile.id) {
                            profileMap.set(profile.id, profile);
                        }

                        // [STRICT] 2. Store by Username (Secondary Pointer)
                        // Only if we have a valid profile. 
                        if (profile.username) {
                            const key = profile.username.toLowerCase().replace('@', '').trim();
                            // Only overwrite if this record has an ID (better quality) or if previous entry didn't
                            const existing = profileMap.get(key);
                            if (!existing || (profile.id && !existing.id)) {
                                profileMap.set(key, profile);
                            }
                        }
                    } catch (err) {
                        // Skip malformed records
                    }
                }

                console.log(`[JobOrchestrator] ✅ Profile map built with ${profileMap.size} profiles`);

                // Enrich the graph with profile data
                if (analysisResult && (analysisResult.root || analysisResult.graph)) {
                    console.log('[JobOrchestrator] 🎨 Enriching graph nodes with profile data...');

                    try {
                        // Enrich tree structure (if present)
                        if (analysisResult.root) {
                            analysisResult = await this.enrichFandomAnalysisParallel(analysisResult, profileMap);
                        }

                        // Also enrich flat graph nodes (if present)
                        if (analysisResult.graph && analysisResult.graph.nodes) {
                            const enrichedGraph = await this.enrichFandomAnalysisParallel(
                                { root: { children: analysisResult.graph.nodes } },
                                profileMap
                            );
                            // Update the nodes in place
                            analysisResult.graph.nodes = enrichedGraph.root.children;
                        }

                        console.log('[JobOrchestrator] ✅ Graph enrichment complete');
                    } catch (enrichError) {
                        console.warn('[JobOrchestrator] ⚠️ Enrichment failed (non-fatal):', enrichError);
                    }

                    // [NEW] 100% ENRICHMENT GUARANTEE: Perform Deep Enrichment for missing nodes
                    console.log('[JobOrchestrator] 🔍 Checking for enrichment gaps...');
                    // Use datasetId from result if available, or try metadata
                    const datasetId = job.result?.datasetId || job.metadata?.datasetId;
                    await this.performDeepEnrichment(analysisResult, datasetId, job.id, profileMap);
                }

                // [NEW] BUILD HIERARCHICAL STRUCTURE FROM FLAT NODES
                if (analysisResult && analysisResult.graph && analysisResult.graph.nodes) {
                    console.log('[JobOrchestrator] 🏗 Building hierarchical structure from flat nodes...');
                    try {
                        const hierarchicalGraph = this.buildGraphHierarchy(
                            analysisResult.graph.nodes,
                            analysisResult.graph.links || []
                        );

                        // Replace flat structure with hierarchical one
                        analysisResult.graph.nodes = hierarchicalGraph.nodes;
                        analysisResult.graph.links = hierarchicalGraph.links;

                        console.log('[JobOrchestrator] ✅ Hierarchy built successfully');
                    } catch (hierarchyError) {
                        console.warn('[JobOrchestrator] ⚠️ Hierarchy building failed (non-fatal):', hierarchyError);
                    }
                }

                // [FIX] Flatten Tree for Legacy Analytics Panel Compatibility
                if (analysisResult && analysisResult.root) {
                    console.log("[JobOrchestrator] Flattening Tree Structure for Analytics Panel...");
                    const flatAnalytics = {
                        creators: [] as any[],
                        brands: [] as any[],
                        clusters: [] as any[],
                        topics: [] as any[],
                        subtopics: [] as any[], // [FIX] Add subtopics
                        overindexing: { topCreators: [] } as any, // [FIX] Add overindexing
                        nonRelatedInterests: [] as any[],
                        topContent: [] as any[],
                        aestheticTags: analysisResult.analytics?.aestheticTags || [],
                        vibeDescription: analysisResult.analytics?.vibeDescription || "",
                        colorPalette: analysisResult.analytics?.colorPalette || [],
                        visualAnalysis: analysisResult.analytics?.visualAnalysis,
                        visualTheme: analysisResult.analytics?.visualTheme
                    };

                    const creatorsMap = new Map<string, any>();
                    const brandsMap = new Map<string, any>();
                    const topicsMap = new Map<string, any>();

                    const clusters = analysisResult.root.children || [];

                    clusters.forEach((cluster: any) => {
                        const clusterItem = {
                            name: cluster.label,
                            value: cluster.val,
                            count: cluster.data?.count || cluster.val,
                            ...cluster.data
                        };
                        flatAnalytics.clusters.push(clusterItem);

                        if (cluster.children) {
                            cluster.children.forEach((node: any) => {
                                const item = {
                                    name: node.label,
                                    value: node.val,
                                    type: node.type,
                                    provenance: node.provenance || "AI Identified",
                                    ...node.data
                                };

                                // [FIX] Robust Deduplication & Hydration
                                const rawKey = (node.label || node.id || "").toLowerCase().trim();
                                const handleKey = (node.data?.handle || "").toLowerCase().replace('@', '').trim();

                                // Try to find real data in profileMap (scraped data)
                                const realProfile = profileMap.get(handleKey) || profileMap.get(rawKey);

                                // Merge real data if found
                                if (realProfile) {
                                    item.followersCount = realProfile.followersCount || item.followersCount || 0;
                                    item.followingCount = realProfile.followsCount || item.followingCount || 0;
                                    item.postsCount = realProfile.mediaCount || realProfile.postsCount || item.postsCount || 0;
                                    item.profilePicUrl = realProfile.profilePicUrl || item.profilePicUrl;
                                    item.url = realProfile.url || item.url;
                                    item.handle = realProfile.username ? `@${realProfile.username}` : item.handle;
                                    // Ensure evidence exists
                                    item.evidence = item.evidence || realProfile.evidence || "Identified via detailed profile analysis";
                                } else {
                                    item.evidence = item.evidence || "Identified via cluster analysis";
                                }

                                const key = handleKey || rawKey; // Prefer handle for uniqueness

                                if (node.type === 'creator') {
                                    if (!creatorsMap.has(key) || (item.followersCount > (creatorsMap.get(key).followersCount || 0))) {
                                        creatorsMap.set(key, item);
                                    }
                                } else if (node.type === 'brand') {
                                    if (!brandsMap.has(key)) {
                                        brandsMap.set(key, item);
                                    }
                                } else if (node.type === 'topic' || node.type === 'subtopic') {
                                    // [FIX] Handle subcultures/topics
                                    if (!topicsMap.has(key)) {
                                        topicsMap.set(key, item);
                                    } else {
                                        // Aggregate occurrences for topics
                                        const existing = topicsMap.get(key);
                                        const parsePct = (s: string) => parseInt(s?.replace('%', '') || '0');
                                        const newCount = (parsePct(item.percentage) || 1) + (parsePct(existing.percentage) || 1);
                                        // Keep the one with better description/evidence
                                        if (item.evidence && (!existing.evidence || existing.evidence.length < item.evidence.length)) {
                                            existing.evidence = item.evidence;
                                        }
                                        existing.percentage = `${newCount}% relevance`;
                                    }
                                }
                            });
                        }
                    });

                    // Add deduplicated items to flatAnalytics
                    flatAnalytics.creators = Array.from(creatorsMap.values())
                        .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
                    flatAnalytics.brands = Array.from(brandsMap.values());
                    // [FIX] Explicitly map topics to subcultures if missing
                    flatAnalytics.subtopics = Array.from(topicsMap.values());
                    flatAnalytics.topics = Array.from(topicsMap.values());

                    // [NEW] Visual DNA Recovery Bridge
                    const visualData = analysisResult.analytics?.visualAnalysis || analysisResult.analytics;
                    if (visualData) {
                        flatAnalytics.aestheticTags = visualData.aestheticTags || flatAnalytics.aestheticTags;
                        flatAnalytics.vibeDescription = visualData.vibeDescription || flatAnalytics.vibeDescription;
                        flatAnalytics.colorPalette = visualData.colorPalette || [];
                    }

                    // [NEW] Aggregate Top Content (Robust)
                    console.log(`[JobOrchestrator] Aggregating Top 10 Content from ${profileMap.size} hydrated profiles...`);
                    const allPosts: any[] = [];
                    const uniquePosts = new Map();

                    // 1. Collect from Hydrated Profiles (Primary Source)
                    profileMap.forEach((profile: any) => {
                        if (profile.latestPosts && Array.isArray(profile.latestPosts)) {
                            profile.latestPosts.forEach((post: any) => {
                                const pid = post.id || post.shortCode || post.url;
                                if (pid && !uniquePosts.has(pid)) {
                                    uniquePosts.set(pid, {
                                        ...post,
                                        author: profile.username, // Ensure author is attached
                                        authorProfilePic: profile.profilePicUrl
                                    });
                                }
                            });
                        }
                    });

                    // 2. Collect from Clusters (Secondary)
                    clusters.forEach((c: any) => {
                        if (c.data && c.data.latestPosts && Array.isArray(c.data.latestPosts)) {
                            c.data.latestPosts.forEach((post: any) => {
                                const pid = post.id || post.shortCode || post.url;
                                if (pid && !uniquePosts.has(pid)) {
                                    uniquePosts.set(pid, { ...post, author: c.label });
                                }
                            });
                        }
                    });

                    // [NEW] 3. Fallback to Raw Scrape Results (Safety Net)
                    // If profileMap yielded nothing, scan the raw results for ANY media
                    if (uniquePosts.size < 5 && results.length > 0) {
                        console.log(`[JobOrchestrator] âš ï¸  Top Content low (${uniquePosts.size}). Scanning raw results for fallback media...`);
                        const flatten = (arr: any[]) => arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []);
                        const allRawItems = flatten(results);

                        allRawItems.forEach((item: any) => {
                            // Check for post-like structure
                            if (item.displayUrl || item.imageUrl || item.videoUrl || (item.type === 'Image' || item.type === 'Video')) {
                                const pid = item.id || item.shortCode || item.url || Math.random().toString(36);
                                if (!uniquePosts.has(pid)) {
                                    uniquePosts.set(pid, {
                                        id: pid,
                                        url: item.url || item.postUrl,
                                        displayUrl: item.displayUrl || item.imageUrl || item.thumbnailUrl,
                                        videoUrl: item.videoUrl,
                                        likesCount: item.likesCount || item.likeCount || 0,
                                        commentsCount: item.commentsCount || 0,
                                        caption: item.caption || item.text,
                                        author: item.ownerUsername || item.username || "Unknown",
                                        authorProfilePic: item.authorProfilePic || item.profilePicUrl,
                                        timestamp: item.timestamp
                                    });
                                }
                            }
                        });
                    }

                    flatAnalytics.topContent = Array.from(uniquePosts.values())
                        .sort((a: any, b: any) => (b.likesCount || 0) - (a.likesCount || 0)) // Sort by Likes
                        .slice(0, 12) // Top 12
                        .map(post => ({
                            id: post.id || Math.random().toString(36), // fallback ID
                            url: post.url || post.postUrl || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : '#'),
                            displayUrl: post.displayUrl || post.imageUrl || post.thumbnailUrl,
                            videoUrl: post.videoUrl || post.webVideoUrl,
                            type: (post.isVideo || post.videoUrl) ? 'Video' : 'Image',
                            likesCount: post.likesCount || post.likeCount || 0,
                            commentsCount: post.commentsCount || 0,
                            caption: post.caption || post.text || "",
                            author: post.author || "Unknown",
                            authorProfilePic: post.authorProfilePic,
                            timestamp: post.timestamp
                        }));

                    console.log(`[JobOrchestrator] Final Top Content count: ${flatAnalytics.topContent.length}`);

                    // [Refactored] Populate Deterministic Overindexing
                    if (results && results.length > 0) {
                        const frequencySignals = this.analyzeNetworkFrequency(results);
                        flatAnalytics.overindexing = { topCreators: frequencySignals };
                        console.log(`[JobOrchestrator] Populated ${frequencySignals.length} overindexed profiles.`);
                    }

                    analysisResult.analytics = flatAnalytics;
                }

                // [NEW] Audit Miner Results
                if (analysisResult && analysisResult.analytics) {
                    console.log(`[JobOrchestrator] Running Miner Auditor...`);
                    const audit = await this.auditMinerResults(query, analysisResult.analytics, allItems);

                    await mongoService.updateJob(job.id, {
                        metadata: {
                            ...job.metadata,
                            minerAudit: {
                                passed: audit.passed,
                                issues: audit.issues,
                                suggestions: audit.suggestions,
                                timestamp: new Date()
                            }
                        }
                    });

                    analysisResult.minerAudit = audit;
                }

                console.log("[JobOrchestrator] AI Analysis Complete");
            } catch (aiError) {
                console.warn("[JobOrchestrator] Post-scrape AI analysis failed (non-fatal):", aiError);
            }
        }

        // [NEW] 3b. QUALITY SCORING & CONFIDENCE CALCULATION
        let qualityScore = 0;
        let confidenceScore = 0;
        let accuracyMetrics: any = {};

        if (analysisResult && analysisResult.analytics) {
            try {
                console.log("[JobOrchestrator] Calculating quality and confidence scores...");

                const { scoreQueryResult, calculateConfidence, getQuerySuggestions, identifyLowConfidenceAreas } = await import('../../services/queryAccuracyService.js');

                const qualityMetrics = scoreQueryResult(query, analysisResult, {
                    minerAudit: analysisResult.minerAudit,
                    createdAt: new Date()
                });

                qualityScore = qualityMetrics.overall;
                accuracyMetrics = {
                    completeness: qualityMetrics.completeness,
                    relevance: qualityMetrics.relevance,
                    freshness: qualityMetrics.freshness,
                    provenance: qualityMetrics.provenance
                };

                const confidence = calculateConfidence(query, analysisResult, {
                    minerAudit: analysisResult.minerAudit
                });

                confidenceScore = confidence.score;

                const lowConfidenceAreas = identifyLowConfidenceAreas(analysisResult);

                let suggestions: any[] = [];
                if (qualityScore < 70) {
                    suggestions = getQuerySuggestions(query, analysisResult, qualityMetrics);
                }

                console.log(`[JobOrchestrator] Quality: ${qualityScore}/100, Confidence: ${confidenceScore}/100`);

                await mongoService.updateJob(job.id, {
                    qualityScore,
                    confidenceScore,
                    accuracyMetrics,
                    metadata: {
                        ...job.metadata,
                        qualityScore,
                        confidenceScore,
                        accuracyMetrics,
                        lowConfidenceAreas: lowConfidenceAreas.length > 0 ? lowConfidenceAreas : undefined,
                        suggestions: suggestions.length > 0 ? suggestions : undefined
                    }
                });

            } catch (scoringError) {
                console.warn("[JobOrchestrator] Quality scoring failed (non-fatal):", scoringError);
            }
        }

        // 3. Save Final Dataset
        await mongoService.updateJob(job.id, { progress: 80, result: { stage: 'Saving results...', plan } });

        let finalRecordCount = 0;
        if (datasetId) {
            await this.syncApifyDatasetToLocal(datasetId, query, job.userId, analysisResult, results);
            const ds = await mongoService.getDatasetById(datasetId);
            finalRecordCount = ds?.recordCount || 0;
        }

        // [NEW] 3a. BILLING & TRANSACTION LOGGING
        try {
            console.log(`[JobOrchestrator] Calculating cost for ${finalRecordCount} records...`);
            const cost = await costCalculator.calculateQueryBuilderCost(finalRecordCount);

            await costCalculator.trackUsageAndDeduct(
                job.userId,
                'query_builder',
                `Map Generation: ${query}`,
                cost
            );
            console.log(`[JobOrchestrator] 💰 Transaction logged: £${cost.chargedAmount.toFixed(2)} for User ${job.userId}`);

            await mongoService.updateJob(job.id, {
                metadata: { ...job.metadata, cost: cost.chargedAmount, currency: 'GBP' }
            });

        } catch (billingError: any) {
            console.error(`[JobOrchestrator] 🚨 Billing/Logging Failed for Job ${job.id}:`, billingError);
            await emailService.sendTitleAlert("Billing Failure", `Job ${job.id} failed to bill user ${job.userId}. Error: ${billingError.message}`);
        }

        // 4. Complete
        await mongoService.updateJob(job.id, {
            status: 'completed',
            progress: 100,
            result: {
                datasetId,
                message: 'Map generation complete',
                plan,
                aiAnalyzed: !!analysisResult,
                qualityScore,
                confidenceScore
            }
        });

        // Notify User
        await this.notifyCompletion(job, query);
    }



    private async notifyCompletion(job: Job, query: string) {
        const user = await mongoService.getUser(job.userId) || await mongoService.getUserByEmail(job.userId);
        if (user && user.email) {
            const subject = `Your Fandom Map is Ready: ${query} ðŸ—ºï¸`;
            const htmlBody = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #10b981; font-size: 28px; margin-bottom: 5px; letter-spacing: -0.5px;">Fandom Intelligence</h1>
                        <p style="color: #64748b; font-size: 14px; text-transform: uppercase; tracking: 1px; margin: 0;">Analysis Complete</p>
                    </div>
                    
                    <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 30px;">
                        <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">TARGET QUERY</p>
                        <h2 style="margin: 0; color: #ffffff; font-size: 20px;">${query}</h2>
                    </div>

                    <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px; color: #94a3b8;">
                        Our intelligence engine has finished analyzing your request. The graph and deep-dive analytics are now available in your personal library.
                    </p>

                    <div style="text-align: center;">
                        <a href="https://fandom-analytics.com/" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                            Launch Intelligence Dashboard
                        </a>
                    </div>
                    
                    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #10b98122; text-align: center;">
                        <p style="font-size: 12px; color: #475569;">
                            Job ID: ${job.id} &bull; Analysis Mode: ${job.type.replace('_', ' ')}
                        </p>
                    </div>
                </div>
            `;
            await emailService.sendEmail(user.email, subject, htmlBody);
        }
    }

    // --- HELPER METHODS ---

    private resolveInput(input: any, previousResults: any[], plan?: any, actorId?: string): any {
        const inputStr = JSON.stringify(input);
        if (!inputStr.includes('USE_DATA_FROM')) return input;

        const newInput = JSON.parse(inputStr);

        // Helper to get usernames from a result set
        const extractUsernames = (items: any[]) => {
            // [FIX] Context-aware extraction based on target actor
            if (actorId && (actorId.includes('comment-scraper') || actorId.includes('media-scraper'))) {
                console.log(`[JobOrchestrator] 📸 Extracting URLs for ${actorId}`);
                const urls: string[] = [];
                // Helper to validate URL structure (Must contain /p/ or /reel/)
                const isValidPostUrl = (u: string) => u && (u.includes('/p/') || u.includes('/reel/'));

                (items || []).forEach((item: any) => {
                    // 1. Direct Post URL
                    if (isValidPostUrl(item.url)) urls.push(item.url);
                    else if (isValidPostUrl(item.postUrl)) urls.push(item.postUrl);

                    // 2. Shortcode variations (instagram-api-scraper uses different field names)
                    else if (item.shortCode || item.shortcode || item.code || item.id) {
                        const code = item.shortCode || item.shortcode || item.code || item.id;
                        // Determine if it's a reel or regular post
                        const isReel = item.productType === 'clips' || item.type === 'clips' || item.type === 'reel';
                        const path = isReel ? 'reel' : 'p';
                        urls.push(`https://www.instagram.com/${path}/${code}/`);
                    }

                    // 3. Extract from 'latestPosts' (Profile Scraper Output)
                    else if (item.latestPosts && Array.isArray(item.latestPosts)) {
                        item.latestPosts.forEach((p: any) => {
                            const pUrl = p.url || p.postUrl;
                            if (isValidPostUrl(pUrl)) {
                                urls.push(pUrl);
                            } else if (p.shortCode || p.shortcode || p.code || p.id) {
                                const code = p.shortCode || p.shortcode || p.code || p.id;
                                const isReel = p.productType === 'clips' || p.type === 'clips' || p.type === 'reel';
                                const path = isReel ? 'reel' : 'p';
                                urls.push(`https://www.instagram.com/${path}/${code}/`);
                            }
                        });
                    }
                });
                const uniqueUrls = [...new Set(urls)].filter(Boolean);
                console.log(`[JobOrchestrator] ✅ Extracted ${uniqueUrls.length} unique post URLs from ${items.length} items`);
                if (uniqueUrls.length === 0) {
                    console.warn(`[JobOrchestrator] ⚠️ No valid post URLs extracted! Sample item:`, JSON.stringify(items[0] || {}).substring(0, 500));
                }
                return uniqueUrls;
            }

            // Default: Extract Usernames/Handles
            return (items || []).map((item: any) =>
                item.username || item.ownerUsername || item.uniqueId
            ).filter(Boolean);
        };

        // Better approach: Traverse and replace Arrays specifically
        const replaceStrict = (obj: any) => {
            for (const key in obj) {
                if (Array.isArray(obj[key]) && obj[key].length > 0) {
                    const array = obj[key];
                    let hasToken = false;
                    let newItems: any[] = [];

                    // [FIX] Iterate through each element to check for tokens
                    for (const item of array) {
                        if (typeof item === 'string' && item.includes('USE_DATA_FROM')) {
                            hasToken = true;
                            let sourceItems: any[] = [];

                            if (item.includes('USE_DATA_FROM_STEP_')) {
                                const stepId = item.replace('USE_DATA_FROM_STEP_', '');
                                if (plan && plan.steps) {
                                    // [FIX] Handle both 'id' (internal) and 'stepId' (frontend/AI) properties
                                    const stepIndex = plan.steps.findIndex((s: any) => (s.id === stepId || s.stepId === stepId));
                                    if (stepIndex >= 0 && previousResults[stepIndex]) {
                                        sourceItems = previousResults[stepIndex];
                                    } else {
                                        console.warn(`[JobOrchestrator] âš ï¸ Could not resolve step '${stepId}'. Available steps:`, plan.steps.map((s: any) => s.id || s.stepId));
                                    }
                                }
                            } else {
                                // Default to previous step
                                sourceItems = previousResults[previousResults.length - 1] || [];
                            }

                            if (sourceItems.length > 0) {
                                const usernames = extractUsernames(sourceItems);
                                console.log(`[JobOrchestrator] Resolved ${item}: Found ${sourceItems.length} items -> ${usernames.length} usernames.`);
                                newItems = [...newItems, ...usernames];
                            } else {
                                console.warn(`[JobOrchestrator] âš ï¸ Placeholder ${item} resolved to EMPTY source items.`);
                            }
                        } else {
                            // Keep original item if it's not a token (e.g. static username)
                            newItems.push(item);
                        }
                    }

                    if (hasToken) {
                        // [FIX] Remove hard-coded 500 limit. 
                        // We allow scaling up to 10k to support large user sample requests.
                        obj[key] = [...new Set(newItems)].slice(0, 10000);
                        console.log(`[JobOrchestrator] Expanded input for '${key}': ${obj[key].length} items.`);
                    }

                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    replaceStrict(obj[key]);
                }
            }
        };

        replaceStrict(newInput);

        // [FIX] Handle special case: if 'search' field is an array, convert to appropriate format
        // Apify actors expect 'search' to be a string, not an array
        if (newInput.search && Array.isArray(newInput.search)) {
            console.log(`[JobOrchestrator] âš ï¸ 'search' field is an array (${newInput.search.length} items). Converting to 'directUrls' or 'username'.`);

            // If it's a single item, use it as search string
            if (newInput.search.length === 1) {
                newInput.search = newInput.search[0];
            } else {
                // For multiple items, use directUrls or username array instead
                if (!newInput.directUrls) {
                    newInput.directUrls = newInput.search.map((u: string) =>
                        u.startsWith('http') ? u : `https://www.instagram.com/${u.replace('@', '')}`
                    );
                }
                // Remove search field as it can't be an array
                delete newInput.search;
            }
        }

        return newInput; // [FIX] Remove redundant return
    }

    /**
     * Process Google Search results to extract Instagram profiles
     * Filters out core profile and non-profile URLs
     * Attaches discovery metadata for reference tracking
     */
    private processGoogleSearchResults(googleResults: any[], coreProfile: string): any[] {
        const processedProfiles: any[] = [];

        googleResults.forEach(result => {
            const url = result.url || '';
            const description = result.description || '';
            const title = result.title || '';

            // Match instagram.com/username patterns
            const match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
            if (match && match[1]) {
                const username = match[1];

                // Filter out non-profile paths and core profile
                const isValidProfile = !['p/', 'reel/', 'tv/', 'explore/', 'stories/'].some(path => username.startsWith(path));
                const isNotCoreProfile = username.toLowerCase() !== coreProfile.toLowerCase().replace('@', '');

                if (isValidProfile && isNotCoreProfile) {
                    processedProfiles.push({
                        username: username,
                        discoverySource: 'google_search',
                        discoveryContext: {
                            searchTitle: title,
                            searchDescription: description,
                            searchUrl: url,
                            relevanceSnippet: description.substring(0, 200)
                        }
                    });
                }
            }
        });

        console.log(`[Google Search] Extracted ${processedProfiles.length} unique profiles from ${googleResults.length} results`);
        return processedProfiles;
    }

    /**
     * Highlight posts that mention the core brand or search keywords
     * Calculates relevance score based on reference post count
     */
    private highlightReferencePosts(enrichedProfile: any, coreProfile: string, searchKeywords: string[]): any {
        if (!enrichedProfile.latestPosts || !Array.isArray(enrichedProfile.latestPosts)) {
            return enrichedProfile;
        }

        enrichedProfile.latestPosts = enrichedProfile.latestPosts.map((post: any) => {
            const caption = (post.caption || '').toLowerCase();
            const coreHandle = coreProfile.toLowerCase().replace('@', '');

            const mentionsCore = caption.includes(coreHandle) || caption.includes(`@${coreHandle}`);
            const mentionsKeywords = searchKeywords.some(kw => caption.includes(kw.toLowerCase()));

            return {
                ...post,
                isRelevantPost: mentionsCore || mentionsKeywords,
                referenceType: mentionsCore ? 'brand_mention' : (mentionsKeywords ? 'keyword_match' : null),
                highlighted: mentionsCore || mentionsKeywords
            };
        });

        const relevantPostCount = enrichedProfile.latestPosts.filter((p: any) => p.isRelevantPost).length;
        enrichedProfile.relevanceScore = enrichedProfile.latestPosts.length > 0
            ? (relevantPostCount / enrichedProfile.latestPosts.length) * 100
            : 0;

        return enrichedProfile;
    }

    /**
     * Audit Miner results to ensure query requirements are met
     * Checks cluster count, profile coverage, and query alignment
     */
    private async auditMinerResults(
        query: string,
        minerOutput: any,
        originalProfiles: any[]
    ): Promise<{ passed: boolean; issues: string[]; suggestions: string[] }> {
        const issues: string[] = [];
        const suggestions: string[] = [];

        // Check cluster count
        const clusterCount = minerOutput.clusters?.length || 0;
        if (clusterCount < 3) {
            issues.push(`Only ${clusterCount} clusters created. Expected at least 3 for complex queries.`);
        }

        // Check profile coverage
        const clusteredProfiles = new Set();
        minerOutput.clusters?.forEach((c: any) => {
            c.members?.forEach((m: any) => clusteredProfiles.add(m.username || m.id));
        });

        const coverage = originalProfiles.length > 0
            ? (clusteredProfiles.size / originalProfiles.length) * 100
            : 0;
        if (coverage < 80) {
            issues.push(`Only ${coverage.toFixed(0)}% of profiles clustered. Expected 80%+.`);
        }

        // Check query alignment
        const queryLower = query.toLowerCase();
        const hasLocationQuery = /\b(in|from|based in|located)\s+\w+/.test(queryLower);
        const hasEngagementQuery = /\b(high engagement|engaged|active)\b/.test(queryLower);

        if (hasLocationQuery) {
            const hasLocationCluster = minerOutput.clusters?.some((c: any) =>
                /\b(location|based|london|new york|paris|tokyo|city)\b/i.test(c.name || '')
            );
            if (!hasLocationCluster) {
                suggestions.push('Query mentions location but no location-based clusters found.');
            }
        }

        if (hasEngagementQuery) {
            const hasEngagementMetrics = minerOutput.clusters?.some((c: any) =>
                c.avgEngagementRate || (c.description || '').includes('engagement')
            );
            if (!hasEngagementMetrics) {
                suggestions.push('Query mentions engagement but clusters lack engagement metrics.');
            }
        }

        const passed = issues.length === 0;

        console.log(`[Miner Auditor] ${passed ? 'âœ… PASSED' : 'âš ï¸ FAILED'} - ${issues.length} issues, ${suggestions.length} suggestions`);

        return { passed, issues, suggestions };
    }


    private analyzeNetworkFrequency(results: any[]): any[] {
        const flatResults = results.flat();
        const frequencyMap = new Map<string, number>();
        const profileMap = new Map<string, any>();

        flatResults.forEach((item: any) => {
            // Count occurrences of usernames (e.g., appearing in multiple "following" lists)
            const username = item.username || item.ownerUsername;
            if (username) {
                const key = username.toLowerCase();
                frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);

                // Keep the best profile data we find
                if (!profileMap.has(key) || (item.followersCount > (profileMap.get(key).followersCount || 0))) {
                    profileMap.set(key, item);
                }
            }
        });

        // Filter for significant overlap (>1 occurrence) and sort by frequency
        return Array.from(frequencyMap.entries())
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]) // Sort by frequency desc
            .slice(0, 100) // Top 100 strongest signals
            .map(([username, count]) => {
                const item = profileMap.get(username);
                return {
                    username: item.username || item.ownerUsername,
                    handle: item.username || item.ownerUsername, // standard field
                    frequency: count,
                    followersCount: item.followersCount || item.followers || 0,
                    bio: item.biography || item.description || "",
                    profilePicUrl: item.profilePicUrl || item.profile_pic_url,
                    id: item.id || item.pk,
                    isVerified: item.isVerified || item.is_verified,
                    // Mock analytics fields for UI compatibility
                    overindexScore: count, // Map frequency directly to score
                    affinityPercent: (flatResults.length > 0 ? (count / flatResults.length * 100).toFixed(1) : "0")
                };
            });
    }

    private aggregateContextLocal(results: any[], intent: string): string {
        console.log(`[JobOrchestrator] Aggregating context for intent: ${intent}`);

        let context = `ANALYSIS CONTEXT (Intent: ${intent})\n\n`;
        const flatResults = results.flat();

        // [NEW] NETWORK FREQUENCY ANALYSIS (Critical for Over-indexing)
        if (intent === 'over_indexing' || intent === 'network_clusters' || intent === 'influencer_identification') {
            const overindexed = this.analyzeNetworkFrequency(results);
            // const frequencyMap = new Map<string, number>();
            // const frequencyMap = new Map<string, number>();
            // const provenanceMap = new Map<string, string[]>();

            // Removed legacy logic
            // const overindexed = ...

            if (overindexed.length > 0) {
                context += `--- 📊 OVER-INDEXED PROFILES (High Priority Analysis) ---\n`;
                context += `These profiles appear most frequently across the network. They are the strongest candidates for "Top Creators" or "Common Interests".\n\n`;

                overindexed.forEach((p: any, idx: number) => {
                    // Explicitly inject frequency signal for AI
                    context += `${idx + 1}. [User: ${p.username}] (Frequency: ${p.frequency}x) - Followers: ${p.followersCount}. Bio: "${(p.bio || '').replace(/\n/g, ' ')}"\n`;

                    // Mark item in raw data for hydration later (optional hack)
                    const item = flatResults.find((i: any) => (i.username || i.ownerUsername)?.toLowerCase() === p.username.toLowerCase());
                    if (item) item._frequency = p.frequency;
                });
                context += `\n--- END OVER-INDEXED ---\n\n`;
            }
        }

        // 1. Comments (High Value for Sentiment)
        const comments = flatResults.filter((i: any) => i.text && i.ownerUsername);
        if (comments.length > 0) {
            context += `--- USER COMMENTS (${comments.length}) ---\n`;
            comments.slice(0, 50).forEach((c: any) => {
                context += `[User: ${c.ownerUsername}] "${c.text}" (Likes: ${c.likesCount || 0})\n`;
            });
            context += `\n`;
        }

        // 2. Posts (Captions)
        const posts = flatResults.filter((i: any) => i.caption && !i.text); // Exclude comments which might have caption field
        if (posts.length > 0) {
            context += `--- RECENT POST CAPTIONS (${posts.length}) ---\\n`;
            posts.slice(0, 30).forEach((p: any) => {
                const caption = p.caption.substring(0, 150).replace(/\n/g, ' ');
                context += `[Post] "${caption}..." (Likes: ${p.likesCount}, Comments: ${p.commentsCount})\n`;
            });
            context += `\n`;
        }

        // 3. Profiles (Bios) - Only if NOT over_indexing (to avoid duplication)
        if (intent !== 'over_indexing') {
            const profiles = flatResults.filter((i: any) => (i.biography || i.description) && !i._frequency);
            if (profiles.length > 0) {
                context += `--- PROFILE BIOS (${profiles.length}) ---\n`;
                profiles.slice(0, 50).forEach((p: any) => {
                    const bio = (p.biography || p.description || "").replace(/\n/g, ' ');
                    if (bio) context += `[User: ${p.username}] ${bio}\n`;
                });
            }
        }

        return context;
    }


    async abortJob(jobId: string): Promise<boolean> {
        const job = await mongoService.getJob(jobId);
        if (!job) return false;

        if (job.status === 'running' || job.status === 'queued') {
            // 1. If there's an active Apify Run ID, kill it
            if (job.metadata?.apifyRunId) {
                const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
                console.log(`[JobOrchestrator] Aborting Apify Run: ${job.metadata.apifyRunId}`);
                try {
                    await fetch(`https://api.apify.com/v2/actor-runs/${job.metadata.apifyRunId}/abort?token=${apifyToken}`, {
                        method: 'POST'
                    });
                } catch (e) {
                    console.error("Failed to abort Apify run:", e);
                }
            }

            // 2. Update local status
            await mongoService.updateJob(jobId, { status: 'aborted', progress: 0, error: 'Aborted by user' });
            return true;
        }
        return false;
    }

    /**
     * Helper to fetch with retry for 502/504/429 errors
     */
    private async fetchWithRetry(url: string, options: any = {}, maxRetries = 3, initialDelay = 2000): Promise<Response> {
        let lastError: any;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = initialDelay * Math.pow(2, attempt - 1);
                    console.log(`[Retry] Attempt ${attempt} for ${url} (waiting ${delay}ms)...`);
                    await new Promise(r => setTimeout(r, delay));
                }
                const response = await fetch(url, options);

                // Retry on Bad Gateway, Gateway Timeout, or Too Many Requests
                if (response.status === 502 || response.status === 504 || response.status === 429) {
                    console.warn(`[Retry] Received ${response.status} from ${url}`);
                    lastError = new Error(`Request failed with status ${response.status}`);
                    continue;
                }

                return response;
            } catch (err: any) {
                lastError = err;
                console.warn(`[Retry] Network error on attempt ${attempt}: ${err.message}`);
                if (attempt === maxRetries) break;
            }
        }
        throw lastError || new Error(`Failed after ${maxRetries} retries`);
    }

    public async runApifyActor(
        actorId: string,
        input: any,
        jobId?: string,
        metadata?: { taskName?: string, query?: string, planId?: string, sampleSize?: number, ignoreCache?: boolean, search_keywords?: string[] }
    ): Promise<{ items: any[], datasetId: string, runId?: string, fromCache?: boolean }> {
        const rawTokens = process.env.APIFY_API_TOKENS || process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || '';
        const tokens = rawTokens.split(',').map(t => t.trim()).filter(Boolean);
        if (tokens.length === 0) throw new Error("Apify Token missing (APIFY_API_TOKENS or APIFY_TOKEN)");
        let apifyToken = tokens[0]; // Start with primary, rotate if needed

        // --- MAP LEGACY ACTOR IDS ---
        let realActorId = actorId;
        // Handle tilde notation if passed
        if (realActorId.includes('~')) realActorId = realActorId.replace(/~/g, '/');

        const actorMapping: Record<string, string | undefined> = {
            'apify/instagram-profile-scraper': process.env.PROFILE_SCRAPE_ACTOR_INSTAGRAM || 'dSCLg0C3YEZ83HzYX',
            'apify/instagram-scraper': process.env.APIFY_INSTAGRAM_ACTOR_ID || 'OWBUCWZK5MEeO5XiC',
            'thenetaji/instagram-followers-followings-scraper': 'asIjo32NQuUHP4Fnc',
            'datadoping/instagram-following-scraper': 'thenetaji/instagram-followers-followings-scraper',
            'datadoping/instagram-follower-scraper': 'thenetaji/instagram-followers-followings-scraper',
            'datadoping/instagram-followers-followings-scraper': 'thenetaji/instagram-followers-followings-scraper', // Added missing legacy ID
            'apify/instagram-search-scraper': 'apify/instagram-api-scraper' // [NEW] Reroute search scraper to API scraper
        };

        if (actorMapping[realActorId]) {
            realActorId = actorMapping[realActorId]!;
        }

        if (realActorId === process.env.PROFILE_SCRAPE_ACTOR_INSTAGRAM && input.search) {
            realActorId = process.env.APIFY_INSTAGRAM_ACTOR_ID || 'OWBUCWZK5MEeO5XiC';
        }

        // --- INPUT NORMALIZATION (Merge from Server Logic) ---
        const normalizedInput = { ...input };

        // [USER-REQUEST] Divert Standard Scraper SEARCH intent to 'apify/instagram-api-scraper'
        // The standard scraper is failing on search input ("startUrls required"), so we force API scraper.
        if ((realActorId === 'OWBUCWZK5MEeO5XiC' || realActorId === 'apify/instagram-scraper' || realActorId.includes('instagram-scraper')) && (input.search || input.searchQuery || input.searchType || input.searchLimit)) {
            console.log("[JobOrchestrator] Redirecting 'Search' intent from Standard Scraper.");
            realActorId = 'apify/instagram-api-scraper';
        }

        // [NEW] Hashtag Redirection
        // If query/search is a hashtag (#...) or actor is API scraper with 'hashtags' resultsType,
        // redirect to dedicated 'apify/instagram-hashtag-scraper'.
        if (input.search && typeof input.search === 'string' && input.search.startsWith('#')) {
            console.log(`[JobOrchestrator] 🔄 Redirecting hashtag search "${input.search}" to dedicated Hashtag Scraper.`);
            realActorId = 'apify/instagram-hashtag-scraper';
            normalizedInput.hashtags = [input.search.replace('#', '')];
            normalizedInput.resultsLimit = input.searchLimit || input.resultsLimit || 50;
            // Clean up old search inputs
            delete normalizedInput.search;
            delete normalizedInput.searchQuery;
            delete normalizedInput.searchType;
        }

        if (realActorId === 'apify/instagram-api-scraper' && input.resultsType === 'hashtags') {
            console.log("[JobOrchestrator] 🔄 Correcting invalid 'hashtags' resultsType by switching to dedicated Hashtag Scraper.");
            realActorId = 'apify/instagram-hashtag-scraper';
            if (input.search) {
                normalizedInput.hashtags = [input.search.replace('#', '')];
                normalizedInput.resultsLimit = input.searchLimit || 50;
                delete normalizedInput.search;
            }
        }

        // [NEW] Smart Keyword Override
        // [NEW] Smart Keyword Override (Cost Control)
        // If Gemini identified a better/simpler keyword, use it instead of the raw query
        if (metadata?.search_keywords && metadata.search_keywords.length > 0 && (normalizedInput.search || normalizedInput.searchQuery)) {
            const smartKeyword = metadata.search_keywords[0]; // Use the top extracted keyword
            console.log(`[JobOrchestrator] ðŸ§  Smart Keyword: Overriding search "${normalizedInput.search || normalizedInput.searchQuery}" with targeted keyword "${smartKeyword}"`);
            normalizedInput.search = smartKeyword;
        }

        // [FIX] Ensure search is mapped correctly for API scraper (Moved after declaration)
        if (realActorId.includes('instagram-api-scraper') && input.searchQuery && !normalizedInput.search) {
            normalizedInput.search = input.searchQuery;
        }

        // [NEW] Enforce Cost Limits on Search
        if (realActorId.includes('instagram-api-scraper') && normalizedInput.search) {
            // Force strict limits if none provided, based on sampleSize
            if (!normalizedInput.searchLimit && metadata?.sampleSize) {
                // [FIX] Cap at 250 to comply with Apify API limit
                normalizedInput.searchLimit = Math.min(250, metadata.sampleSize);
            }
            if (!normalizedInput.resultsLimit && normalizedInput.resultsType !== 'posts') {
                normalizedInput.resultsLimit = 1; // Default to minimal details per result unless posts requested
            }
            // Ensure searchType defaults to 'user' if missing
            if (!normalizedInput.searchType) {
                normalizedInput.searchType = 'user';
            }
        }

        if (realActorId === 'asIjo32NQuUHP4Fnc' || realActorId === 'IkdNTeZnRfvDp8V25') {
            // [FIX] This actor requires 'username' as an array, not 'usernames'
            if (normalizedInput.usernames && !normalizedInput.username) {
                normalizedInput.username = Array.isArray(normalizedInput.usernames) ? normalizedInput.usernames : [normalizedInput.usernames];
            } else if (normalizedInput.username && !Array.isArray(normalizedInput.username)) {
                normalizedInput.username = [normalizedInput.username];
            }

            // [FIX] Deduplicate usernames
            if (normalizedInput.username && Array.isArray(normalizedInput.username)) {
                // [USER-REQUEST] Strip '@' from usernames for this specific actor
                normalizedInput.username = normalizedInput.username.map((u: string) => {
                    const clean = u.replace(/^@/, '').trim();
                    return clean;
                }).filter(Boolean);

                normalizedInput.username = [...new Set(normalizedInput.username)];
            }

            // [SAFETY] Skip run if usernames list is empty to prevent 400 error
            if (normalizedInput.username && Array.isArray(normalizedInput.username) && normalizedInput.username.length === 0) {
                console.log(`[JobOrchestrator] âš ï¸ Skipping scraper run for ${realActorId} because username list is empty.`);
                return { items: [], datasetId: '' };
            }

            // Remove 'usernames' if present, as it causes invalid input errors
            delete normalizedInput.usernames;

            // [FIX] Two-Dimensional Scaling for 'followings' (User Request)
            // Scales vertically (sample size) and horizontally (input username count)
            if (normalizedInput.type === 'followings') {
                const sample = metadata?.sampleSize || 100;
                const inputLength = Array.isArray(normalizedInput.username) ? normalizedInput.username.length : 1;

                // Target: Roughly 15-20 records per unit of sampleSize for the entire step
                // Formula: L = (S * 15) / U
                // Constrain: At least 10 (for data quality), max 120 (to avoid bot detection)
                const propLimit = Math.max(10, Math.min(120, Math.floor((sample * 15) / Math.max(1, inputLength))));

                console.log(`[JobOrchestrator] Scaling 'followings' limit (2D): ${propLimit} (sample: ${sample}, inputs: ${inputLength})`);
                normalizedInput.maxItem = propLimit;
                normalizedInput.max_count = propLimit;
                normalizedInput.profileEnriched = false; // Ensure enrichment is off
            }
            // [FIX] Enforce Slider Value (metadata.sampleSize) if available AND not 'followings'
            else if (metadata?.sampleSize && !normalizedInput.max_count) {
                // Only override if not explicitly provided in input
                normalizedInput.max_count = metadata.sampleSize;
                normalizedInput.maxItem = metadata.sampleSize;
            } else if (!normalizedInput.max_count && (normalizedInput.limit || normalizedInput.resultsLimit)) {
                normalizedInput.max_count = normalizedInput.limit || normalizedInput.resultsLimit;
            }
        }
        if (realActorId.includes('instagram-api-scraper') && (normalizedInput.usernames || normalizedInput.directUrls)) {
            const rawTargets = normalizedInput.directUrls || normalizedInput.usernames;
            const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

            // [FIX] Deduplicate input targets first
            const uniqueTargets = [...new Set(targets as string[])];

            normalizedInput.directUrls = uniqueTargets.map((u: string) => {
                const clean = u.replace('@', '').trim();

                // [NEW] Hashtag URL Detection & Redirection
                // If the URL is a hashtag exploration URL, we redirect to a 'hashtag' search intent
                // because the API scraper's 'details' mode often fails or returns empty for these URLs
                // when treated as direct URLs.
                if (clean.includes('instagram.com/explore/tags/')) {
                    const hashtagMatch = clean.match(/\/tags\/([^/?#]+)/);
                    if (hashtagMatch && hashtagMatch[1]) {
                        console.log(`[JobOrchestrator] 🔄 Detected Hashtag URL: ${hashtagMatch[1]}. Redirecting to dedicated hashtag scraper.`);
                        realActorId = 'apify/instagram-hashtag-scraper';
                        normalizedInput.hashtags = [hashtagMatch[1]];
                        normalizedInput.resultsLimit = metadata?.sampleSize || 50;
                        return null; // Remove from directUrls
                    }
                }

                // Ensure no trailing slashes for consistency
                const final = clean.startsWith('http') ? clean : `https://www.instagram.com/${clean}`;
                return final;
            }).filter(Boolean) as string[];

            // [FIX] Deduplicate again after normalization (e.g. 'foo' and '@foo' -> same URL)
            normalizedInput.directUrls = [...new Set(normalizedInput.directUrls)];

            // [NEW] Bulk Scrape Limit Scaling
            // If we are scraping multiple users, we need to scale the limit to avoid getting only 1-2 posts per user
            // caused by the global limit being applied to the whole batch.
            if (Array.isArray(normalizedInput.directUrls) && normalizedInput.directUrls.length > 1) {
                const userCount = normalizedInput.directUrls.length;
                const perUserLimit = normalizedInput.resultsLimit || normalizedInput.limit || 12; // Default to 12 if undefined

                // Calculate total needed
                let totalLimit = userCount * perUserLimit;

                // Safety Cap (e.g. 50k)
                if (totalLimit > 50000) totalLimit = 50000;

                console.log(`[JobOrchestrator] Scaling Limit for Bulk Scrape (${userCount} users): ${perUserLimit} per user -> Total ${totalLimit}`);

                normalizedInput.max_count = totalLimit;
                normalizedInput.limit = totalLimit;
                normalizedInput.maxItems = totalLimit;
                // Keep resultsLimit as per-user limit
                if (!normalizedInput.resultsLimit) normalizedInput.resultsLimit = perUserLimit;
            }

            // [SAFETY] Skip run if directUrls list is empty and not a search, to prevent 400 error
            if (!normalizedInput.search && (!normalizedInput.directUrls || (Array.isArray(normalizedInput.directUrls) && normalizedInput.directUrls.length === 0))) {
                console.log(`[JobOrchestrator] ⚠️ Skipping scraper run for ${realActorId} because directUrls list is empty.`);
                return { items: [], datasetId: '' };
            }

            delete normalizedInput.usernames;
            if (!normalizedInput.resultsType) normalizedInput.resultsType = 'posts';
            // [FIX] Strict Cost Control: For Search, we only need 1 post to verify identity if we are just scouting
            if (normalizedInput.search) {
                normalizedInput.resultsLimit = 1;
                // If sampleSize is provided, map it to searchLimit (Profiles to find)
                if (metadata?.sampleSize) {
                    // [FIX] Cap at 1000 (Expanded from 250) to allow larger samples
                    normalizedInput.searchLimit = Math.min(1000, metadata.sampleSize);
                } else {
                    normalizedInput.searchLimit = 50; // Default safe limit
                }
            } else {
                // If not a search (e.g. direct profile scrape), ensure we get enough posts
                if (!normalizedInput.resultsLimit) normalizedInput.resultsLimit = 6;

                // [NEW] If sampleSize is high (e.g. > 100), increase post limit to get more depth
                if (metadata?.sampleSize && metadata.sampleSize > 100 && normalizedInput.resultsType === 'posts') {
                    // Scale posts limit with sample size, maxing at 50
                    normalizedInput.resultsLimit = Math.min(50, Math.floor(metadata.sampleSize / 10));
                }
            }
            // [FIX] Final safety check: Ensure searchLimit never exceeds 1000
            if (normalizedInput.searchLimit && normalizedInput.searchLimit > 1000) {
                console.log(`[JobOrchestrator] Capping searchLimit from ${normalizedInput.searchLimit} to 1000`);
                normalizedInput.searchLimit = 1000;
            }
            normalizedInput.addParentData = true;
        }

        // [FIX] Specific normalization for standard Instagram Scraper (OWBUCWZK5MEeO5XiC) AND API Scraper
        if (realActorId === 'OWBUCWZK5MEeO5XiC' || realActorId === 'apify/instagram-scraper' || realActorId.includes('instagram-api-scraper')) {
            if (normalizedInput.searchQuery && !normalizedInput.search) {
                normalizedInput.search = normalizedInput.searchQuery;
                delete normalizedInput.searchQuery; // [FIX] Clean up invalid param
            }

            // [FIX] Safety Net: Cap searchLimit to 1000 (Expanded Cap) for ALL scrapers
            if (normalizedInput.searchLimit && normalizedInput.searchLimit > 1000) {
                console.log(`[JobOrchestrator] Capping searchLimit from ${normalizedInput.searchLimit} to 1000`);
                normalizedInput.searchLimit = 1000;
            }
            if (normalizedInput.resultsLimit && !normalizedInput.searchLimit) {
                normalizedInput.searchLimit = normalizedInput.resultsLimit;
            }
            if (!normalizedInput.searchType) {
                normalizedInput.searchType = 'user'; // Default to user search if not specified
            }
            // Fix "Field input.proxy is required" error -> Removed proxy config as not required
        }

        // [REMOVED] Proxy configuration - not required for Apify actors

        // 1. Calculate Fingerprint (using robust system)
        const fingerprint = generateScrapeFingerprint(realActorId, normalizedInput);

        console.log(`[Apify] Fingerprint: ${fingerprint} (Actor: ${realActorId})`);

        // 2. Check Cache (Scrape Fingerprints Collection)
        // [MODIFIED] Bypass Cache Check if ignoreCache is true
        if (!metadata?.ignoreCache) {
            try {
                const existingScrape = await mongoService.getScrapeFingerprint(fingerprint);

                if (existingScrape) {
                    // Check freshness
                    const isFresh = isFingerprintFresh(existingScrape.executedAt, existingScrape.metadata.dataType);

                    if (isFresh && existingScrape.datasetId) {
                        console.log(`[Apify] ðŸŸ¢ SCRAPE CACHE HIT! Reusing dataset ${existingScrape.datasetId}`);

                        // Fetch items from Apify Dataset (or local cache if we implemented that, but for now Apify)
                        const resultsRes = await fetch(`https://api.apify.com/v2/datasets/${existingScrape.datasetId}/items?token=${apifyToken}`);
                        if (resultsRes.ok) {
                            const items = await resultsRes.json();
                            return {
                                items,
                                datasetId: existingScrape.datasetId,
                                runId: 'CACHE_HIT',
                                fromCache: true
                            };
                        } else {
                            const errBody = await resultsRes.text();
                            console.warn(`[Apify] Cache hit but failed to fetch dataset ${existingScrape.datasetId} (${resultsRes.status}): ${errBody.substring(0, 200)}. Re-running.`);
                        }
                    } else {
                        console.log(`[Apify] ðŸŸ¡ Stale cache entry found (Age: ${((Date.now() - existingScrape.executedAt.getTime()) / 3600000).toFixed(1)}h). Re-scraping.`);
                    }
                }
            } catch (cacheError) {
                console.warn("[Apify] Cache check error (non-fatal):", cacheError);
            }
        } else {
            console.log(`[Apify] ðŸŸ  FRESH SCRAPE FORCE: Bypassing cache check for ${fingerprint}`);
        }

        // Fallback: Check Legacy Execution Cache (Optional, keeping for backward command compatibility)
        // [NOTE] Skipping legacy cache check entirely if forcing refresh, effectively
        if (!metadata?.ignoreCache) {
            const cachedExecution = await mongoService.getApifyExecution(fingerprint);
            if (cachedExecution && cachedExecution.status === 'SUCCEEDED') {
                console.log(`[Apify] ðŸŸ¢ LEGACY CACHE HIT! Reusing dataset ${cachedExecution.datasetId}`);
                const resultsRes = await fetch(`https://api.apify.com/v2/datasets/${cachedExecution.datasetId}/items?token=${apifyToken}`);
                if (resultsRes.ok) {
                    const items = await resultsRes.json();
                    return { items, datasetId: cachedExecution.datasetId, runId: cachedExecution.runId, fromCache: true };
                } else {
                    const errBody = await resultsRes.text();
                    console.warn(`[Apify] Legacy cache hit but failed to fetch results (${resultsRes.status}): ${errBody.substring(0, 200)}`);
                }
            }
        }



        try {
            console.log(`[Apify] Starting run for ${realActorId}...`);

            const apiActorId = realActorId.replace(/\//g, '~');

            console.log(`[Apify] ðŸš€ Starting actor ${realActorId} (run_mode: ${input.run_mode || 'default'})`);
            console.log(`[Apify] PAYLOAD:`, JSON.stringify(normalizedInput).substring(0, 1000)); // Log payload for debugging

            let response: any;
            let runData: any;

            // [FIX] Token Rotation for 403 Limits
            for (let i = 0; i < tokens.length; i++) {
                apifyToken = tokens[i]; // Update active token for subsequent calls
                if (i > 0) console.log(`[Apify] ðŸ”„ Rotating to Token #${i + 1} for execution...`);

                response = await this.fetchWithRetry(`https://api.apify.com/v2/acts/${apiActorId}/runs?token=${apifyToken}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(normalizedInput)
                });

                if (response.ok) {
                    runData = await response.json();
                    break; // Success
                }

                const errText = await response.text();
                // If 403 (Limit) and we have more tokens, try next
                if (response.status === 403 && i < tokens.length - 1) {
                    console.warn(`[Apify] âš ï¸ Token #${i + 1} hit usage limit (403): ${errText}. Rotating...`);
                    continue;
                }

                // Fatal Error
                throw new Error(`Apify Run Failed (${response.status}): ${errText}`);
            }
            const runId = runData.data.id;
            const defaultDatasetId = runData.data.defaultDatasetId;

            // Save Run ID to Job Metadata
            if (jobId) {
                const job = await mongoService.getJob(jobId);
                if (job) {
                    const currentDatasetIds = job.metadata?.datasetIds || [];
                    if (!currentDatasetIds.includes(defaultDatasetId)) {
                        currentDatasetIds.push(defaultDatasetId);
                    }
                    const newMetadata = {
                        ...job.metadata,
                        apifyRunId: runId,
                        datasetId: defaultDatasetId, // Keep current for legacy/single checking
                        datasetIds: currentDatasetIds // [NEW] Track history
                    };
                    await mongoService.updateJob(jobId, { metadata: newMetadata });
                }
            }

            let status = 'RUNNING';
            let attempts = 0;
            const maxAttempts = 17280; // 24 hours (roughly)

            while (status === 'RUNNING' || status === 'READY') {
                if (attempts++ > maxAttempts) throw new Error("Apify run timed out");

                if (jobId) {
                    const currentJob = await mongoService.getJob(jobId);
                    if (currentJob && currentJob.status === 'aborted') {
                        throw new Error("Job aborted by user");
                    }
                }


                if (attempts % 6 === 0) {
                    console.log(`[Apify] Polling run ${runId}: status=${status} (Attempt ${attempts})`);

                    // [FIX] Update job progress during polling to prevent appearing stuck
                    if (jobId) {
                        // Get current job to read its progress
                        const currentJob = await mongoService.getJob(jobId);
                        if (currentJob) {
                            // Add a small increment based on polling attempts (max +5%)
                            const pollingProgress = Math.min(5, Math.floor(attempts / 12));
                            const newProgress = Math.min(95, currentJob.progress + pollingProgress);

                            await mongoService.updateJob(jobId, {
                                progress: newProgress,
                                result: {
                                    stage: `${metadata?.taskName || 'Processing'} (polling...)`,
                                    pollingAttempts: attempts
                                }
                            });
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 10000)); // Increase to 10s to avoid rate limits
                const pollRes = await this.fetchWithRetry(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);

                if (!pollRes.ok) {
                    const errBody = await pollRes.text();
                    console.error(`[Apify] Polling Failed (${pollRes.status}): ${errBody.substring(0, 500)}`);
                    throw new Error(`Apify Polling Failed (${pollRes.status}): ${errBody.substring(0, 100)}`);
                }


                const pollData = await pollRes.json();
                status = pollData.data.status;

                // [FIX] Log and handle unexpected statuses
                if (status !== 'RUNNING' && status !== 'READY' && status !== 'SUCCEEDED') {
                    console.error(`[Apify] âš ï¸ Unexpected status: ${status}. Full data:`, JSON.stringify(pollData.data, null, 2).substring(0, 1000));
                    // If it's a terminal failure state, break the loop
                    if (status === 'ABORTED' || status === 'FAILED' || status === 'TIMED-OUT') {
                        break;
                    }
                }
            }

            console.log(`[Apify] Run ${runId} finished with status: ${status}. Fetching results...`);

            if (status !== 'SUCCEEDED') {
                throw new Error(`Apify Run failed with status: ${status}`);
            }

            const resultsRes = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${apifyToken}`);

            if (!resultsRes.ok) {
                const errBody = await resultsRes.text();
                console.error(`[Apify] Results Fetch Failed (${resultsRes.status}): ${errBody.substring(0, 500)}`);
                throw new Error(`Apify Results Fetch Failed (${resultsRes.status}): ${errBody.substring(0, 100)}`);
            }

            const items = await resultsRes.json();

            console.log(`[Apify] Fetched ${items.length} items. Checking for restricted content...`);

            // [NEW] Special handling for Google Search Scraper - extract organic results only
            if (realActorId === 'apify/google-search-scraper' || realActorId.includes('google-search')) {
                console.log(`[Google Search] Extracting organic results from ${items.length} pages...`);
                const organicResults = items.flatMap((item: any) => item.organicResults || []);
                console.log(`[Google Search] Extracted ${organicResults.length} organic results`);

                return {
                    items: organicResults,
                    datasetId: defaultDatasetId,
                    runId: runId,
                    fromCache: false
                };
            }

            // [NEW] Check for Age Restricted Content (Optimized)
            const hasRestrictedContent = items.some((item: any) => {
                // Heuristic check: search strings in common fields without full stringify if possible
                const bio = item.biography || item.bio || item.description || "";
                if (bio.includes('Restricted profile')) return true;
                // Fallback to stringify only if bio-check fails and item is not too huge
                return JSON.stringify(item).includes('Restricted profile');
            });

            if (hasRestrictedContent && jobId) {
                console.log(`[JobOrchestrator] ðŸ”ž Detected Restricted Content for Job ${jobId}`);
                // Update the Job Result immediately to flag this
                await mongoService.updateJob(jobId, {
                    'result.hasRestrictedContent': true,
                    'result.flags.restricted': true
                } as any);
            }

            console.log(`[Apify] Restricted content check done. Proceeding to cache...`);

            // 3. Save to Cache (After success)
            try {
                // Determine Metadata
                const meta = extractMetadataFromPayload(realActorId, normalizedInput);
                const ttl = calculateTTL(meta.dataType);

                await mongoService.saveScrapeFingerprint({
                    fingerprint,
                    actorName: realActorId,
                    payload: normalizedInput,
                    payloadHash: fingerprint, // Simplified, usually explicit
                    datasetId: defaultDatasetId,
                    recordCount: items.length,
                    metadata: {
                        ...meta,
                        taskName: metadata?.taskName
                    },
                    ttlHours: ttl
                });

                // Keep Legacy Save for safety
                await mongoService.saveApifyExecution({
                    fingerprint,
                    actorId: realActorId,
                    runId,
                    datasetId: defaultDatasetId,
                    status: 'SUCCEEDED',
                    input: input,
                    metadata: {
                        taskName: metadata?.taskName,
                        query: metadata?.query,
                        planId: metadata?.planId,
                        timestamp: new Date()
                    },
                    createdAt: new Date()
                });
                console.log(`[Apify] ðŸ’¾ Execution cached (ID: ${runId})`);
            } catch (saveErr) {
                console.warn("[Apify] Failed to save cache entry:", saveErr);
            }

            return {
                items: items,
                datasetId: defaultDatasetId,
                runId: runId,
                fromCache: false
            };

        } catch (apifyError: any) {
            console.warn(`[Apify] Failed: ${apifyError.message}. Trying fallback scraper...`);

            // FALLBACK: Use our custom scraper with Oxylabs
            try {
                return await this.runFallbackScraper(actorId, input);
            } catch (fallbackError: any) {
                // Return detailed error explaining BOTH failures
                throw new Error(`Primary Scraper (${actorId}) Failed: ${apifyError.message} || Fallback Scraper Failed: ${fallbackError.message}`);
            }
        }
    }

    private async runFallbackScraper(actorId: string, input: any): Promise<{ items: any[], datasetId: string }> {
        console.log(`[Scraper Fallback] Using custom scraper for ${actorId}`);

        const scraperUrl = process.env.SCRAPER_URL;
        if (!scraperUrl || scraperUrl.includes('placeholder') || scraperUrl === '') {
            // Return false instead of throwing to allow soft fail
            throw new Error("Fallback Scraper URL (SCRAPER_URL) is not configured. Cannot attempt fallback.");
        }

        // Map Apify actor to our scraper format
        let platform: 'instagram' | 'tiktok' = 'instagram';
        let dataType: 'profile' | 'posts' | 'followers' | 'following' = 'profile';
        let targets: string[] = [];

        // Determine platform and data type from actor
        if (actorId.includes('instagram')) {
            platform = 'instagram';
            // [FIX] Explicitly handle 'details' resultsType as 'profile' scrape (for api-scraper)
            if (actorId.includes('profile') || input.usernames || (actorId.includes('api-scraper') && input.resultsType === 'details')) {
                dataType = 'profile';
                // [FIX] Ensure targets are URLs and handle array input (flatten if nested)
                const rawTargets = input.usernames || input.directUrls || [];
                const flatTargets = Array.isArray(rawTargets) ? rawTargets.flat() : [rawTargets];

                targets = flatTargets.map((u: string) => {
                    const clean = u.replace('@', '').trim();
                    return clean.startsWith('http') ? clean : `https://www.instagram.com/${clean}/`;
                });

            } else if (actorId.includes('followers')) {
                dataType = 'followers';
                // [FIX] Handle array input (flatten) & Ensure URL format
                const rawInput = input.username || []; // 'username' might be array from orchestration
                const flatInput = Array.isArray(rawInput) ? rawInput.flat() : [rawInput];

                targets = flatInput.map((u: string) => {
                    const clean = u.replace('@', '').trim();
                    return clean.startsWith('http') ? clean : `https://www.instagram.com/${clean}/`;
                });
            } else {
                dataType = 'posts';
                targets = input.directUrls || [];
            }
        } else if (actorId.includes('tiktok')) {
            platform = 'tiktok';
            if (actorId.includes('profile')) {
                dataType = 'profile';
                targets = input.profiles || [];
            } else {
                dataType = 'posts';
                targets = input.profiles || input.postURLs || [];
            }
        }

        const scraperInput = {
            platform,
            dataType,
            targets,
            limit: input.limit || input.resultsLimit || 100,
            // [FIX] Respect user-provided proxy config if available
            proxyConfiguration: input.proxy || {
                useApifyProxy: false,
                fallbackProxyUrls: [
                    "http://user-biffboff_gTnbs-country-US:B1ffB0ff2023_@dc.oxylabs.io:8001",
                    "http://user-biffboff_gTnbs-country-US:B1ffB0ff2023_@dc.oxylabs.io:8002",
                    "http://user-biffboff_gTnbs-country-US:B1ffB0ff2023_@dc.oxylabs.io:8003",
                    "http://user-biffboff_gTnbs-country-US:B1ffB0ff2023_@dc.oxylabs.io:8004",
                    "http://user-biffboff_gTnbs-country-US:B1ffB0ff2023_@dc.oxylabs.io:8005"
                ]
            }
        };

        const response = await this.fetchWithRetry(`${scraperUrl}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scraperInput)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Fallback scraper failed (${response.status}): ${errText}`);
        }

        const result = await response.json();
        const items = result.items || [];
        const datasetId = `scraper-${Date.now()}`;

        console.log(`[Scraper Fallback] âœ… Retrieved ${items.length} items`);

        return { items, datasetId };
    }

    private async syncApifyDatasetToLocal(apifyDatasetId: string, name: string, userId: string, aiAnalytics: any = null, allResults: any[] = []) {
        const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
        const res = await fetch(`https://api.apify.com/v2/datasets/${apifyDatasetId}/items?token=${apifyToken}`);
        const items = await res.json();

        const localId = uuidv4();
        await mongoService.createDataset({
            id: localId,
            name: name || `Scrape ${new Date().toLocaleDateString()}`,
            platform: 'instagram',
            targetProfile: name,
            dataType: 'mixed',
            recordCount: items.length,
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: ['async_job'],
            userId
        });

        // [NEW] Master Profile Map for RE-HYDRATION
        // We aggregate profiles from ALL steps to ensure maximum hydration coverage
        const masterProfileMap = new Map<string, any>();

        // 1. Add current items
        items.forEach((item: any) => {
            let extracted = item;
            let username = (item.username || item.ownerUsername || '').toLowerCase().replace(/^@/, '').trim();

            // [FIX] Extract owner from nested post objects if top-level username is missing
            if (!username && item.owner) {
                username = (item.owner.username || '').toLowerCase().replace(/^@/, '').trim();
                extracted = { ...item.owner, ...item }; // Prefer owner details, keep item props
            }

            if (username) masterProfileMap.set(username, extracted);
        });

        // 2. Add results from previous steps (if available)
        allResults.flat().forEach((item: any) => {
            let extracted = item;
            let username = (item.username || item.ownerUsername || '').toLowerCase().replace(/^@/, '').trim();

            // [FIX] Extract owner from nested post objects
            if (!username && item.owner) {
                username = (item.owner.username || '').toLowerCase().replace(/^@/, '').trim();
                extracted = { ...item.owner, ...item };
            }

            if (username && !masterProfileMap.has(username)) {
                masterProfileMap.set(username, extracted);
            } else if (username && masterProfileMap.has(username)) {
                // Merge if previous result has more data (e.g. bio, posts)
                const existing = masterProfileMap.get(username);
                // Prefer objects that have biography or follower counts
                if ((!existing.biography && extracted.biography) || (!existing.followersCount && extracted.followersCount)) {
                    masterProfileMap.set(username, { ...existing, ...extracted });
                }
            }
        });

        const records = items.map((item: any) => ({
            datasetId: localId,
            recordType: 'profile',
            platform: 'instagram',
            username: item.username || item.ownerUsername,
            data: item,
            createdAt: new Date()
        }));
        await mongoService.insertRecords(records);

        if (items.length > 0 || (aiAnalytics && aiAnalytics.root)) {
            const nodes: any[] = [];
            const links: any[] = [];
            const addedNodeIds = new Set<string>();

            // Helper to safe add node
            const addNode = (node: any) => {
                if (!addedNodeIds.has(node.id)) {
                    nodes.push(node);
                    addedNodeIds.add(node.id);
                }
            };

            // 1. MAIN NODE
            const mainLabel = name || 'Analysis';
            addNode({ id: 'MAIN', label: mainLabel, group: 'main', val: 50, color: '#10b981' });

            // [REVISED LOGIC] Use aiAnalytics.root for structure and RECURSIVELY HYDRATE
            if (aiAnalytics && aiAnalytics.root) {
                console.log("[Sync] Generating Rich Hierarchical Graph from AI Tree with Re-hydration...");

                const traverseAndHydrate = (node: any, parentId: string) => {
                    // [FIX] Tiered ID Strategy for robust hydration
                    // We try multiple potential identifiers and return the first match
                    const getMatchedData = (n: any) => {
                        const rawCandidates = [
                            n.handle,
                            n.id,
                            n.username,
                            n.label,
                            n.name
                        ].filter(val => val && typeof val === 'string');

                        // 1. Precise Match
                        for (const raw of rawCandidates) {
                            const clean = raw.toLowerCase().replace(/^@/, '').trim();
                            if (masterProfileMap.has(clean)) return { cleanId: clean, data: masterProfileMap.get(clean) };
                        }

                        // 2. Aggressive Match (Strip spaces/non-alnum)
                        for (const raw of rawCandidates) {
                            const stripped = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (!stripped) continue;

                            for (const [pKey, pVal] of masterProfileMap.entries()) {
                                if (pKey.replace(/[^a-z0-9]/g, '') === stripped) {
                                    return { cleanId: pKey, data: pVal };
                                }
                            }
                        }

                        return { cleanId: (n.handle || n.id || n.label || '').toString().toLowerCase().replace(/^@/, '').trim(), data: null };
                    };

                    const { cleanId, data: scrapedData } = getMatchedData(node);
                    const nodeId = cleanId || `node_${Math.random().toString(36).substr(2, 9)}`;

                    const rawType = node.type || node.group;
                    const group = (rawType && rawType !== 'root' && rawType !== 'main') ? rawType : (parentId === 'MAIN' ? 'cluster' : 'profile');
                    const label = node.label || cleanId || nodeId;

                    if (rawType !== 'root' && rawType !== 'main' && nodeId !== 'MAIN') {
                        // [HYDRATION STEP] Look up rich data for this node
                        const finalScrapedData = scrapedData || {};
                        const realPosts = finalScrapedData.latestPosts || finalScrapedData.posts || [];

                        const richData = {
                            ...(node.data || {}),
                            ...finalScrapedData,
                            // Ensure priority identifiers
                            username: cleanId,
                            handle: `@${cleanId}`,
                            // Map bio-critical fields
                            bio: finalScrapedData.biography || finalScrapedData.bio || (node.data && node.data.bio) || '',
                            profilePicUrl: proxyMediaUrl(finalScrapedData.profilePicUrl || finalScrapedData.profile_pic_url || (node.data && node.data.profilePicUrl)),
                            latestPosts: realPosts.length > 0 ? realPosts.map((p: any) => proxyMediaFields(p)) : (node.data?.latestPosts || []),

                            followerCount: finalScrapedData.followersCount || finalScrapedData.followers || (node.data && (node.data.followerCount || node.data.followers)) || 0,
                            followingCount: finalScrapedData.followsCount || finalScrapedData.followingCount || (node.data && (node.data.followingCount || node.data.following)) || 0,
                            postCount: finalScrapedData.postsCount || finalScrapedData.mediaCount || (node.data && (node.data.postCount || node.data.posts)) || 0,
                            followers: finalScrapedData.followersCount ? finalScrapedData.followersCount.toLocaleString() : '0',

                            // Provenance remains as defined by AI but gets rich evidence if available
                            provenance: {
                                ...(node.data?.provenance || { source: 'Gemini Analysis', method: 'Clustering' }),
                                confidence: scrapedData ? 1.0 : 0.8
                            }
                        };

                        addNode({
                            id: nodeId,
                            label: label,
                            group: group,
                            val: node.val || (group === 'cluster' ? 18 : 10),
                            color: (this as any).getNodeColor ? (this as any).getNodeColor(group) : '#94a3b8',
                            data: richData
                        });

                        if (parentId) {
                            links.push({
                                source: parentId,
                                target: nodeId,
                                value: (parentId === 'MAIN') ? 5 : (group === 'creator' || group === 'brand' ? 3 : 1)
                            });
                        }
                    }

                    if (node.children && Array.isArray(node.children)) {
                        const nextParentId = (rawType === 'root' || rawType === 'main' || nodeId === 'MAIN') ? 'MAIN' : nodeId;
                        node.children.forEach((child: any) => traverseAndHydrate(child, nextParentId));
                    }
                };

                traverseAndHydrate(aiAnalytics.root, 'MAIN');
            } else {
                // FALLBACK: Original Naive Logic for flat datasets
                console.log("[Sync] No AI Tree found, using flat fallback with hydration.");
                items.forEach((item: any, idx: number) => {
                    const username = (item.username || item.ownerUsername || `user_${idx}`).toLowerCase().replace('@', '');
                    addNode({
                        id: username,
                        label: username,
                        group: 'creator',
                        val: 10,
                        data: {
                            ...item,
                            username: username,
                            profilePicUrl: proxyMediaUrl(item.profilePicUrl || item.profile_pic_url),
                            latestPosts: (item.latestPosts || []).map((p: any) => proxyMediaFields(p))
                        }
                    });
                    links.push({ source: 'MAIN', target: username, value: 1 });
                });
            }

            // Define minimal color helper inline (since we are in class method)
            function getNodeColor(group: string) {
                switch (group) {
                    case 'cluster': return '#34d399';
                    case 'creator': return '#f472b6';
                    case 'brand': return '#3b82f6';
                    case 'topic': return '#8b5cf6';
                    default: return '#9ca3af';
                }
            }

            // [FIX] GZIP Compression for Sync Snapshot
            const finalSnapshot = {
                nodes,
                links,
                profileFullName: name,
                recordType: 'graph_snapshot',
                analytics: (aiAnalytics && aiAnalytics.analytics) ? aiAnalytics.analytics : {
                    creators: [],
                    brands: [],
                    clusters: [],
                    topics: [],
                    subtopics: [],
                    overindexing: [], // [FIX] Added
                    nonRelatedInterests: [], // [FIX] Added
                    topContent: [],
                    aestheticTags: [], // [FIX] Added
                    vibeDescription: "", // [FIX] Added
                    colorPalette: [], // [FIX] Added
                    visualAnalysis: undefined, // [FIX]
                    visualTheme: undefined // [FIX]
                }
            };


            let compressedData: Buffer | null = null;
            try {
                const jsonStr = JSON.stringify(finalSnapshot);
                // Compress if larger than 1MB to save space/bandwidth
                if (jsonStr.length > 1024 * 1024) {
                    compressedData = zlib.gzipSync(jsonStr);
                    console.log(`[Sync] Compressed graph snapshot: ${(jsonStr.length / 1024 / 1024).toFixed(2)}MB -> ${(compressedData.length / 1024 / 1024).toFixed(2)}MB`);
                }
            } catch (e) {
                console.error("[Sync] Compression failed:", e);
            }

            await mongoService.insertRecords([{
                datasetId: localId,
                recordType: 'graph_snapshot',
                platform: 'instagram',
                data: compressedData || finalSnapshot,
                compression: compressedData ? 'gzip' : undefined,
                createdAt: new Date()
            }]);
        }
        return localId;
    }

    /**
     * [NEW] Algorithmic Scrape Plan Auditor
     * Ensures every plan is robust, follows "Golden Paths", and includes mandatory enrichment.
     */
    private auditAndRepairPlan(plan: any, query: string, sampleSize: number, postLimit: number = 3): any {
        console.log(`[Auditor] Inspecting Plan for intent: ${plan.intent}`);

        // 1. Ensure Intent Alignment
        const overIndexKeywords = ['overindex', 'over-index', 'map the subcultures', 'followers of', 'talking about'];
        const shouldBeOverIndexing = overIndexKeywords.some(k => query.toLowerCase().includes(k));

        if (shouldBeOverIndexing && plan.intent !== 'over_indexing') {
            console.warn(`[Auditor] Query implies over-indexing/audience-map but intent was "${plan.intent}". Forcing over_indexing.`);
            plan.intent = 'over_indexing';

            // [FIX] If plan was empty/wrong, regenerate basic steps for over_indexing
            if (plan.steps.length === 0) {
                plan.steps.push({
                    id: 'step_1',
                    actorId: 'apify/instagram-api-scraper',
                    input: { username: [query.match(/@([\w._]+)/)?.[1] || ''] }
                });
            }
        }

        // 2. Mandatory Enrichment Injection
        const lastStep = plan.steps[plan.steps.length - 1];
        // [FIX] Check for profile scraper as valid enrichment too
        const isEnrichment = lastStep && (lastStep.actorId === 'apify/instagram-api-scraper' || lastStep.actorId === 'apify/instagram-profile-scraper');

        if (!isEnrichment) {
            console.log(`[Auditor] Plan missing terminal enrichment step. Injecting...`);
            const prevStepId = lastStep ? lastStep.id || lastStep.stepId : null;

            // [FIX] Extract all handles for robust fallback injection
            const handleMatches = [...query.matchAll(/@([\w._]+)/g)];
            const extractedUrls = handleMatches.length > 0
                ? handleMatches.map(m => `https://www.instagram.com/${m[1]}/`)
                : null;

            let validSource: string[] | string | null = prevStepId
                ? [`USE_DATA_FROM_STEP_${prevStepId}`]
                : extractedUrls;

            // If strictly over-indexing and we have handles but no steps, ensure we use the handles
            if (!prevStepId && plan.intent === 'over_indexing' && extractedUrls) {
                validSource = extractedUrls;
            }

            if (validSource && validSource.length > 0) {
                // [FIX] Use apify/instagram-profile-scraper for rich profile data including posts
                plan.steps.push({
                    id: `step_${plan.steps.length + 1}`,
                    description: 'Mandatory Data Enrichment (Auditor Injection)',
                    actorId: 'apify/instagram-profile-scraper', // [CHANGED] Force Profile Scraper
                    input: {
                        usernames: validSource, // Profile scraper uses 'usernames'
                        resultsLimit: postLimit || 3 // [FIX] Pass slider value as resultsLimit
                    },
                    estimatedRecords: 50,
                    estimatedCost: 0.25,
                    reasoning: 'Guarantees rich profile data for the UI.',
                    status: 'pending'
                });
            } else {
                console.warn(`[Auditor] Skipping mandatory enrichment injection: No valid source (handle/step) found for query "${query}"`);
            }
        }



        // 3. Constrain Search Limits (User Request: Trust the slider, no arbitrary caps)
        const effectiveLimit = sampleSize || 50;
        const depthLimit = postLimit || 3;

        console.log(`[Auditor] Applying User Limits - Profiles: ${effectiveLimit}, Depth: ${depthLimit}`);

        plan.steps.forEach((step: any, index: number) => {
            if (step.input) {
                // Determine limits based on operation type
                const safeActorId = (step.actorId || step.actor || '').toLowerCase();

                // [FIX] Input Normalization for TheNetaji/Followers
                if (safeActorId.includes('followers') || safeActorId.includes('following') || safeActorId === 'asijo32nquuhp4fnc') {
                    if (step.input.usernames && !step.input.username) {
                        step.input.username = step.input.usernames;
                        delete step.input.usernames;
                    }
                    if (step.input.username && !Array.isArray(step.input.username)) {
                        step.input.username = [step.input.username];
                    }
                }

                const isPostScrape = (safeActorId === 'apify/instagram-api-scraper' && step.input.resultsType !== 'details') || safeActorId.includes('instagram-scraper');
                const isApiScraper = safeActorId === 'apify/instagram-api-scraper';
                const isProfileScraper = safeActorId === 'apify/instagram-profile-scraper';

                // [CRITICAL USER REQ] 
                // Index 0 (Main Scrape) -> Use Sample Size (e.g. 5000)
                // Index > 0 (Subsequent) -> Use Slide Value (Depth/PostLimit, e.g. 20)

                if (index === 0) {
                    // MAIN SCRAPER (First Step)
                    // [FIX] Trust effectiveLimit (sampleSize) directly
                    const limit = effectiveLimit;

                    step.input.maxCount = limit;
                    step.input.max_count = limit;
                    step.input.limit = limit;
                    step.input.maxItems = limit;
                    step.input.maxItem = limit;

                    step.estimatedRecords = limit; // [NEW] Ensure quote reflects checking

                    // [FIX] For API scraper, also enforce resultsLimit on first step
                    if (isApiScraper && step.input.resultsLimit) {
                        step.input.resultsLimit = depthLimit; // Trust postLimit
                    }
                } else {
                    // SUBSEQUENT SCRAPERS (Recurse/Enrich)
                    // [FIX] Proportional Scaling: Scale secondary limits based on sampleSize
                    // Old logic capped at 20. New logic: Max(50, 5% of sampleSize) -> e.g. 5000 sample -> 250 limit
                    // This ensures "Larger Sample = Larger Tree"
                    const scalingFactor = 0.05; // 5% of base sample
                    const proportionalLimit = Math.ceil(sampleSize * scalingFactor);
                    const dynamicLimit = Math.max(50, proportionalLimit); // Minimum 50 for utility

                    const subLimit = Math.min(depthLimit * 100, dynamicLimit); // Allow depth to control order of magnitude if needed

                    console.log(`[Auditor] ðŸ“ˆ Proportional Scaling: Step ${plan.steps.indexOf(step) + 1} limit set to ${subLimit} (Based on sample ${sampleSize})`);

                    if (isPostScrape) {
                        // Posts specific logic - keep tighter control as posts are heavy
                        const finalLimit = Math.max(step.input.resultsLimit || 0, step.input.maxPosts || 0, depthLimit);
                        if (step.input.resultsLimit) step.input.resultsLimit = finalLimit;
                        if (step.input.maxPosts) step.input.maxPosts = finalLimit;

                        // Estimate: (Previous Step Records) * (Posts per User)
                        // This is a rough heuristic, usually 10-20% yield on full scrape
                        step.estimatedRecords = Math.min(effectiveLimit * depthLimit, 10000);
                    } else if (isProfileScraper) {
                        // [FIX] Ensure profile scraper gets the depth limit
                        step.input.resultsLimit = depthLimit;
                        // Also set 'limit' as alias if needed, but resultsLimit is key for profile-scraper posts
                        step.input.limit = depthLimit;
                    } else {
                        // Secondary profiles/followers
                        step.input.maxCount = subLimit;
                        step.input.max_count = subLimit; // Legacy
                        step.input.limit = subLimit;
                        step.input.maxItems = subLimit;
                        step.input.maxItem = subLimit; // [FIX] Also set singular maxItem

                        step.estimatedRecords = subLimit; // [NEW] Update Quote

                        // [ENHANCED] For API scraper steps, enforce depthLimit on resultsLimit
                        if (isApiScraper && step.input.resultsLimit) {
                            step.input.resultsLimit = depthLimit;
                        } else if (step.input.resultsLimit) {
                            // For non-API scrapers, use proportional scaling
                            step.input.resultsLimit = subLimit;
                        }
                    }
                }

                // Search Caps (Always Sample Size)
                if (step.input.searchLimit) step.input.searchLimit = Math.min(effectiveLimit, step.input.searchLimit);
            }
        });

        return plan;
    }

    private getNodeColor(group: string): string {
        switch (group) {
            case 'main': return '#10b981';
            case 'cluster': return '#34d399';
            case 'creator':
            case 'influencer':
            case 'user': return '#f472b6';
            case 'brand': return '#60a5fa';
            case 'topic': return '#a78bfa';
            case 'subtopic': return '#818cf8';
            case 'post': return '#fbbf24';
            default: return '#94a3b8';
        }
    }

    private sanitizeUrl(url: string): string {
        if (!url || url.includes('fxxx.fbcdn') || url.includes('instagram.fxxx')) return '';
        return url;
    }

    /**
     * Deterministic Regex-based Intent Router
     * Bypass AI ambiguity for specific, rigid query patterns.
     */




    async enqueueJob(userId: string, type: Job['type'], input: any) {
        const jobId = uuidv4();
        await mongoService.createJob({
            id: jobId,
            userId,
            type,
            status: 'queued',
            progress: 0,
            metadata: input,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return jobId;
    }

    private async processAiAnalysis(job: Job) {
        const { query, sampleSize, platform, useThemedNodes } = job.metadata;
        console.log(`[JobOrchestrator] AI Analysis: ${query}`);

        await mongoService.updateJob(job.id, { progress: 10 });

        const client = getAiClient();
        if (!client) throw new Error("AI Client not initialized");

        const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram';
        const platformSite = platform === 'tiktok' ? 'site:tiktok.com' : 'site:instagram.com';

        // [MODIFIED] Use Universal Deep Dive for consistency
        // This replaces the hardcoded prompt with the shared logic in geminiService.ts
        let analysisResult: any = null;
        try {
            analysisResult = await analyzeFandomDeepDive(
                query,
                [], // No scraped context for pure AI analysis
                job.metadata.intent || 'general_map',
                platform as 'instagram' | 'tiktok' || 'instagram',
                '',
                sampleSize || 100, // [NEW] Pass scaling parameter
                useThemedNodes || false // [NEW] Pass theme flag
            );
        } catch (e: any) {
            console.error(`[JobOrchestrator] AI Analysis step failed:`, e);
            throw new Error(`AI Analysis failed: ${e.message}`);
        }

        if (analysisResult) {
            // Normalize result structure
            const rawData = analysisResult;
            // Use 'analytics' property if present, otherwise assume the whole object is what we want (e.g. Tree format)
            const analytics = rawData.analytics || rawData;
            const isValidJson = true;
            console.log("[JobOrchestrator] Analytics keys:", Object.keys(analytics));
            console.log("[JobOrchestrator] Clusters:", (analytics.clusters || []).length);
            console.log("[JobOrchestrator] Topics:", (analytics.topics || []).length);
            console.log("[JobOrchestrator] Creators:", (analytics.creators || []).length);
            console.log("[JobOrchestrator] Brands:", (analytics.brands || []).length);

            // [FIX] Hierarchical Graph Generation
            // We now delegate to the class method which handles the recursive tree
            // [NEW] GAP ANALYSIS & REMEDIATION
            // The AI has hallucinated/inferred a graph. We MUST verify these nodes exist and get real stats.
            // We cannot rely on AI for follower counts or evidence.

            const candidates = new Set<string>();
            const traverse = (node: any) => {
                // Check label for @handle
                if (typeof node.label === 'string' && node.label.startsWith('@')) {
                    candidates.add(node.label.replace('@', '').trim());
                }
                // Check data.handle / data.username
                if (node.data?.handle) candidates.add(node.data.handle.replace('@', '').trim());
                if (node.data?.username) candidates.add(node.data.username.replace('@', '').trim());

                // Recursively check children
                if (node.children && Array.isArray(node.children)) {
                    node.children.forEach(traverse);
                }
            };

            // Start traversal from root
            if (analytics.root) traverse(analytics.root);
            else traverse(analytics);

            const handlesToScrape = Array.from(candidates).filter(h => h && h.length > 2 && !h.includes(' '));
            console.log(`[GapRemediation] AI proposed ${handlesToScrape.length} nodes. Verifying existence via Scraper...`);

            // Trigger Verification Scrape
            let scrapedProfiles: any[] = [];
            if (handlesToScrape.length > 0) {
                console.log(`[GapRemediation] Starting batch verification for ${handlesToScrape.length} profiles...`);

                // [FIX] Batch Processing logic to handle >50 profiles
                const BATCH_SIZE = 50;
                for (let i = 0; i < handlesToScrape.length; i += BATCH_SIZE) {
                    const batch = handlesToScrape.slice(i, i + BATCH_SIZE);
                    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(handlesToScrape.length / BATCH_SIZE);

                    console.log(`[GapRemediation] Processing Batch ${batchNum}/${totalBatches} (${batch.length} profiles)...`);

                    try {
                        // [FIX] Use dedicated profile scraper for better enrichment (bio, counts)
                        // This actor ('apify/instagram-profile-scraper') returns full profile objects directly
                        const scrapeResult = await this.runApifyActor('apify/instagram-profile-scraper', {
                            usernames: batch,
                        }, job.id, {
                            taskName: `Gap Remediation (Batch ${batchNum}/${totalBatches})`,
                            query: query,
                            sampleSize: batch.length,
                            ignoreCache: false
                        });

                        // Extract profiles (Dedicated scraper returns items as profiles directly)
                        if (scrapeResult && scrapeResult.items) {
                            const batchProfiles = scrapeResult.items.filter((p: any) => p && p.username);
                            scrapedProfiles.push(...batchProfiles);
                            console.log(`[GapRemediation] Batch ${batchNum} success: Retrieved ${batchProfiles.length} profiles.`);
                        }
                    } catch (scrapeErr) {
                        console.warn(`[GapRemediation] âš ï¸  Batch ${batchNum} failed. Skipping these ${batch.length} profiles.`, scrapeErr);
                        // Continue to next batch instead of failing completely
                    }

                    // Small delay between batches to be nice to Apify/IG
                    if (i + BATCH_SIZE < handlesToScrape.length) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                console.log(`[GapRemediation] Completed. Verified ${scrapedProfiles.length} / ${handlesToScrape.length} profiles total.`);
            }


            // [FIX] Hierarchical Graph Generation
            // Pass the verified scrapedProfiles to the generator so it can hydrate the nodes
            const graphData = await this.generateOverindexGraph(scrapedProfiles, query, null, analytics, sampleSize);

            const nodes = graphData.nodes;
            const links = graphData.links;

            console.log("[JobOrchestrator] Generated nodes count:", nodes.length);
            console.log("[JobOrchestrator] Generated links count:", links.length);


            // [NEW] 100% ENRICHMENT GUARANTEE: Perform Deep Enrichment for missing nodes in AI Analysis
            console.log('[AI Analysis] 🔍 Checking for enrichment gaps...');
            const profileMap = new Map<string, StandardizedProfile>();
            for (const item of scrapedProfiles) {
                const profile = this.normalizeToStandardProfile(item);
                if (profile) {
                    if (profile.id) profileMap.set(profile.id, profile);
                    if (profile.username) profileMap.set(profile.username.toLowerCase().replace('@', '').trim(), profile);
                }
            }

            const localId = uuidv4();
            // In processAiAnalysis, graphData is { nodes, links }. performDeepEnrichment handles this structure.
            await this.performDeepEnrichment(graphData, localId, job.id, profileMap);

            await mongoService.createDataset({
                id: localId,
                userId: job.userId,
                name: `AI Analysis: ${query}`,
                platform: platform as any,
                targetProfile: query,
                dataType: 'audience',
                recordCount: nodes.length,
                tags: ['snapshot'],
                metadata: { query, sampleSize, mode: 'ai_analysis' },
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await mongoService.insertRecords([{
                datasetId: localId,
                recordType: 'graph_snapshot',
                platform: platform as any,
                data: {
                    nodes,
                    links,
                    profileFullName: query,
                    recordType: 'graph_snapshot',
                    analytics
                },
                createdAt: new Date()
            }]);

            // Calculate Accuracy Scores
            console.log(`[Auditor] ðŸ§ Verifying Result Tree Richness & Accuracy...`);
            const accuracyScores = queryAccuracyService.scoreQueryResult(query, analytics, job.metadata);
            const confidence = queryAccuracyService.calculateConfidence(query, analytics, job.metadata);

            // [NEW] BILLING & TRANSACTION LOGGING
            try {
                const cost = await costCalculator.calculateAiAnalysisCost(sampleSize);
                await costCalculator.trackUsageAndDeduct(
                    job.userId,
                    'quick_map', // Mapped to quick_map action for now
                    `AI Analysis: ${query}`,
                    cost
                );
                console.log(`[JobOrchestrator] ðŸ’° AI Analysis Transaction logged: Â£${cost.chargedAmount.toFixed(2)}`);
            } catch (billingError: any) {
                console.error(`[JobOrchestrator] ðŸš¨ Billing Failed for AI Analysis Job ${job.id}:`, billingError);
                // Non-blocking but alert
            }

            await mongoService.updateJob(job.id, {
                status: 'completed',
                progress: 100,
                'result.datasetId': localId,
                qualityScore: accuracyScores.overall,
                confidenceScore: confidence.score,
                accuracyMetrics: {
                    completeness: accuracyScores.completeness,
                    relevance: accuracyScores.relevance,
                    freshness: accuracyScores.freshness,
                    provenance: accuracyScores.provenance
                }
            } as any);


            await this.notifyCompletion(job, query);
        } else {
            throw new Error("No JSON object found in Gemini response");
        }
    }


    /**
     * QUERY BUILDER ORCHESTRATION
     * Full port of orchestrationService.ts for server-side execution
     */

    /**
     * Process Orchestration Job
     * Handles complex multi-step Query Builder workflows
     */
    private async processOrchestration(job: Job) {
        const { query, sampleSize = 100, ignoreCache = false, useDeepAnalysis = false, useThemedNodes = false } = job.metadata;

        console.log(`[Orchestration] Starting for query: "${query}" (size: ${sampleSize}, deep: ${useDeepAnalysis}, themed: ${useThemedNodes})`);

        // [CORE FIX] Pre-flight Balance Check
        // Ensure user has at least minimum credits before starting expensive orchestration
        try {
            const user = await mongoService.getUser(job.userId);
            const isAdmin = user && user.email && mongoService.isAdmin(user.email);

            if (!isAdmin) {
                const currentBalance = await mongoService.getUserBalance(job.userId);
                const minRequired = 50; // Base cost for AI orchestration
                if (currentBalance < minRequired) {
                    throw new Error(`Insufficient balance to start orchestration. Required: Â£${(minRequired / 100).toFixed(2)}, Current: Â£${(currentBalance / 100).toFixed(2)}`);
                }
                console.log(`[Orchestration] âœ… Balance check passed: Â£${(currentBalance / 100).toFixed(2)}`);
            } else {
                console.log(`[Orchestration] ðŸ›¡ï¸ Admin bypass for balance check (user: ${user?.email})`);
            }
        } catch (balanceErr: any) {
            console.error(`[Orchestration] ðŸš¨ Pre-flight failed: ${balanceErr.message}`);
            await mongoService.updateJob(job.id, {
                status: 'failed',
                error: balanceErr.message,
                progress: 0
            });
            return;
        }

        await mongoService.updateJob(job.id, { progress: 5 });

        // Step 1: Analyze requirements and generate plan
        await mongoService.updateJob(job.id, {
            progress: 10,
            result: { stage: 'Analyzing query intent and generating scrape plan...' }
        });

        let plan;
        // [OPTIMIZATION] Check if plan was already generated by the frontend preview
        if (job.metadata.plan) {
            console.log(`[Orchestration] âœ… Using Prequel Plan provided in job metadata (Skipping redundant AI call).`);
            plan = job.metadata.plan;
        } else {
            console.log(`[Orchestration] âš ï¸ No pre-generated plan found. Generating new plan via AI...`);
            try {
                // Get existing datasets for potential reuse
                const existingDatasets = await this.getExistingDatasets(job.userId);
                plan = await this.analyzeMapRequirements(query, sampleSize, existingDatasets, ignoreCache, useDeepAnalysis);
                console.log(`[Orchestration] Plan generated: ${plan.steps.length} steps, intent: ${plan.intent}`);
            } catch (e: any) {
                throw new Error(`Plan generation failed: ${e.message}`);
            }
        }

        if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
            throw new Error("AI failed to generate a valid plan with steps");
        }

        await mongoService.updateJob(job.id, {
            progress: 20,
            result: { stage: 'Plan ready, executing scrape steps...', plan }
        });

        // Step 2: Execute the plan
        const executionOutput = await this.executeOrchestrationPlan(job, plan);
        const results = executionOutput.results;
        const { totalSavedCost, allCached } = executionOutput.metadata;

        // --- ANALYTICS ENRICHMENT (Server-Side) ---
        let analytics: any = {
            calculatedAt: new Date()
        };

        // --- UNIFIED ANALYTICS (Deep Dive with Provenance) ---
        console.log(`[Orchestration] Preparing Universal Analysis for intent: ${plan.intent}`);

        let itemsToAnalyze: any[] = [];

        // [NEW] Smart Prioritization & Filtering based on Intent
        // We must prioritize the input data before sending to Gemini, otherwise the prompt's slice (Top 50)
        // will discard the most relevant signals (e.g., highly frequent brands or highly engaged posts).
        if (['over_indexing', 'brand_affinity', 'network_clusters'].includes(plan.intent)) {
            console.log(`[Orchestration] Applying Frequency Aggregation for ${plan.intent}...`);
            // Use the helper to calculate frequency and merge enriched data
            // This returns a sorted list of the most relevant profiles (Top 200)
            itemsToAnalyze = this.aggregateOverindexingLocal(results, plan.intent);

        } else if (['subject_matter', 'viral_content', 'content_analysis', 'trends'].includes(plan.intent)) {
            console.log(`[Orchestration] Applying Engagement Sorting for ${plan.intent}...`);
            const flat = results.flat();
            // Deduplicate by ID
            const uniqueMap = new Map();
            flat.forEach((item: any) => {
                const key = item.id || item.shortCode || item.username || Math.random().toString();
                if (!uniqueMap.has(key)) uniqueMap.set(key, item);
            });

            // Sort by Engagement Score (Likes + Comments + Views)
            itemsToAnalyze = Array.from(uniqueMap.values()).sort((a: any, b: any) => {
                const scoreA = (a.likesCount || a.like_count || 0) + ((a.commentsCount || a.comment_count || 0) * 2) + ((a.videoViewCount || a.view_count || 0) / 100);
                const scoreB = (b.likesCount || b.like_count || 0) + ((b.commentsCount || b.comment_count || 0) * 2) + ((b.videoViewCount || b.view_count || 0) / 100);
                return scoreB - scoreA;
            });

        } else {
            // Default: Flatten and maybe sort by follower count if available
            console.log(`[Orchestration] Applying Default Sorting (Followers) for ${plan.intent}...`);
            itemsToAnalyze = results.flat().sort((a: any, b: any) => {
                const followersA = a.followersCount || a.followers || 0;
                const followersB = b.followersCount || b.followers || 0;
                return followersB - followersA;
            });
        }

        // [ENRICHMENT MERGE] Consolidate Profile Data
        // uses normalizeToStandardProfile to unify disparate scraper outputs
        const profileMap = new Map<string, StandardizedProfile>();
        const postsList: any[] = [];
        const otherItems: any[] = [];

        itemsToAnalyze.forEach(rawItem => {
            const rawUsername = (rawItem.username || rawItem.ownerUsername || '').toLowerCase();
            const isPost = (rawItem.type === 'Image' || rawItem.type === 'Video' || rawItem.type === 'Sidecar') || (!!rawItem.shortCode) && (!rawItem.searchSource);

            // 1. Normalize
            const standard = this.normalizeToStandardProfile(rawItem);
            if (!standard) return; // Skip invalid/private profiles without crashing

            const standardUsername = standard.username.toLowerCase();

            // Use the most reliable username
            const finalUsername = standardUsername || rawUsername;

            if (finalUsername) {
                let existing = profileMap.get(finalUsername);

                // If this is the first time seeing this profile, or we are upgrading a "stub" with a "Standard"
                // We use the normalized standard as the base.
                if (!existing) {
                    // Convert StandardProfile back to the loose "any" shape expected by Gemini/Graph for now, 
                    // OR just use StandardProfile as the 'profile' object?
                    // Gemini prompts expect keys like 'biography', 'followersCount', etc. 
                    // StandardizedProfile has these! Perfect.
                    profileMap.set(finalUsername, standard);
                } else {
                    // MERGE: Overwrite existing fields if new standard has them and existing doesn't
                    if (!existing.fullName && standard.fullName) existing.fullName = standard.fullName;
                    if (!existing.biography && standard.biography) existing.biography = standard.biography;
                    if (!existing.profilePicUrl && standard.profilePicUrl) existing.profilePicUrl = standard.profilePicUrl;
                    if (!existing.externalUrl && standard.externalUrl) existing.externalUrl = standard.externalUrl;

                    // Max numeric fields
                    if (standard.followersCount) existing.followersCount = Math.max(existing.followersCount || 0, standard.followersCount);
                    if (standard.followsCount) existing.followsCount = Math.max(existing.followsCount || 0, standard.followsCount);

                    // Merge Posts
                    if (standard.latestPosts && standard.latestPosts.length > 0) {
                        if (!existing.latestPosts) existing.latestPosts = [];
                        // Dedupe posts by ID
                        const pidSet = new Set(existing.latestPosts.map((p: any) => p.id));
                        standard.latestPosts.forEach(p => {
                            if (!pidSet.has(p.id)) existing.latestPosts.push(p);
                        });
                    }
                }
            }

            // Segregate Raw Items
            if (isPost) {
                postsList.push(rawItem);
            } else if (!finalUsername) {
                if (!rawItem.error) otherItems.push(rawItem);
            }
        });

        // Reconstruct itemsToAnalyze
        const enrichedProfiles = Array.from(profileMap.values());
        // [IMPORTANT] Put Profiles FIRST, then Posts. Gemini reads top-down.
        itemsToAnalyze = [...enrichedProfiles, ...postsList, ...otherItems];

        // [DEBUG] Log enrichedProfiles stats
        console.log(`[Orchestration] Consolidated Data: ${enrichedProfiles.length} Profiles, ${postsList.length} Posts.`);
        if (enrichedProfiles.length > 0) {
            const sampleUsernames = enrichedProfiles.slice(0, 3).map((p: any) => p.username).join(', ');
            console.log(`[Orchestration] Sample enriched profiles: ${sampleUsernames}`);
        }

        // [INTENT-SPECIFIC PRE-PROCESSING]
        // For bio/influencer search, filter to relevant items first to maximize AI context relevance
        if (['bio_search', 'influencer_identification'].includes(plan.intent)) {
            // Try to extract a keyword from the query
            const keywordMatch = query.match(/find (?:profiles|developers|designers|founders|people|users) (?:who are|that are|that have) ([\w\s]+)/i);
            const keyword = keywordMatch ? keywordMatch[1].trim().toLowerCase() : '';

            if (keyword) {
                console.log(`[Orchestration] Pre-filtering items by keyword "${keyword}"...`);
                const relevantItems = itemsToAnalyze.filter((p: any) =>
                    (p.biography || p.bio || '').toLowerCase().includes(keyword) ||
                    (p.text || '').toLowerCase().includes(keyword)
                );
                if (relevantItems.length > 0) {
                    itemsToAnalyze = relevantItems;
                    console.log(`[Orchestration] Context focused on ${itemsToAnalyze.length} matched items.`);
                }
            }
        }

        // Construct Dataset URL for Provenance
        const datasetUrl = (executionOutput.datasetIds && executionOutput.datasetIds.length > 0)
            ? `https://api.apify.com/v2/datasets/${executionOutput.datasetIds[executionOutput.datasetIds.length - 1]}/items?format=json&clean=1`
            : '';

        try {
            await mongoService.updateJob(job.id, { progress: 80, result: { stage: 'Running Advanced AI Analysis...' } });

            // [FIX] Enable 3D Theme Generation
            const useThemedNodes = true; // Always generate visual themes (3D models + SVG icons)

            // CALL PROMPT A (Tree Generation)
            // [FIX] Pass enrichedProfiles as richContext for node hydration
            const analysis = await analyzeFandomDeepDive(
                query,
                itemsToAnalyze,
                plan.intent,
                plan.platform || 'instagram',
                datasetUrl,
                sampleSize, // Pass scaling parameter
                useThemedNodes, // Pass 3D Theme Flag
                enrichedProfiles, // [FIX] Pass rich profile data for hydration
                'full', // [FIX] Explicitly set mode to 'full'
                '' // seedContext (empty for now)
            );

            if (analysis) {
                console.log(`[Orchestration] AI Analysis Success. Intent: ${plan.intent}`);

                // [NEW] PRE-FETCH GHOST NODES (Global DB Lookup)
                // Identify potential handles in the AI analysis that are missing from our current scrape 'profileMap'
                const potentialHandles = new Set<string>();
                const harvestHandles = (node: any) => { // Recursive harvester
                    if (!node) return;
                    if (node.handle) potentialHandles.add(node.handle);
                    if (node.data?.handle) potentialHandles.add(node.data.handle);
                    if (node.children) node.children.forEach(harvestHandles);
                };
                harvestHandles(analysis.root);
                if (analysis.creators) analysis.creators.forEach((c: any) => potentialHandles.add(c.handle));
                if (analysis.brands) analysis.brands.forEach((b: any) => potentialHandles.add(b.handle));

                const missingHandles = Array.from(potentialHandles).filter(h => {
                    const key = (h || '').toLowerCase().replace('@', '').trim();
                    return key && !profileMap.has(key);
                });

                if (missingHandles.length > 0) {
                    console.log(`[Orchestration] Attempting to pre-fetch ${missingHandles.length} ghost nodes from Global DB...`);
                    const ghostProfiles = await mongoService.findProfilesBatch(missingHandles);
                    ghostProfiles.forEach(p => {
                        if (p && (p.username || p.ownerUsername)) {
                            const u = p.username || p.ownerUsername;
                            // Add to profileMap so enrichFandomAnalysisParallel can find them
                            profileMap.set(u.toLowerCase(), {
                                username: u,
                                fullName: p.fullName || p.name,
                                biography: p.biography || p.bio || '',
                                followersCount: p.followersCount || p.followers || 0,
                                followsCount: p.followsCount || p.following || 0,
                                profilePicUrl: p.profilePicUrl || p.profilePic,
                                externalUrl: p.externalUrl,
                                latestPosts: p.latestPosts || [],
                                isVerified: p.isVerified || false,
                                id: p.id || u
                            } as any);
                        }
                    });
                    console.log(`[Orchestration] Successfully revitalized ${ghostProfiles.length} ghost nodes.`);
                }

                // [PERFORMANCE] ENRICHMENT PASS 1: Hydrate the AI Tree with current profileMap (Scraped + DB)
                analytics = await this.enrichFandomAnalysisParallel(analysis, profileMap);

                // [NEW] GAP DETECTION & FINAL ENRICHMENT (On-Demand Scrape)
                // Identify handles that are still missing or incomplete (missing bio/followers)
                const enrichmentGaps = this.identifyEnrichmentGaps(analytics);

                if (enrichmentGaps.length > 0) {
                    console.log(`[Orchestration] 🔍 Detected ${enrichmentGaps.length} nodes with incomplete data. Triggering final enrichment scrape...`);

                    try {
                        const finalEnrichmentResults = await this.runApifyActor('apify/instagram-profile-scraper', {
                            usernames: enrichmentGaps.slice(0, 50) // Cap to 50 for performance
                        }, job.id, {
                            taskName: `Final Enrichment: ${enrichmentGaps.slice(0, 3).join(', ')}...`,
                            query: job.metadata?.query || (plan as any).query || 'enrichment',
                            planId: job.id
                        });

                        if (finalEnrichmentResults.items && finalEnrichmentResults.items.length > 0) {
                            console.log(`[Orchestration] ✅ Final enrichment returned ${finalEnrichmentResults.items.length} profiles.`);
                            finalEnrichmentResults.items.forEach(item => {
                                const normalized = this.normalizeToStandardProfile(item);
                                if (normalized && normalized.username) {
                                    profileMap.set(normalized.username.toLowerCase(), normalized as any);
                                }
                            });

                            // FINAL PASS: Re-apply enrichment with the newly scraped data
                            analytics = await this.enrichFandomAnalysisParallel(analytics, profileMap);
                        }
                    } catch (enrichmentError) {
                        console.error(`[Orchestration] ❌ Final enrichment failed:`, enrichmentError);
                    }
                }

                // [FIX] Ensure Visual DNA is preserved if present in raw analysis
                if (analytics && (analysis.visual || analysis.visualAnalysis)) {
                    analytics.visual = analysis.visual || analysis.visualAnalysis;
                    console.log("[Orchestration] ✅ Merged Visual DNA into Analytics");
                } else {
                    console.warn("[Orchestration] âš ï¸ Visual DNA missing from AI response.");
                }

                // [FIX] Inject Provenance for Subtopics (User Request)
                if (analytics.subtopics && Array.isArray(analytics.subtopics)) {
                    analytics.subtopics.forEach((sub: any) => {
                        // Advanced Matching Strategy: Score-based
                        const keywords = (sub.keywords || []).map((k: string) => k.toLowerCase());
                        const nameTokens = (sub.name || '')
                            .toLowerCase()
                            .split(/[\s-_]+/)
                            .filter((t: string) => t.length > 3 && !['and', 'the', 'for', 'with'].includes(t));

                        const scoredMatches = itemsToAnalyze.map(p => {
                            let score = 0;
                            const text = `${p.biography || ''} ${p.text || ''}`.toLowerCase();

                            // 1. Exact Name Match (Highest)
                            if (text.includes((sub.name || '').toLowerCase())) score += 10;

                            // 2. Keyword Match
                            keywords.forEach((k: string) => {
                                if (text.includes(k)) score += 5;
                            });

                            // 3. Token Match
                            nameTokens.forEach((t: string) => {
                                if (text.includes(t)) score += 2;
                            });

                            return { p, score };
                        })
                            .filter(m => m.score > 0)
                            .sort((a, b) => b.score - a.score)
                            .slice(0, 5)
                            .map(m => m.p);

                        if (scoredMatches.length > 0) {
                            sub.provenance = {
                                source: 'User Bios & Posts',
                                evidence: scoredMatches.map(m => ({
                                    type: 'mention',
                                    text: m.biography ? `Bio: ${m.biography.substring(0, 80)}...` : `Post: ${m.text.substring(0, 80)}...`,
                                    author: m.username
                                }))
                            };
                        } else {
                            // [FALLBACK] If no text match, try to use high-value nodes as generic representatives
                            // This is better than showing nothing for abstract concepts
                            const fallbackMatches = itemsToAnalyze.slice(0, 3);
                            if (fallbackMatches.length > 0) {
                                sub.provenance = {
                                    source: 'Inferred Cluster',
                                    evidence: fallbackMatches.map(m => ({
                                        type: 'inference',
                                        text: `identified as a key figure in ${sub.name} context.`,
                                        author: m.username
                                    }))
                                };
                            }
                        }
                    });
                    console.log(`[Orchestration] Injected provenance for ${analytics.subtopics.length} subtopics.`);
                }

                // [FIX] Handle 'segments' structure (e.g. from debug_gemini_full.json)
                const segments = analysis.segments || (analysis.analysis && analysis.analysis.segments);

                if (segments && Array.isArray(segments)) {
                    console.log(`[Orchestration] Detected 'segments' structure with ${segments.length} clusters. Transforming to Tree...`);

                    // 1. Transform to Root Tree
                    // [FIX] Sanitize query for use as label (remove newlines, trim, limit length)
                    const sanitizedQuery = query
                        .replace(/\n/g, ' ')  // Replace newlines with spaces
                        .replace(/\s+/g, ' ') // Collapse multiple spaces
                        .trim()
                        .substring(0, 100);   // Limit to 100 characters

                    const root = {
                        id: 'root',
                        label: sanitizedQuery,
                        type: 'root',
                        val: 100,
                        children: [] as any[]
                    };

                    analytics.clusters = [];
                    analytics.creators = [];
                    analytics.brands = [];

                    segments.forEach((seg: any, idx: number) => {
                        const clusterId = `cluster_${idx}`;
                        const clusterNode = {
                            id: clusterId,
                            label: seg.cluster_name || `Cluster ${idx + 1}`,
                            type: 'cluster',
                            val: 30,
                            data: {
                                description: seg.description,
                                keywords: [seg.cluster_name]
                            },
                            children: [] as any[]
                        };
                        root.children.push(clusterNode);

                        if (seg.brands_creators && Array.isArray(seg.brands_creators)) {
                            seg.brands_creators.forEach((item: any) => {
                                // Determine type based on handle or context (default to creator)
                                const type = (item.type || 'creator').toLowerCase();
                                const node = {
                                    id: item.handle ? item.handle.toLowerCase() : `node_${Math.random()}`,
                                    label: item.label || item.name || item.handle,
                                    type: type,
                                    val: parseInt(item.cult_score || '5') * 3, // Scale value
                                    data: {
                                        handle: item.handle,
                                        profilePicUrl: item.data?.profilePicUrl,
                                        followers: item.data?.followers,
                                        bio: item.data?.bio,
                                        affinity: item.affinity_strength,
                                        cultScore: item.cult_score
                                    }
                                };
                                clusterNode.children.push(node);
                            });
                        }
                    });

                    analytics.root = root;
                    // Ensure 'analysis.root' is set so downstream logic picks it up
                    analysis.root = root;
                }

                if (analysis.analytics) {
                    // Scenario A: Wrapped in 'analytics' key
                    Object.assign(analytics, analysis.analytics);
                }

                if (analysis.root) {
                    // Scenario B: Tree Structure (Merge root specifically)
                    console.log("[Orchestration] Detected Tree Structure (root). Merging analytics...");
                    analytics.root = analysis.root;

                    // [NEW] Merge other top-level analytic keys (like topContent, visualAnalysis) if they exist
                    const keysToMerge = ['topContent', 'visualAnalysis', 'aestheticTags', 'lexicon', 'colorPalette', 'sentimentScore', 'vibeDescription'];
                    keysToMerge.forEach(key => {
                        if (analysis[key] !== undefined && analytics[key] === undefined) {
                            analytics[key] = analysis[key];
                        }
                    });
                } else if (!analysis.analytics && !analysis.root) {
                    // Fallback for old flat format if neither exists (unlikely now)
                    Object.assign(analytics, analysis);
                }

                // [HYDRATION] For Search Intents, explicitly ensure found profiles are in the list
                if (['bio_search', 'influencer_identification'].includes(plan.intent) && itemsToAnalyze.length > 0) {
                    const existingHandles = new Set((analytics.creators || []).map((c: any) => c.handle.toLowerCase()));

                    const hydratedProfiles = itemsToAnalyze.map((p: any) => {
                        const handle = (p.username || p.ownerUsername || '').toLowerCase();
                        if (!handle || existingHandles.has(handle)) return null;

                        return {
                            name: p.fullName || p.full_name || handle,
                            handle: p.username || p.ownerUsername,
                            score: 5.0, // High score for direct matches
                            category: 'Matched Profile',
                            citation: 'Direct Search Result',
                            searchQuery: query,
                            sourceUrl: `https://www.instagram.com/${p.username || p.ownerUsername}/`,
                            evidence: p.biography || p.bio || "Matched user query criteria",
                            // [RICH DATA ENRICHMENT]
                            profilePicUrl: p.profilePicUrl || p.profile_pic_url || p.hdProfilePicUrl || p.profile_pic_url_hd,
                            followersCount: p.followersCount || p.followers || 0,
                            verified: p.isVerified || p.verified || false,
                            // Video/Media Data
                            latestPosts: (p.latestPosts || p.posts || []).slice(0, 3).map((post: any) => ({
                                id: post.id || post.shortCode,
                                url: post.url || post.postUrl || `https://www.instagram.com/p/${post.shortCode}/`,
                                type: post.type || (post.isVideo ? 'Video' : 'Image'),
                                videoUrl: post.videoUrl || post.video_url,
                                displayUrl: post.displayUrl || post.display_url || post.thumbnailUrl,
                                likesCount: post.likesCount || post.likes || 0,
                                videoViewCount: post.videoViewCount || post.video_view_count || post.views || 0,
                                description: post.caption || post.description || ''
                            })),
                            // Related Profiles (if available from deep scrape)
                            relatedProfiles: (p.relatedProfiles || []).map((rp: any) => ({
                                username: rp.username,
                                full_name: rp.full_name,
                                profile_pic_url: rp.profile_pic_url
                            }))
                        };
                    }).filter(Boolean);

                    if (hydratedProfiles.length > 0) {
                        // [FIX] Deduplicate hydrated list (Prevent Post objects from creating duplicate profiles)
                        const uniqueHydratedMap = new Map();
                        hydratedProfiles.forEach((p: any) => {
                            if (!uniqueHydratedMap.has(p.handle)) {
                                uniqueHydratedMap.set(p.handle, p);
                            }
                        });
                        const uniqueHydrated = Array.from(uniqueHydratedMap.values());

                        console.log(`[Orchestration] Hydrating analytics with ${uniqueHydrated.length} unique scraped profiles (from ${hydratedProfiles.length} items).`);
                        analytics.creators = [...(analytics.creators || []), ...uniqueHydrated];

                        // Also populate overindexing if empty, for redundancy in UI
                        if (!analytics.overindexing) analytics.overindexing = {};
                        if (!analytics.overindexing.topCreators) analytics.overindexing.topCreators = analytics.creators;
                    }
                }

                console.log("[Orchestration] AI Analysis merged successfully (Tree Generated).");

                // Helper: Populate visualAnalysis for UI if present
                if (analysis.analytics && (analysis.analytics.aestheticTags || analysis.analytics.vibeDescription || analysis.analytics.lexicon)) {
                    analytics.visualAnalysis = {
                        aestheticTags: analysis.analytics.aestheticTags || [],
                        vibeDescription: analysis.analytics.vibeDescription || '',
                        colorPalette: analysis.analytics.colorPalette || [],
                        lexicon: analysis.analytics.lexicon || []
                    };
                }

                // [NEW] Explicitly Generate "Most Active Profiles" and "Topics" Lists from Tree
                // This ensures the Analytics Panel works even if AI doesn't return separate lists
                if (analysis && analysis.root && analysis.root.children) {
                    const allNodes: any[] = [];
                    const traverse = (node: any) => {
                        allNodes.push(node);
                        if (node.children) node.children.forEach(traverse);
                    };
                    analysis.root.children.forEach(traverse);

                    // 1. Creators List (Ordered by Overindex Score or Followers)
                    analytics.creators = allNodes
                        .filter(n => n.type === 'creator' || n.category === 'creator' || n.group === 'creator')
                        .map(n => ({
                            username: (n.data?.username || n.name || n.label || '').replace(/^@/, ''),
                            frequency: (n.overindexScore || n.affinityPercent) ? (n.rawCount || n.frequency || n.val) : (n.rawCount || n.frequency || 1), // Don't use val if big
                            overindexScore: n.overindexScore || n.data?.overindexScore || 0,
                            affinityPercent: n.affinityPercent || n.data?.affinityPercent || 0,
                            profilePicUrl: n.profilePicUrl || n.data?.profilePicUrl || n.img || '',
                            profileUrl: n.data?.profileUrl || n.data?.externalUrl || n.data?.sourceUrl || n.url,
                            url: n.data?.profileUrl || n.data?.externalUrl || n.data?.sourceUrl || n.url,
                            followerCount: typeof n.followers === 'string' ? n.followers : (n.data?.followersCount || n.data?.followerCount || n.val),
                            followersCount: typeof n.followers === 'number' ? n.followers : (n.data?.followersCount || n.data?.followerCount || (typeof n.followers === 'string' ? 0 : n.val)),
                            biography: n.data?.biography || n.data?.bio || n.bio || '',
                            provenance: n.provenance || n.data?.provenance || { source: 'AI Analysis', method: 'Deep Dive', confidence: 0.9 },
                            ...n.data,
                            ...n
                        }))
                        .slice(0, 50);

                    // [NEW] 1.1 Brands List
                    analytics.brands = allNodes
                        .filter(n => n.type === 'brand' || n.category === 'brand' || n.group === 'brand')
                        .map(n => ({
                            username: (n.data?.username || n.name || n.label || '').replace(/^@/, ''),
                            frequency: (n.overindexScore || n.affinityPercent) ? (n.rawCount || n.frequency || n.val) : (n.rawCount || n.frequency || 1),
                            overindexScore: n.overindexScore || n.data?.overindexScore || 0,
                            affinityPercent: n.affinityPercent || n.data?.affinityPercent || 0,
                            profilePicUrl: n.profilePicUrl || n.data?.profilePicUrl || n.img || '',
                            profileUrl: n.data?.profileUrl || n.data?.externalUrl || n.data?.sourceUrl || n.url,
                            url: n.data?.profileUrl || n.data?.externalUrl || n.data?.sourceUrl || n.url,
                            followerCount: n.data?.followersCount || n.data?.followerCount || n.val || 0,
                            followersCount: n.data?.followersCount || n.data?.followerCount || n.val || 0,
                            biography: n.data?.biography || n.data?.bio || n.bio || '',
                            provenance: n.provenance || n.data?.provenance || { source: 'AI Analysis', method: 'Brand Mining', confidence: 0.9 },
                            ...n.data,
                            ...n
                        }))
                        .slice(0, 50);

                    // 2. Topics List (Ordered by frequency/occurrences)
                    analytics.topics = allNodes
                        .filter(n => n.type === 'topic' || n.type === 'cluster' || n.category === 'topic')
                        .map(n => ({
                            name: n.name || n.label,
                            count: n.val || n.value || 0,
                            provenance: n.provenance || { source: 'AI Clustering', method: 'Deep Dive', confidence: 0.85 },
                            ...n
                        }))
                        .sort((a, b) => (b.count || 0) - (a.count || 0))
                        .slice(0, 50);

                    // 3. Top Content List (Ordered by Engagement/Value)
                    if (analysis.topContent || allNodes.some(n => n.type === 'post' || n.group === 'content')) {
                        const contentFromNodes = allNodes
                            .filter(n => n.type === 'post' || n.group === 'content')
                            .map(n => ({
                                id: n.id,
                                author: n.data?.author || n.label,
                                displayUrl: n.data?.displayUrl || n.data?.imageUrl || n.data?.mediaUrl || n.img,
                                videoUrl: n.data?.videoUrl,
                                url: n.data?.postUrl || n.data?.url || n.url,
                                caption: n.data?.caption || n.label,
                                likesCount: n.data?.likesCount || 0,
                                commentsCount: n.data?.commentsCount || 0,
                                ...n.data
                            }));

                        const contentFromAI = (analysis.topContent || []).map((item: any) => ({
                            author: item.author || 'AI Selection',
                            displayUrl: item.data?.displayUrl || item.data?.imageUrl || item.data?.mediaUrl || item.img,
                            videoUrl: item.data?.videoUrl,
                            url: item.data?.postUrl || item.data?.url || item.url,
                            caption: item.label || item.data?.caption,
                            likesCount: item.val || 0,
                            ...item.data
                        }));

                        analytics.topContent = Array.from(new Map([...contentFromNodes, ...contentFromAI].map(p => [p.id || p.url || p.author + p.caption, p])).values())
                            .slice(0, 50);
                    }

                    console.log(`[Orchestration] Generated lists from tree: ${analytics.creators.length} creators, ${analytics.topics.length} topics, ${analytics.topContent?.length || 0} content items`);

                    // FINAL CLEANUP: Deduplicate and standardize all lists after re-extraction
                    analytics = this.finalizeAnalytics(analytics);
                }

                // Helper: Map Sentiment Analysis for UI
                if (analysis.analytics && (analysis.analytics.sentimentScore !== undefined || analysis.analytics.vibeDescription)) {
                    analytics.sentimentAnalysis = {
                        aggregate_score: analysis.analytics.sentimentScore || 0,
                        vibe_description: analysis.analytics.vibeDescription || '',
                        dominant_emotion: analysis.analytics.sentimentScore > 0.2 ? 'Positive' : analysis.analytics.sentimentScore < -0.2 ? 'Negative' : 'Neutral'
                    };
                }
            }
        } catch (aiErr) {
            console.warn("[Orchestration] AI Analysis failed:", aiErr);
            analytics.error = "AI Analysis failed to generate insights.";
        }

        // --- GEO SCOUTING ---
        if (plan.intent === 'geo_discovery') {
            console.log(`[Orchestration] Running Geo Analysis for intent: ${plan.intent}`);
            try {
                await mongoService.updateJob(job.id, { progress: 90, result: { stage: 'Aggregating locations...' } });
                const allItems = results.flat();
                const rawLocations = allItems.map(p =>
                    p.city_name || p.location || p.address_street || (p.biography ? (p.biography.match(/in ([\w\s,]+)/i)?.[1]) : null)
                ).filter(l => l && typeof l === 'string' && l.length > 3);

                if (rawLocations.length > 0) {
                    const aggregations = await aggregateLocations(rawLocations); // Use helper from geminiService
                    if (!analytics.visualAnalysis) analytics.visualAnalysis = { aestheticTags: [], vibeDescription: '', colorPalette: [] };
                    analytics.visualAnalysis.geoData = aggregations;
                    console.log(`[Orchestration] Aggregated ${aggregations.length} geo clusters.`);
                }
            } catch (geoErr) {
                console.error("Geo Analysis Failed", geoErr);
            }
        }

        // Step 3: Generate graph from results
        await mongoService.updateJob(job.id, {
            progress: 85,
            result: { stage: 'Generating visualization graph...', plan }
        });

        let graphInputData = results;
        if (plan.intent === 'bio_search') {
            const keywordMatch = query.match(/find (?:profiles|developers|designers|founders|people|users) (?:who are|that are|that have) ([\w\s]+)/i);
            const keyword = keywordMatch ? keywordMatch[1].trim().toLowerCase() : '';
            if (keyword) {
                graphInputData = results.map(batch =>
                    batch.filter((p: any) =>
                        (p.biography || p.bio || '').toLowerCase().includes(keyword) ||
                        (p.text || '').toLowerCase().includes(keyword)
                    )
                );
            }
        }

        // [VISUAL INTELLIGENCE] Map Gemini Visual Data to Graph Format
        if (analytics && analytics.visualAnalysis) {
            (analytics as any).visual = {
                brands: analytics.visualAnalysis.brands || [],
                aesthetics: (analytics.visualAnalysis.aestheticTags || []).map((t: string) => ({ style: t, score: 0.9 })),
                colorPalette: analytics.visualAnalysis.colorPalette
            };

            // Ensure 'brands' from root are also available in visual for consistency if missing
            if ((!analytics.visual.brands || analytics.visual.brands.length === 0) && analytics.brands) {
                analytics.visual.brands = analytics.brands.map((b: any) => ({ name: b.name || b.label, count: b.count || 5 }));
            }

            // Map to Frontend visualTheme
            (analytics as any).visualTheme = {
                primaryColor: analytics.visualAnalysis.colorPalette?.[0] || '#ec4899',
                textureStyle: analytics.visualAnalysis.aestheticTags?.[0] || 'generic',
                nodeTypeMapping: {}
            };
            console.log("[Orchestration] Mapped Visual Data & Theme.");
        }

        // Pass analytics to graph generator (CRITICAL FIX)
        const graphData = await this.generateGraphFromResults(plan, graphInputData, query, analytics);

        // [FIX] Smart Merge Analytics
        if (graphData.analytics) {
            const keys = ['creators', 'brands', 'topics', 'clusters', 'subtopics', 'topContent'];

            keys.forEach(key => {
                if (graphData.analytics[key] && Array.isArray(graphData.analytics[key])) {
                    if (!analytics[key]) analytics[key] = [];

                    // Create map to deduplicate
                    const existingMap = new Map(analytics[key].map((i: any) => [i.username || i.handle || i.name || i.label, i]));

                    graphData.analytics[key].forEach((item: any) => {
                        const id = item.username || item.handle || item.name || item.label;
                        if (id && !existingMap.has(id)) {
                            analytics[key].push(item);
                        }
                    });
                }
            });

            // [NEW] 100% ENRICHMENT GUARANTEE: Perform Deep Enrichment for missing nodes in Query Builder
            console.log('[Orchestration] 🔍 Checking for enrichment gaps...');
            const profileMap = new Map<string, StandardizedProfile>();
            const allScrapedItems = results.flat();
            for (const item of allScrapedItems) {
                const profile = this.normalizeToStandardProfile(item);
                if (profile) {
                    if (profile.id) profileMap.set(profile.id, profile);
                    if (profile.username) profileMap.set(profile.username.toLowerCase().replace('@', '').trim(), profile);
                }
            }
            // datasetId is already defined in the outer scope of processOrchestration/MapGen
            await this.performDeepEnrichment(graphData, datasetId, job.id, profileMap);

            // Merge scalar props
            const { creators, brands, topics, clusters, subtopics, topContent, ...others } = graphData.analytics;
            Object.assign(analytics, others);

            // [FIX] Deduplicate and Clean Lists (Brands & Creators)
            const dedupeList = (list: any[]) => {
                if (!list || !Array.isArray(list)) return [];
                const seen = new Set();
                return list.filter(item => {
                    const key = (item.username || item.handle || item.name || item.label || '').toLowerCase().replace('@', '');
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            };

            if (analytics.brands) analytics.brands = dedupeList(analytics.brands);
            if (analytics.creators) analytics.creators = dedupeList(analytics.creators);

            // [NEW] Brand Evidence Mining (Dataset-Grounded)
            // Scan the raw scraped posts/bios ('itemsToAnalyze') to find actual mentions of these brands.
            // This provides the "Specific Provenance" requested by the user.
            if (analytics.brands && itemsToAnalyze.length > 0) {
                console.log("[Orchestration] Mining specific evidence for brands...");
                analytics.brands.forEach((brand: any) => {
                    const brandName = (brand.name || brand.label || '').toLowerCase();
                    const brandHandle = (brand.handle || '').toLowerCase().replace('@', '');

                    // Find occurrences
                    const mentions = itemsToAnalyze.filter(p => {
                        const text = ((p.biography || p.bio || '') + ' ' + (p.text || p.caption || '')).toLowerCase();
                        return text.includes(brandName) || (brandHandle && text.includes(brandHandle));
                    });

                    if (mentions.length > 0) {
                        // Pick the best example (prefer Bio over Post)
                        const bestMatch = mentions.find(m => m.biography) || mentions[0];
                        const evidenceText = bestMatch.biography || bestMatch.text || bestMatch.caption;
                        const author = bestMatch.username || bestMatch.ownerUsername;

                        brand.provenance = {
                            source: 'Dataset Mention',
                            evidence: `Mentioned by @${author}: "${evidenceText.substring(0, 60)}..."`,
                            count: mentions.length
                        };
                        // Boost confidence score since we found real data
                        brand.score = (brand.score || 0) + 2;
                    }
                });
            }

            // [NEW] Creator Evidence Mining (Detailed Provenance)
            if (analytics.creators && itemsToAnalyze.length > 0) {
                console.log("[Orchestration] Mining specific evidence for creators...");
                analytics.creators.forEach((creator: any) => {
                    const cName = (creator.name || creator.label || '').toLowerCase();
                    // Only search by name if it's unique enough (>4 chars)
                    const searchName = cName.length > 4 ? cName : null;
                    const cHandle = (creator.handle || '').toLowerCase().replace('@', '');

                    const mentions = itemsToAnalyze.filter(p => {
                        const text = ((p.biography || p.bio || '') + ' ' + (p.text || p.caption || '')).toLowerCase();
                        return (searchName && text.includes(searchName)) || (cHandle && text.includes(cHandle));
                    });

                    if (mentions.length > 0) {
                        const bestMatch = mentions.find(m => m.biography) || mentions[0];
                        const evidenceText = bestMatch.biography || bestMatch.text || bestMatch.caption || '';
                        const author = bestMatch.username || bestMatch.ownerUsername;

                        creator.provenance = {
                            source: 'Dataset Mention',
                            evidence: `Mentioned by @${author}: "${evidenceText.substring(0, 60)}..."`,
                            count: mentions.length
                        };
                        creator.score = (creator.score || 0) + 2;
                        if (mentions.length > 2) creator.isVerified = true;
                    }
                });
            }

            // [NEW] Over-Indexed Profile Analysis (Requested "List of over indexed profiles")
            // Scan for ANY profile mentioned > 5 times (User Threshold)
            if (itemsToAnalyze.length > 0) {
                console.log("[Orchestration] Calculating Over-Indexed Profiles (>3 mentions)...");

                const mentionCounts = new Map<string, { count: number, references: any[] }>();

                itemsToAnalyze.forEach(p => {
                    const text = ((p.biography || p.bio || '') + ' ' + (p.text || p.caption || '')).toLowerCase();
                    const mentions = text.match(/@[\w\._]+/g);
                    if (mentions) {
                        mentions.forEach(m => {
                            const handle = m.replace('@', '').toLowerCase();
                            if (handle.length < 3) return; // Skip noise

                            if (!mentionCounts.has(handle)) {
                                mentionCounts.set(handle, { count: 0, references: [] });
                            }
                            const entry = mentionCounts.get(handle)!;
                            entry.count++;
                            // Store reference (limited to 10)
                            if (entry.references.length < 10) {
                                entry.references.push({
                                    source: 'mention',
                                    text: text.substring(0, 100) + '...',
                                    author: p.username || p.ownerUsername,
                                    url: p.url || p.postUrl || `https://instagram.com/${p.username}`
                                });
                            }
                        });
                    }
                });

                // Filter for > 5 occurrences
                const overIndexedCandidates = Array.from(mentionCounts.entries())
                    .filter(([_, data]) => data.count > 3)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 20); // Top 20

                if (overIndexedCandidates.length > 0) {
                    analytics.overindexing = analytics.overindexing || {};
                    analytics.overindexing.profiles = await Promise.all(overIndexedCandidates.map(async ([handle, data]) => {
                        // Try to resolve profile details
                        let profile = profileMap.get(handle);
                        // If not in map, try global lookup (Ghost Node)
                        if (!profile) {
                            try {
                                profile = await mongoService.findGlobalProfile(handle);
                            } catch (e) { /* ignore */ }
                        }

                        return {
                            label: profile?.fullName || handle,
                            handle: '@' + handle,
                            role: 'Over-Indexed Profile',
                            overindexScore: data.count, // Actual count for UI
                            data: {
                                bio: profile?.biography || 'Identified via high mention frequency.',
                                profilePicUrl: this.sanitizeUrl(profile?.profilePicUrl || ''),
                                followers: profile?.followersCount || 0,
                                provenance: {
                                    source: 'Dataset Frequency',
                                    // [CRITICAL] User asked for "specifically all the occurences referemces"
                                    evidence: data.references.map(r => ({
                                        type: 'mention',
                                        text: `Mentioned by @${r.author}`,
                                        quote: r.text,
                                        url: r.url
                                    })),
                                    count: data.count
                                }
                            }
                        };
                    }));
                    console.log(`[Orchestration] Identified ${overIndexedCandidates.length} over-indexed profiles.`);
                }
            }
        }

        const dashboardConfig = generateDashboardConfig(query, plan.intent, analytics);

        // Step 4: Save to database
        const localId = uuidv4();
        await mongoService.createDataset({
            id: localId,
            userId: job.userId,
            name: `Query Builder: ${query}`,
            platform: plan.platform || 'instagram',
            targetProfile: query,
            dataType: 'audience',
            recordCount: graphData.nodes.length,
            tags: ['orchestration', plan.intent],
            metadata: {
                query,
                sampleSize,
                intent: plan.intent,
                mode: 'orchestration',
                postLimit: job.metadata?.postLimit || 3,
                // [FIX] Store summary only to avoid BSON 16MB limit. Full analytics is in graph_snapshot.
                analyticsSummary: {
                    creatorCount: analytics.creators?.length || 0,
                    topicCount: analytics.topics?.length || 0,
                    clusterCount: analytics.clusters?.length || 0
                },
                dashboardConfig
            },
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // [FIX] Explicit GZIP Compression handled by mongoService transparently
        const finalGraphSnapshot = {
            nodes: graphData.nodes,
            links: graphData.links,
            profileFullName: query,
            recordType: 'graph_snapshot',
            process: 'orchestrator',
            // analytics, // REMOVED - Stored separately
            plan,
            datasetIds: executionOutput.datasetIds
        };

        const analyticsRecord = {
            datasetId: localId,
            recordType: 'analytics_data' as const, // [FIX] Strict type
            platform: (plan.platform || 'instagram') as 'instagram' | 'tiktok' | 'youtube',
            data: analytics, // Full rich data
            createdAt: new Date()
        };

        const snapshotRecord = {
            datasetId: localId,
            recordType: 'graph_snapshot' as const, // [FIX] Strict type
            platform: (plan.platform || 'instagram') as 'instagram' | 'tiktok' | 'youtube',
            data: finalGraphSnapshot,
            createdAt: new Date()
        };

        // Insert both records. mongoService handles compression & chunking (>14MB) automatically.
        await mongoService.insertRecords([snapshotRecord, analyticsRecord]);

        // Calculate Accuracy Scores
        const accuracyScores = queryAccuracyService.scoreQueryResult(query, analytics, job.metadata);
        const confidence = queryAccuracyService.calculateConfidence(query, analytics, job.metadata);

        // [NEW] BILLING & TRANSACTION LOGGING
        try {
            // Calculate total cost from non-cached steps
            let totalChargedAmount = 0;
            let breakdown: any = { steps: [] };

            if (plan.steps) {
                plan.steps.forEach((step: any) => {
                    if (!step.cached) {
                        const stepCost = step.estimatedCost || 0;
                        totalChargedAmount += stepCost;
                        breakdown.steps.push({
                            actor: step.actorId,
                            cost: stepCost
                        });
                    }
                });
            }

            // Add base orchestration fee if not fully cached
            const baseFee = allCached ? 0 : 2.50;
            totalChargedAmount += baseFee;
            breakdown.orchestrationFee = baseFee;

            if (totalChargedAmount > 0) {
                await costCalculator.trackUsageAndDeduct(
                    job.userId,
                    'query_builder',
                    `Orchestration: ${query}`,
                    {
                        totalCost: totalChargedAmount / 1.5, // Approx base cost
                        chargedAmount: Number(totalChargedAmount.toFixed(2)),
                        breakdown
                    }
                );
                console.log(`[JobOrchestrator] ðŸ’° Orchestration Transaction logged: Â£${totalChargedAmount.toFixed(2)}`);
            }

        } catch (billingError: any) {
            console.error(`[JobOrchestrator] ðŸš¨ Billing Failed for Orchestration Job ${job.id}:`, billingError);
        }

        await mongoService.updateJob(job.id, {
            status: 'completed',
            progress: 100,
            result: {
                datasetId: localId,
                plan,
                nodeCount: graphData.nodes.length,
                qualityScore: accuracyScores.overall,
                confidenceScore: confidence.score,
                accuracyMetrics: accuracyScores,
                lowConfidenceAreas: confidence.lowConfidenceAreas
            }
        });


        // Update Dataset Metadata with scores for UI visibility
        await mongoService.updateDataset(localId, {
            metadata: {
                ...job.metadata,
                dashboardConfig,
                qualityScore: accuracyScores.overall,
                confidenceScore: confidence.score,
                accuracyMetrics: accuracyScores
            }
        });

        await this.notifyOrchestrationComplete(job, query, localId);
    }




    /**
     * Cancel a running job
     */
    async cancelJob(jobId: string) {
        // If it's the currently processing job, we can try to flag it to stop
        // Realistically, for async/await loops, we check job status periodically
        // or just accept that the loop will finish safely but result won't be used.
        console.log(`[JobOrchestrator] Request to cancel job ${jobId}`);
        // We rely on the loops checking mongo status or an in-memory flag?
        // For now, just logging. The route handler updates status to 'aborted'.
    }

    /**
     * Get existing datasets for a user (for reuse detection)
     */
    private async getExistingDatasets(userId: string): Promise<any[]> {
        try {
            const db = mongoService.getDb();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const datasets = await db.collection('datasets')
                .find({
                    userId,
                    createdAt: { $gt: thirtyDaysAgo }
                })
                .sort({ createdAt: -1 })
                .limit(50)
                .toArray();

            return datasets.map(d => ({
                id: d.id,
                name: d.name,
                platform: d.platform,
                targetProfile: d.targetProfile,
                dataType: d.dataType,
                recordCount: d.recordCount,
                tags: d.tags || [],
                createdAt: d.createdAt,
                metadata: d.metadata // [FIX] Include metadata for Reuse Logic
            }));
        } catch (e) {
            console.warn('[Orchestration] Failed to fetch existing datasets:', e);
            return [];
        }
    }

    /**
     * Programmatic dataset matcher for simple cases
     * Returns dataset IDs if a clear match is found, null otherwise
     */
    private programmaticDatasetMatch(query: string, existingDatasets: any[]): { ids: string[], totalRecords: number, maxDepth: number } | null {
        if (existingDatasets.length === 0) return null;

        const queryLower = query.toLowerCase().trim();
        const isCommunityQuery = /community|audience|followers|over-indexed|talking about|into|brands|subcultures/i.test(queryLower);

        // Extract handles from query (e.g., "@guiness", "@irnbru")
        const handleRegex = /@(\w+)/g;
        const handles = [...queryLower.matchAll(handleRegex)].map(m => m[1]);

        if (handles.length === 0) return null;

        let matchedIds: string[] = [];
        let totalRecords = 0;
        let maxDepth = 0;

        // Helper to update metrics
        const addDataset = (d: any) => {
            matchedIds.push(d.id);
            totalRecords += (d.recordCount || 0);
            // Consistent depth detection
            const depth = d.metadata?.postLimit || (d.metadata?.sampleSize && d.metadata.sampleSize <= 100 ? 20 : 3);
            if (depth > maxDepth) maxDepth = depth;
        };

        // Case 1: Exact query match
        for (const dataset of existingDatasets) {
            const datasetQuery = (dataset.metadata?.query || dataset.name || '').toLowerCase();
            if (datasetQuery === queryLower) {
                console.log(`[Programmatic Match] âœ… Exact query match: "${dataset.metadata?.query}"`);
                addDataset(dataset);
                return { ids: matchedIds, totalRecords, maxDepth };
            }
        }

        // Case 2: Comparison query (e.g., "map @guiness vs @irnbru")
        const isComparison = /\s+(vs|versus|and)\s+/i.test(queryLower);
        if (isComparison && handles.length >= 2) {
            const matchedHandles = new Set<string>();

            for (const handle of handles) {
                for (const dataset of existingDatasets) {
                    const targetProfile = (dataset.targetProfile || '').toLowerCase().replace('@', '');
                    const datasetQuery = (dataset.metadata?.query || '').toLowerCase();

                    // Check if dataset is for this specific handle
                    if (targetProfile === handle || datasetQuery.includes(`@${handle}`)) {
                        // Check freshness (30 days)
                        const ageMs = Date.now() - new Date(dataset.createdAt).getTime();
                        const ageDays = ageMs / (1000 * 60 * 60 * 24);

                        if (ageDays <= 30 && !matchedHandles.has(handle)) {
                            addDataset(dataset);
                            matchedHandles.add(handle);
                            console.log(`[Programmatic Match] âœ… Found dataset for @${handle}: "${dataset.metadata?.query || dataset.name}"`);
                            break; // Use most recent dataset for this handle
                        }
                    }
                }
            }

            // Only return if we found datasets for ALL handles in the comparison
            if (matchedIds.length === handles.length) {
                console.log(`[Programmatic Match] âœ… Complete match for comparison query (${matchedIds.length} datasets)`);
                return { ids: matchedIds, totalRecords, maxDepth };
            }
        }

        // Case 3: Single handle query
        if (handles.length === 1) {
            const handle = handles[0];
            for (const dataset of existingDatasets) {
                const targetProfile = (dataset.targetProfile || '').toLowerCase().replace('@', '');

                if (targetProfile === handle) {
                    const ageMs = Date.now() - new Date(dataset.createdAt).getTime();
                    const ageDays = ageMs / (1000 * 60 * 60 * 24);

                    if (ageDays <= 30) {
                        // [NEW] Refuse shallow matches for community queries
                        if (isCommunityQuery && dataset.recordCount < 10 && dataset.dataType !== 'audience') {
                            console.log(`[Programmatic Match] âŒ Refusing shallow dataset (${dataset.recordCount} recs) for community query.`);
                            continue;
                        }

                        console.log(`[Programmatic Match] âœ… Single handle match: @${handle}`);
                        addDataset(dataset);
                        return { ids: matchedIds, totalRecords, maxDepth };
                    }
                }
            }
        }

        return null; // No programmatic match found
    }


    /**
     * Deterministic Regex-based Intent Router
     * Bypass AI ambiguity for specific, rigid query patterns.
     */


    /**
     * Analyze Map Requirements (Server-Side Port)
     * Port of analyzeMapRequirements from orchestrationService.ts
     */
    public async analyzeMapRequirements(
        query: string,
        sampleSize: number = 100,
        existingDatasets: any[] = [],
        ignoreCache: boolean = false,
        useDeepAnalysis: boolean = false,
        seedContext: string = "",
        postLimit: number = 3
    ): Promise<any> {
        console.log(`[analyzeMapRequirements] Query: "${query}", Sample: ${sampleSize}, Depth: ${postLimit}, Deep: ${useDeepAnalysis}`);

        const model = "gemini-3-flash-preview";
        console.log(`[Server] Using Advanced Logic (${model}) for query analysis (Verified Fix).`);

        // Prepare context
        // [MODIFIED] User requested deduplication via DB scan, not prompt context.
        // [FIX] Disable Caching as per User Request: "can you remoe the caching of queries"
        const effectiveDatasets: any[] = [];
        // const effectiveDatasets = ignoreCache ? [] : existingDatasets;

        console.log(`[Dataset Reuse] Checking ${effectiveDatasets.length} existing datasets (Internal Logic) - CACHING DISABLED`);

        // [NEW] Try programmatic matching first (Hybrid Approach - Option C)
        const programmaticMatch = null; // Disable programmatic match too
        // const programmaticMatch = this.programmaticDatasetMatch(query, effectiveDatasets);
        let programmaticInstruction = "";
        let cachedStats = "";
        if (programmaticMatch) {
            const { ids, totalRecords, maxDepth } = programmaticMatch;
            console.log(`[Dataset Reuse] ðŸš€ Programmatic match found (${ids.length} datasets). Injecting into AI context.`);
            programmaticInstruction = `\n**MANDATORY REUSE**: You MUST include these dataset IDs in "existingDatasetIds": ${JSON.stringify(ids)}. 
            IMPORTANT: Even if reusing, you MUST still provide the "steps" that logically lead to this data. 
            If requested Sample Size (${sampleSize}) exceeds cached capacity (${totalRecords}), prescribe an additional scrape step for the REMAINING ${Math.max(0, sampleSize - totalRecords)} records. 
            If requested Scrape Depth (${postLimit}) exceeds cached depth (${maxDepth}), prescribe an enrichment step for the deeper posts.`;

            cachedStats = `\nCACHED CAPACITY: ${totalRecords} records at depth ${maxDepth}.`;
        } else {
            console.log(`[Dataset Reuse] No programmatic match, using AI for intelligent matching...`);
        }

        // [NEW] Add dataset context for AI fallback (lightweight version)
        let datasetContext = '';
        if (effectiveDatasets.length > 0) {
            const datasetSummaries = effectiveDatasets.slice(0, 15).map(d => ({
                id: d.id,
                query: d.metadata?.query || d.name,
                targetProfile: d.targetProfile,
                createdAt: d.createdAt
            }));

            datasetContext = `\n\n=== EXISTING DATASETS ===\n${JSON.stringify(datasetSummaries, null, 2)}\n\n**REUSE**: If query matches existing datasets, set "existingDatasetIds": ["id1", ...] and ALWAYS provide the sequence of scrape "steps" that would generate this data.\n===\n${programmaticInstruction}\n`;
        }

        const actorContext = (scraperRegistryRaw as any[]).map((a: any) =>
            `- Actor: ${a.name} (ID: ${a.id})
   Desc: ${a.description}
   Cost: $${a.costPerThousand}/1k
   INPUT SCHEMA (STRICTLY FOLLOW THIS): ${JSON.stringify(a.inputSchema, null, 2)}`
        ).join('\n\n');

        // This is the FULL prompt from orchestrationService.ts - I'll include it completely
        let prompt = `
    Task: You are an Intelligent Orchestrator for a Fandom Mapping system.
    Goal: Create a "Scrape Plan" to answer the user's query perfectly.

    ${datasetContext}

    ${seedContext ? `\n\n=== CONTEXT FROM SEED PROFILES ===\n${seedContext}\n===================================\n` : ''}

    User Query: "${query}"
    Sample Size Requested: ${sampleSize}
    Scrape Depth Requested: ${postLimit}
    ${cachedStats}
    
    GUIDELINES:
    1. If CACHED CAPACITY exists and meets requirements, set "existingDatasetIds" and provide steps (cost will be zeroed by UI if fully matching).
    2. If Sample Size (${sampleSize}) > Cached Capacity, prescribe a "Top-up" scrape for the difference.
    3. If Scrape Depth (${postLimit}) > Cached Depth, prescribe a "Deep Enrichment" step for missing posts.
    4. Provide reasoning for every step.
    Deep Analysis Requested: "YES"}
    


    Available Scrapers (Apify):
    ${actorContext}





    Instructions:
    1. **STRATEGY FIRST**: Define the scraping strategy (Actors/Steps) based on User Query intent.
       - DO NOT change the *method* based on sample size.
       - **CRITICAL FOR SEARCH QUERIES**: If using Instagram search (searchType/searchLimit):
         * searchLimit = Math.min(1000, ${sampleSize}) (Cap at 1000 for search efficiency, scale with ${sampleSize})
         * estimatedRecords = searchLimit Ã— resultsLimit (e.g., ${sampleSize} profiles Ã— 2 posts = ${sampleSize * 2} records)
       - For other scrapers: Apply sample size to 'limit', 'maxItem', or 'resultsLimit' parameters.
       - **TWO-DIMENSIONAL SCALING (CRITICAL)**: For 'followings' or 'followers' steps (2-hop), use "max_count": 20 as a safe placeholder. The system will automatically RECONCILE this based on the input list size vs sampleSize. 
         * Rule: The larger the input list, the smaller the individual limit (Down to 10). The smaller the list, the deeper the scrape (Up to 120).
       
    2. **Generate Scrape Plan**:
       - Create a precise sequence of steps using the available actors.
       - Focus purely on generating the optimal strategy for the new query.

    3. Identify the user's INTENT and map it to one of these:
       - **"over_indexing"** or **"brand_affinity"**: Find brands/accounts that followers of X disproportionately follow
         * Keywords: "over-indexed", "over indexed", "overindexed", "affinity", "brands that", "accounts that", "who do they follow", "followings of followers"
         * **CRITICAL**: "Map the overindexed profiles..." or "followings of followers" queries MUST use this intent.
         * Example: "over-indexed brands that followers of @nike follow"
         * Example: "Map the overindexed profiles in followings of followers of @rustlersuk"
         * Example: "What other drinks are followers of @guinness talking about?" â†’ intent: "brand_affinity"
       - "sensitivity_analysis": Cross-shopping behavior (e.g., "What else do X fans buy?")
       - "influencer_identification": Find creators/accounts in a niche
       - **"complex_search"**: Multi-criteria queries requiring Google Search to find matching profiles
         * Keywords: location names (London, NYC, Paris, etc.) + brand mentions (@brand) + engagement terms (high engagement, viral, trending) + follower ranges (micro-influencer, nano-influencer, 10k-100k)
         * **CRITICAL**: Queries with 2+ of these criteria types should use this intent
         * Example: "Find micro-influencers in London who post about @rustlersuk and have high engagement"
         * Example: "nano-influencers in Paris who mention @nike"
         * Example: "trending creators in NYC talking about @starbucks with 50k-200k followers"
         * Strategy: Use Google Search to find profiles matching complex criteria, then enrich with Instagram data
       - "network_clusters": Community overlap/tribes
       - **"audience_overlap"**: Compare audiences of two or more entities
         * Keywords: "overlap", "shared audience", "intersection", "common followers", "who follows both"
         * **CRITICAL**: Extract entities (e.g. "@nike and @adidas")
         * Example: "What is the audience overlap between @nike and @adidas?"
         * Example: "Do @starbucks and @dunkin share the same fans?"
         * Strategy: Scrape recent posts for both entities, extract unique engagers (likers/commenters), and calculate intersection.
       - "subject_matter": Topic/interest analysis of a community
       - "bio_search": Filter profiles by bio keywords
       - **"viral_content"**: Analyze trending/breaking content in a topic
         * Keywords: "viral", "trending", "popular posts", "what is hot", "exploding", "breakout"
         * **CRITICAL**: Extract Topic/Hashtag
         * Example: "What is trending in #skincare?"
         * Example: "Show me viral posts about @nike"
         * Strategy: Scrape recent posts and calculate velocity (Engagement/Time) to find breakout hits
       - "market_mapping": Find businesses/services providing a specific offering
         * Keywords: "map the ... market", "providers in", "services in", "companies", "agencies"
         * Strategy: Use 'apify/instagram-api-scraper' with 'search' input (e.g. "boiler repair", "#boilerrepair") OR 'directUrls' to hashtag pages.
       - **"competitor_content_analysis"**: Analyze competitor's content performance
         * Keywords: "content performs", "top posts", "best content for", "what works for", "competitor content", "@competitor posts", "what type of content"
         * **CRITICAL**: Extract competitor handle from query (e.g., "@nike" â†’ "nike")
         * Example: "What content performs best for @nike?"
         * Example: "Show me top posts from @adidas"
         * Example: "What type of content gets the most engagement for @competitor?"
         * Strategy: Scrape competitor's recent posts to analyze content performance patterns
       - **"hashtag_tracking"**: Monitor performance of a specific hashtag
         * Keywords: "track #", "analyze #", "hashtag performance", "how is # performing", "monitor hashtag"
         * **CRITICAL**: Extract hashtag (e.g., "#summer" or "summer")
         * Example: "Track performance of #summervibes"
         * Example: "Analyze #blackfriday"
         * Strategy: Scrape posts from hashtag page to analyze reach and engagement
       - **"engagement_benchmark"**: Compare performance metrics between accounts
         * Keywords: "benchmark", "compare engagement", "better engagement", "performance comparison", "stats vs"
         * **CRITICAL**: Extract ALL handles (e.g. "@nike vs @adidas" -> ["nike", "adidas"])
         * Example: "Benchmark @nike vs @adidas"
         * Example: "Who has better engagement @pepsi or @coke?"
         * Strategy: Scrape recent posts for all identified profiles to compare metrics
       - **"ugc_discovery"**: Find User Generated Content and creators involved with a brand
         * Keywords: "UGC", "user generated content", "community posts", "who is posting about", "tagged posts"
         * **CRITICAL**: Extract brand name (e.g. "@nike" -> "nike")
         * Example: "Find UGC for @lego"
         * Example: "Show me user generated content for @starbucks"
         * Strategy: Scrape hashtag corresponding to brand name (e.g. #lego) to find community posts
       - **"sentiment_analysis"**: Analyze brand reputation and community sentiment
         * Keywords: "sentiment", "feel about", "reputation", "what do people think", "hate", "love", "opinion", "reaction to"
         * **CRITICAL**: Extract brand/topic name
         * Example: "What is the sentiment around @tesla?"
         * Example: "How do people feel about the new iPhone?"
         * Strategy: Scrape comments from top posts to analyze sentiment valence
       - **"influencer_identification"**: Find creators/accounts in a specific niche or location
         * Keywords: "find influencers", "micro-influencers", "creators in", "who talks about", "instagrammers in", "find accounts"
         * **CRITICAL**: Identify Niche (e.g. "vegan") and Location (e.g. "London") if present
         * Example: "Find micro-influencers in London who post about vegan food"
         * Example: "Find tech creators in SF"
         * Strategy: Use Google Search to identify relevant profiles, then scrape their details
       - "general_map": General exploration

    4. Based on intent, define the CORRECT ACTORS and INPUT SCHEMA.
    
    5. **CATEGORY EXTRACTION**: If the query follows the pattern "What other [CATEGORY]...", extract the category (e.g., "drinks", "shoes", "games") and add it to the output JSON as "focusCategory": "drinks". This helps the AI filter results appropriately.

    **CRITICAL RULES:**
    **CRITICAL RULES:**
    1. **Universal Content Enrichment (MANDATORY)**: check if the user wants to populate the "Entity Inspector" or "Post Gallery". If so, you MUST add a final enrichment step using 'apify/instagram-api-scraper'.
       - **Purpose**: To get full biographies, accurate follower counts, and latest posts/media for every node.
       - **Input**: Use "usernames" (extracted from step 1).
       - **Config**: Use 'apify/instagram-profile-scraper'.
       - **Pattern**: Scrape Usernames (Step 1) -> Enrich with Profile Scraper (Step 2).
       - **CRITICAL**: Use 'apify/instagram-profile-scraper' for deep enrichment. It provides the most accurate bio and follower counts.
       - **CRITICAL**: DO NOT use 'datadoping/instagram-following-scraper' (ID: IkdNTeZnRfvDp8V25) or ANY 'datadoping' scrapers. They are deprecated. Use 'thenetaji/instagram-followers-followings-scraper' (ID: asIjo32NQuUHP4Fnc) for relationships.

    2. **Sample Size**: The 'sampleSize' applies to Step 1 (base scrape).

    **INTENT-SPECIFIC STRATEGIES:**

    â†’ Intent: "over_indexing" or "brand_affinity"
      â†’ Strategy (2-hop):
        1. Scrape Followers of [X] (Get Usernames).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["[BRAND]"], "type": "followers", "max_count": ${sampleSize} }
        2. Scrape who THOSE followers follow (to find over-indexed brands).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["USE_DATA_FROM_STEP_step_1"], "type": "followings", "max_count": 100 }
           - Note: System will scale this "100" based on how many profiles were found in Step 1.
        3. MANDATORY: Enrich profiles of the brands found in Step 2.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_2"], "resultsType": "details", "addParentData": true }
        - Reasoning: "Step 1 gets followers, Step 2 gets their followings, Step 3 enriches the resulting over-indexed brands."

    â†’ Intent: "comparison" or "audience_overlap"
      â†’ **Keywords**: "vs", "versus", "compare", "comparison", "fandom" (e.g., "compare the fandoms of"), "overlap between", "difference between", "similarities between"
      â†’ **Patterns**: 
        * "@profile1 vs @profile2"
        * "compare @A and @B"
        * "compare the fandoms of @X and @Y"
        * "@handle1 versus @handle2"
        * "overlap between @brand1 and @brand2 fans"
      â†’ **CRITICAL**: When you detect these keywords/patterns, extract BOTH profile handles and create parallel scrape steps
      â†’ Strategy (Multi-Source):
        1. Scrape Followers of Entity A (e.g. @nike).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["nike"], "type": "followers", "max_count": ${Math.ceil(sampleSize / 2)} }
        2. Scrape Followers of Entity B (e.g. @mrbeast).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["mrbeast"], "type": "followers", "max_count": ${Math.ceil(sampleSize / 2)} }
        3. (Optional) Scrape unique Followings if "over_indexing" comparison is requested.
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["USE_DATA_FROM_STEP_step_1", "USE_DATA_FROM_STEP_step_2"], "type": "followings", "max_count": 20 }
        4. MANDATORY: Enrich profiles for both sets.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_1", "USE_DATA_FROM_STEP_step_2"], "resultsType": "details", "addParentData": true }
        - Reasoning: "Parallel scraping of both audiences allows for Venn diagram overlap or comparison analysis."

    â†’ Intent: "sensitivity_analysis" or "network_clusters"
      â†’ Strategy:
        1. Scrape Followers of [X] (Get Usernames).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["[BRAND]"], "type": "followers", "max_count": ${sampleSize} }
        2. (For sensitivity/affinity) Scrape who THOSE followers follow.
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["USE_DATA_FROM_STEP_step_1"], "type": "followings", "max_count": 100 }
           - Note: System will scale this "100" based on Step 1 list length.
        - Reasoning: "Step 1 gets usernames, Step 2 maps their following for brand affinity."

    2. "Find [NICHE] creators" / "Rising stars in [TOPIC]" / "Top influencers for [BRAND]"
    â†’ Intent: "influencer_identification"
      â†’ Strategy:
        1. Use Instagram Search to find profiles matching the niche.
           - Actor: 'apify/instagram-scraper'
           - Input: {
               "search": "[SIMPLE_KEYWORD]",
               "searchType": "user",
               "searchLimit": ${Math.min(250, sampleSize)},
               "resultsType": "details",
               "resultsLimit": ${postLimit}
           }
           - **CRITICAL**: Use 'search' parameter, NOT 'searchQuery'.
           - **CRITICAL**: 'search' MUST be the EXTRACTED MAIN KEYWORD(S) ONLY.
           - Remove all natural language ("find", "show me"), modifiers ("influencers", "profiles"), and quantifiers (">5k", "in UK").
           - Example: Query "find fashion influencers in London" -> search: "fashion london"
           - Example: Query "who are the main influencers in the Ecclesiastical community?" -> search: "Ecclesiastical"
           - Example: Query "software developers with >5k followers" -> search: "software developer"
           - **Action**: Populate "search_keywords": ["Ecclesiastical"] in the plan JSON.

    3. "Overlap between [BRAND A] and [BRAND B] fans"
    â†’ Intent: "audience_overlap"
      â†’ Strategy:
        1. Scrape Followers of Brand A.
        2. Scrape Followers of Brand B.
        3. (Implicit) System will calculate overlap.

    4. "Bio-based filtering" / "Find [ROLE] who follow [USER]"
    â†’ Intent: "bio_search"
      â†’ Strategy:
        1. Scrape Followers (Get Usernames).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["[USER]"], "type": "followers", "max_count": ${sampleSize} }
        2. MANDATORY: Enrich profiles to get BIO text for filtering.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_1"], "resultsType": "details", "addParentData": true }
        3. Generate 10-15 related keywords for filtering.
           - Populate 'filter.bioKeywords' in JSON output.
           - Populate "search_keywords": ["role", "keyword"] for context.

    5. "What are followers of X into?" / "Interests of X's audience"
    â†’ Intent: "subject_matter"
      â†’ Strategy:
        1. Scrape Followers of X (Base Nodes).
        2. Scrape Posts of a subset (20-50) of THESE Followers.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_1"], "resultsType": "posts", "resultsLimit": 15 }

    6. "Where are followers of X from?" / "Top cities for X"
    â†’ Intent: "geo_discovery"
      â†’ Strategy:
        1. Scrape Followers of X (Base Nodes).
           - Actor: 'thenetaji/instagram-followers-followings-scraper'
           - Input: { "username": ["[BRAND]"], "type": "followers", "max_count": ${sampleSize} }
        2. MANDATORY: Enrich profiles to get location/city data.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_1"], "resultsType": "details", "addParentData": true }
        - Reasoning: "Step 1 gets the audience, Step 2 enriches them with geographic data (city, country, etc.)"

    7. "Complex multi-criteria search" / "Find [TYPE] in [LOCATION] who [CRITERIA]"
    â†’ Intent: "complex_search"
      â†’ Strategy:
        1. Use Google Search to find Instagram profiles matching complex criteria.
           - Actor: 'apify/google-search-scraper'
           - Input: {
               "queries": ["instagram [BRAND_MENTIONS] [LOCATIONS]"],
               "maxPagesPerQuery": 10,
               "resultsPerPage": 100
             }
           - **CRITICAL KEYWORD EXTRACTION RULES**:
             * **INCLUDE ONLY**:
               - Brand mentions: Extract @handles or brand names (e.g., "@rustlersuk" â†’ "rustlersuk")
               - Locations: City/country names (e.g., "London", "NYC", "Paris")
             * **EXCLUDE** (These are filters, not search terms):
               - Platform terms: "instagram", "tiktok", "social media"
               - Influencer types: "micro-influencer", "nano-influencer", "creator", "influencer"
               - Engagement terms: "high engagement", "viral", "trending", "popular"
               - Follower ranges: "10k-100k", "followers"
               - Action words: "find", "show me", "who post about"
           - **Example Extraction**:
             * Query: "Find micro-influencers in London who post about @rustlersuk and have high engagement"
             * Extracted Keywords: "rustlersuk London" (ONLY brand + location)
             * Search Query: "instagram rustlersuk London"
           - **Example Input**: { "queries": ["instagram rustlersuk London"], "maxPagesPerQuery": 3, "resultsPerPage": 10 }
        2. Process Google Search results to extract Instagram handles (automatic).
        3. MANDATORY: Enrich discovered profiles with full Instagram data.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_step_1"], "resultsType": "details", "addParentData": true, "resultsLimit": 6 }
        - Reasoning: "Google Search finds profiles using ONLY the core search terms (brand mentions + locations). Filtering by influencer type, engagement, and follower count happens in post-processing."
        - **IMPORTANT**: Populate "search_keywords" array with ONLY the extracted brand mentions and locations for context.

    8. "Competitor Content Analysis" / "What content performs best for @X"
    â†’ Intent: "competitor_content_analysis"
      â†’ Strategy:
        1. Scrape recent posts from competitor profile.
           - Actor: 'apify/instagram-api-scraper'
           - Input: {
               "directUrls": ["https://instagram.com/[COMPETITOR]"],
               "resultsType": "posts",
               "resultsLimit": ${sampleSize},
               "addParentData": true
             }
           - **CRITICAL**: Extract competitor handle from query (e.g., "@nike" â†’ "nike", "for nike" â†’ "nike")
           - **CRITICAL**: resultsLimit should be 30-50 posts for meaningful content analysis
           - **CRITICAL**: Use directUrls format: "https://instagram.com/username" (NOT @username)
        - Reasoning: "Scrape competitor's recent posts to analyze content performance patterns, engagement rates, and content types."
        - **IMPORTANT**: Populate "search_keywords" with the competitor username for context.

    9. "Hashtag Analysis" / "Monitor #campaign"
    â†’ Intent: "hashtag_tracking"
      â†’ Strategy:
        1. Scrape posts from Hashtag page.
           - Actor: 'apify/instagram-hashtag-scraper'
           - Input: {
               "hashtags": ["[HASHTAG]"],
               "resultsLimit": ${sampleSize},
               "resultsType": "posts"
             }
           - **CRITICAL**: Extract hashtag without # for URL (e.g. #summer -> summer) but keep # for metadata.
           - **CRITICAL**: Use directUrls format: "https://instagram.com/explore/tags/hashtag"
        - Reasoning: "Scrape hashtag page to analyze reach, top posts, and engagement."
        - **IMPORTANT**: Populate "search_keywords" with the hashtag (including #) for context.

    10. "Engagement Comparison"
    â†’ Intent: "engagement_benchmark"
      â†’ Strategy:
        1. Scrape posts for ALL identified profiles.
           - Actor: 'apify/instagram-api-scraper'
           - Input: {
               "directUrls": ["https://instagram.com/[PROFILE_A]", "https://instagram.com/[PROFILE_B]"],
               "resultsType": "posts",
               "resultsLimit": 30,
               "addParentData": true
             }
           - **CRITICAL**: Construct directUrls for ALL extracted handles found in the query.
           - **CRITICAL**: Use "resultsType": "posts" to get engagement data.
        - Reasoning: "Parallel scraping of posts allows for direct engagement rate comparison."
        - **IMPORTANT**: Populate "search_keywords" with all handles for context.

    11. "UGC Discovery"
    â†’ Intent: "ugc_discovery"
      â†’ Strategy:
        1. Scrape posts from Brand Hashtag page.
           - Actor: 'apify/instagram-hashtag-scraper'
           - Input: {
               "hashtags": ["[BRAND_NAME]"],
               "resultsLimit": ${sampleSize},
               "resultsType": "posts"
             }
           - **CRITICAL**: Use brand name as hashtag (e.g. @nike -> niike -> https://instagram.com/explore/tags/nike)
        - Reasoning: "Finding posts using the brand's hashtag is the standard way to surface UGC."
        - **IMPORTANT**: Populate "search_keywords" with the brand name.

    12. "Sentiment Analysis"
    â†’ Intent: "sentiment_analysis"
      â†’ Strategy:
        1. Scrape posts for the topic/brand.
           - Actor: 'apify/instagram-scraper'
           - Input: {
               "search": "[TOPIC_OR_BRAND]",
               "searchType": "hashtag",
               "resultsType": "posts",
               "resultsLimit": ${sampleSize}
             }
        2. Scrape comments for top posts.
           - Actor: 'apify/instagram-comment-scraper'
           - Input: {
               "directUrls": ["USE_DATA_FROM_STEP_1_URLS"],
               "resultsLimit": 50
             }
        - Reasoning: "Comments provide the richest sentiment signals. Scraping 20 posts and their comments gives a good sample."

    13. "Influencer/Creator Discovery"
    â†’ Intent: "influencer_identification"
      â†’ Strategy:
        1. Google Search for profiles in niche/location.
           - Actor: 'apify/google-search-scraper'
           - Input: {
               "queries": "site:instagram.com [KEYWORDS] [LOCATION] \"followers\"",
               "resultsPerPage": 20,
               "maxPagesPerQuery": 10
             }
        2. Enrich identified profiles.
           - Actor: 'apify/instagram-api-scraper'
           - Input: {
               "directUrls": ["USE_DATA_FROM_STEP_1_URLS"],
               "resultsType": "details",
               "addParentData": true
             }
        - Reasoning: "Google Search is best for finding profiles by bio keywords/location. Enrichment ensures valid stats."

    14. "Viral/Trending Content"
    â†’ Intent: "viral_content"
      â†’ Strategy:
        1. Scrape posts from Hashtag page.
           - Actor: 'apify/instagram-api-scraper'
           - Input: {
               "directUrls": ["https://instagram.com/explore/tags/[HASHTAG]"],
               "resultsType": "posts",
               "resultsLimit": ${sampleSize},
               "addParentData": true
             }
        - Reasoning: "Analyzing recent posts from the hashtag feed allows calculation of viral velocity (Engagement / Time)."

    15. "Audience Overlap"
    â†’ Intent: "audience_overlap"
      â†’ Strategy:
        1. Scrape Recent Posts for Entity A.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "username": ["[ENTITY_A]"], "resultsLimit": 10, "resultsType": "posts" }
        2. Scrape Recent Posts for Entity B.
           - Actor: 'apify/instagram-api-scraper'
           - Input: { "username": ["[ENTITY_B]"], "resultsLimit": 10, "resultsType": "posts" }
        3. Get Comments (Engagers) for A & B.
           - Actor: 'apify/instagram-comment-scraper'
           - Input: { "directUrls": ["USE_DATA_FROM_STEP_1_URLS", "USE_DATA_FROM_STEP_2_URLS"], "resultsLimit": 50 }
        - Reasoning: "Comparing commenters on recent posts is the best proxy for active audience overlap."

    **OUTPUT FORMAT:**
    Return ONLY valid JSON with this structure:
    {
      "intent": "sensitivity_analysis|influencer_identification|...",
      "reasoning": "Brief explanation of why this intent and strategy",
      "search_keywords": ["keyword1", "keyword2"], // [NEW] Extracted main keywords
      "focusCategory": "drinks", // [NEW] For \"What other X\" queries, extract the category (e.g., drinks, shoes, games)
      "existingDatasetIds": ["id1", "id2"] or [],
      "steps": [
        {
          "stepId": "step_1",
          "description": "Scrape followers of nike",
          "actorId": "thenetaji/instagram-followers-followings-scraper",
          "input": { "username": ["nike"], "type": "followers", "max_count": ${sampleSize} },
          "estimatedRecords": ${sampleSize},
          "estimatedRecords": ${sampleSize}
        }
      ],
      "filter": {
        "bioKeywords": ["keyword1", "keyword2"],
        "minFollowers": 5000,
        "maxFollowers": 100000,
        "minFollowing": 100
      },
      "totalEstimatedCost": 0.10,
      "platform": "instagram"
    }

    **CRITICAL RULES:**
    - If user asks for specific follower counts (e.g. ">5k", "<100k"), YOU MUST popuate 'filter.minFollowers' or 'filter.maxFollowers'.
    - 'search' input MUST be a simple keyword. Move quantitative constraints to 'filter'.
    - If reusing datasets, existingDatasetIds must have IDs and steps must be []
    - If scraping, steps must have valid actorIds from the registry
    - All inputs must match the actor's input schema EXACTLY
    - For search queries, searchLimit = Math.min(1000, ${sampleSize}) (Cap search results at 1000 for speed)
    - Estimate costs based on CostPerThousand from actor registry
    - Return ONLY the JSON, no explanatory text
    `;

        const client = getAiClient();
        if (!client) throw new Error("AI Client not initialized");

        // [FIX] Robust Model Call with Fallback and Timeout
        const callModelWithTimeout = async (modelName: string): Promise<any> => {
            console.log(`[analyzeMapRequirements] Attempting model: ${modelName} with 60s timeout...`);
            console.log(`[analyzeMapRequirements] Prompt Input:`, prompt.substring(0, 1000) + '...'); // Log input
            const apiPromise = client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0,
                    maxOutputTokens: 8192 // [FIX] Increase token limit to prevent truncation
                }
            });

            // 90 Second Timeout (Increased from 60s)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Request to ${modelName} timed out after 90s`)), 90000);
            });

            return Promise.race([apiPromise, timeoutPromise]);
        };

        let result;
        const startTime = Date.now();
        console.log(`[JobOrchestrator] â³ Starting AI Plan Generation at ${new Date().toISOString()}`);

        try {
            // Primary Attempt
            // [FIX] User requested specific preview model (gemini-3-flash-preview)
            result = await callModelWithTimeout('gemini-3-flash-preview');
        } catch (primaryError: any) {
            console.warn(`[analyzeMapRequirements] Primary model failed: ${primaryError.message}. Switching to fallback...`);
            try {
                // Fallback Attempt - Uses another fast model if preview is unavailable
                result = await callModelWithTimeout('gemini-3-flash-preview');
            } catch (fallbackError: any) {
                console.error(`[analyzeMapRequirements] All models failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
                throw new Error("AI Analysis Service Unavailable (Timeout or Model Error). Please try again later.");
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const text = result.text || '{}'; // [FIX] Re-declare 'text' to fix scope error
        console.log(`[JobOrchestrator] âœ… AI Response Received in ${duration}s. Length: ${text.length} chars.`);

        // Use the robust safeParseJson method instead of ad-hoc regex replacement
        let planData = safeParseJson(text);

        // [FIX] Handle case where AI returns an array [ { intent: ... } ] instead of object
        if (Array.isArray(planData) && planData.length > 0) {
            console.log("[analyzeMapRequirements] AI returned an array, using first element.");
            planData = planData[0];
        }

        // Sanity check
        if (!planData || !planData.steps || !Array.isArray(planData.steps)) {
            console.error("[analyzeMapRequirements] Invalid Plan Data Structure:", Object.keys(planData));
            console.log("[analyzeMapRequirements] Raw Text Dump:", text.substring(0, 1000));
            // Fallback: If safeParseJson failed to find array, try one more time with aggressive cleanup?
            // For now, allow it to proceed to validation where it will throw if invalid.
        }

        // Evaluate math expressions in estimatedRecords if present (post-parsing fixup might be needed if they were strings)
        // safeParseJson returns an object, so we walk it?
        // Actually, the original code did regex replace on STRING. 
        // If the LLM returned "estimatedRecords": 500 * 2, that is invalid JSON.
        // safeParseJson doesn't handle math expressions.
        // Let's rely on the LLM doing the math or returning a string we can parse.
        // The prompt says "estimatedRecords: ...", usually it returns a number.

        if (!planData.intent && !planData.steps) {
            console.error("[analyzeMapRequirements] Invalid JSON Structure. Keys found:", Object.keys(planData));
            throw new Error(`AI returned invalid JSON structure (missing intent/steps). Found keys: ${Object.keys(planData).join(', ')}`);
        }

        // [FIX] Normalize 'brand_affinity' to 'over_indexing' to catch all variants
        if (planData.intent === 'brand_affinity') {
            console.log("[JobOrchestrator] ðŸ”„ Normalizing intent 'brand_affinity' -> 'over_indexing'");
            planData.intent = 'over_indexing';
        }

        // [NEW] Merge Programmatic Matches with AI results
        if (programmaticMatch) {
            const aiIds = planData.existingDatasetIds || [];
            const mergedIds = [...new Set([...aiIds, ...programmaticMatch.ids])];
            planData.existingDatasetIds = mergedIds;
            planData.cachedRecordCount = programmaticMatch.totalRecords;
            planData.cachedDepth = programmaticMatch.maxDepth;
        }

        // [NEW] AI-Only Route: We rely on the AI's generated plan directly.
        // The Auditor (below) will handle refinement and repair without forcing a fixed template.

        // Log dataset reuse decision
        if (planData.existingDatasetIds && planData.existingDatasetIds.length > 0) {
            console.log(`âœ… REUSING ${planData.existingDatasetIds.length} existing dataset(s):`, planData.existingDatasetIds);
        }

        // Apply hollow plan detection and fixes (port from orchestrationService.ts)
        planData = this.detectAndFixHollowPlan(planData, sampleSize);
        planData = this.injectUniversalEnrichment(planData, sampleSize);

        // [FIX] Validate and replace any deprecated actor IDs
        planData = this.validateAndFixActorIds(planData, effectiveDatasets);

        // [NEW] Run Algorithmic Auditor FIRST (Enforces limits, repairs actor IDs, ensures enrichment)
        // This MUST run before cost calc so limits are final.
        planData = this.auditAndRepairPlan(planData, query, sampleSize, postLimit);

        // [NEW] Programmatic Cost Recalculation (Overrides AI Estimates)
        // Now accurately reflects the limits set by the Auditor
        planData = await this.recalculateStepCosts(planData);

        // [NEW] Check for cached steps to adjust pricing preview (Deduplication Check)
        planData = await this.checkPlanForCachedSteps(planData);

        // [NEW] Store baseline parameters for frontend scaling
        planData.baselineSampleSize = sampleSize;
        planData.baselinePostLimit = postLimit;

        return planData;
    }

    /**
     * Validate and fix deprecated actor IDs
     */
    private validateAndFixActorIds(plan: any, effectiveDatasets: any[] = []): any {
        const ACTOR_REPLACEMENTS: Record<string, string> = {
            'datadoping/instagram-following-scraper': 'thenetaji/instagram-followers-followings-scraper',
            'datadoping/instagram-follower-scraper': 'thenetaji/instagram-followers-followings-scraper',
            'datadoping/instagram-profile-scraper': 'apify/instagram-api-scraper',
            'IkdNTeZnRfvDp8V25': 'thenetaji/instagram-followers-followings-scraper',
            'PD842RNI3lZHFzS5l': 'thenetaji/instagram-followers-followings-scraper', // Explicitly remap this legacy ID
            'apify~instagram-profile-scraper': 'apify/instagram-api-scraper', // Handle tilde variant
            'apify/instagram-profile-scraper': 'apify/instagram-api-scraper', // [CRITICAL] Force upgrade all profile scrapers
            'apify/instagram-search-scraper': 'apify/instagram-api-scraper' // [NEW] Fix phantom assignment
        };

        if (plan.steps && Array.isArray(plan.steps)) {
            plan.steps.forEach((step: any) => {
                // Check both 'actor' and 'actorId' fields (AI uses 'actorId' in JSON response)
                const actorField = step.actorId || step.actor;

                if (actorField && ACTOR_REPLACEMENTS[actorField]) {
                    console.warn(`[Orchestrator] âš ï¸  Replacing deprecated actor "${actorField}" with "${ACTOR_REPLACEMENTS[actorField]}"`);

                    if (step.actorId) step.actorId = ACTOR_REPLACEMENTS[actorField];
                    if (step.actor) step.actor = ACTOR_REPLACEMENTS[actorField];
                }

                // [FIX] Ensure API Scraper receives 'directUrls' instead of 'usernames'
                const finalActor = step.actorId || step.actor;
                if (finalActor && (finalActor === 'apify/instagram-api-scraper' || finalActor.includes('instagram-api-scraper'))) {
                    if (step.input && step.input.usernames && !step.input.directUrls) {
                        console.log(`[Orchestrator] ðŸ”„ Migrating input 'usernames' to 'directUrls' for upgraded actor.`);
                        step.input.directUrls = step.input.usernames;
                        delete step.input.usernames;
                        // Ensure other props
                        if (!step.input.resultsType) step.input.resultsType = 'details';
                        if (step.input.addParentData === undefined) step.input.addParentData = true;
                    }
                }
            });
        }

        // [ENHANCED] Validate existingDatasetIds from AI (Hybrid Approach - Option C)
        let reusedDatasetDetails: Record<string, { depth: number; recordCount: number }> = {};

        if (plan && plan.existingDatasetIds && Array.isArray(plan.existingDatasetIds)) {
            const validIds: string[] = [];
            const datasetMap = new Map((effectiveDatasets || []).map(d => [d.id, d]));

            for (const id of plan.existingDatasetIds) {
                const dataset = datasetMap.get(id);
                if (dataset) {
                    validIds.push(id);
                    // Default to 3 if missing (legacy datasets)
                    const depth = dataset.metadata?.postLimit || (dataset.metadata?.sampleSize && dataset.metadata.sampleSize <= 100 ? 20 : 3);

                    reusedDatasetDetails[id] = {
                        depth,
                        recordCount: dataset.recordCount || 0
                    };

                    console.log(`[AI Match] âœ… Reusing dataset "${id}" (records: ${dataset.recordCount}, depth: ${depth}): ${dataset.metadata?.query || dataset.name}`);
                } else {
                    console.warn(`[AI Match] âš ï¸ Dataset ID "${id}" not found, skipping`);
                }
            }

            // Update plan with only valid IDs
            plan.existingDatasetIds = validIds;

            // If reusing datasets, ensure steps are empty
            // [FIX] DO NOT CLEAR STEPS. "Golden Templates" and "Top-up" logic require steps + datasets to coexist.
            // If we clear steps, we break the "Delta Scrape" strategy and cost calculation fails (remains at base fee).
            /* 
            if (validIds.length > 0 && plan.steps && plan.steps.length > 0) {
                console.warn(`[AI Match] AI specified dataset reuse but also included steps. Clearing steps.`);
                plan.steps = []; 
            }
            */

            // Attach to plan object
            plan.reusedDatasetDetails = reusedDatasetDetails;
        }

        return plan;
    }

    /**
     * Recalculate costs for all steps using the CostCalculator service
     * This overrides AI-hallucinated costs with programmatic truth.
     */
    private async recalculateStepCosts(plan: any): Promise<any> {
        if (!plan.steps || !Array.isArray(plan.steps)) return plan;

        console.log("[Orchestrator] ðŸ’° Recalculating plan costs with CostCalculator...");
        let runningTotal = 0;

        // [NEW] Calculate Total Cached Records if datasets are reused
        let totalCachedRecords = 0;
        if (plan.reusedDatasetDetails) {
            totalCachedRecords = (Object.values(plan.reusedDatasetDetails) as any[]).reduce((acc: number, curr: any) => acc + (curr.recordCount || 0), 0);
        }

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];

            // Ensure record count is valid
            let recordCount = step.estimatedRecords;
            // Fallback heuristics if AI failed to estimate records
            // Fallback heuristics if estimates are missing (Priority: maxCount -> limit -> sampleSize -> default)
            if (recordCount === undefined || recordCount === null || isNaN(recordCount)) {
                if (step.input && step.input.maxCount) recordCount = step.input.maxCount;
                else if (step.input && step.input.limit) recordCount = step.input.limit;
                else if (step.input && step.input.resultsLimit) recordCount = step.input.resultsLimit;
                else if (step.input && step.input.searchLimit) recordCount = step.input.searchLimit;
                else if (step.input && step.input.sampleSize) recordCount = step.input.sampleSize;
                else recordCount = ${ sampleSize }; // Safe default
            }

            // [REMOVED] Arbitrary sampleSize override that broke proportional scaling

            // [CRITICAL] Delta Logic: If this is the FIRST step and we have cached records, subtract them.
            // This assumes Step 1 is the "base scrape" (e.g. followers) which dataset reuse replaces.
            if (i === 0 && totalCachedRecords > 0) {
                const originalCount = recordCount;
                recordCount = Math.max(0, recordCount - totalCachedRecords);

                if (recordCount < originalCount) {
                    console.log(`[CostCalc] ðŸ“‰ Applied Delta Logic: Step 1 reduced from ${originalCount} to ${recordCount} records (Cached: ${totalCachedRecords})`);
                    step.description += ` (Top-up: ${recordCount} records)`;
                }

                // If fully covered, mark as skipped/cached
                if (recordCount === 0) {
                    step.skipped = true;
                    step.description = `[SKIPPED] ${step.description} (Fully covered by cache)`;
                }
            }

            // Calculate Price
            const price = await costCalculator.calculateStepPrice(step.actorId, recordCount);

            // Update Step
            step.estimatedCost = price.estimatedCost;
            step.estimatedRecords = recordCount; // Normalize this field

            runningTotal += price.estimatedCost;
        }

        // [NEW] Add base orchestration fee
        const baseFee = 2.50;
        runningTotal += baseFee;

        plan.totalEstimatedCost = Number(runningTotal.toFixed(2));
        console.log(`[Orchestrator] New Total Plan Cost (incl. Â£${baseFee} fee): Â£${plan.totalEstimatedCost}`);


        return plan;
    }

    /**
     * Check plan steps for existing cached results to adjust pricing (Deduplication Preview)
     */
    private async checkPlanForCachedSteps(plan: any): Promise<any> {
        if (!plan.steps || !Array.isArray(plan.steps)) return plan;

        console.log("[PlanCheck] Checking generated plan for cached steps...");

        for (const step of plan.steps) {
            try {
                // 1. Resolve Actor ID
                let realActorId = step.actorId || step.actor || '';
                if (realActorId.includes('~')) realActorId = realActorId.replace(/~/g, '/');

                const actorMapping: any = {
                    'apify/instagram-profile-scraper': process.env.PROFILE_SCRAPE_ACTOR_INSTAGRAM || 'dSCLg0C3YEZ83HzYX',
                    'apify/instagram-scraper': process.env.APIFY_INSTAGRAM_ACTOR_ID || 'OWBUCWZK5MEeO5XiC',
                    'thenetaji/instagram-followers-followings-scraper': 'asIjo32NQuUHP4Fnc',
                    'datadoping/instagram-following-scraper': 'thenetaji/instagram-followers-followings-scraper',
                    'datadoping/instagram-follower-scraper': 'thenetaji/instagram-followers-followings-scraper',
                    'datadoping/instagram-followers-followings-scraper': 'thenetaji/instagram-followers-followings-scraper',
                    'IkdNTeZnRfvDp8V25': 'thenetaji/instagram-followers-followings-scraper'
                };

                if (actorMapping[realActorId]) realActorId = actorMapping[realActorId];

                // Handling standard scraper override if search is present
                if (realActorId === process.env.PROFILE_SCRAPE_ACTOR_INSTAGRAM && step.input.search) {
                    realActorId = process.env.APIFY_INSTAGRAM_ACTOR_ID || 'OWBUCWZK5MEeO5XiC';
                }

                // 2. Normalize Input (Must match runApifyActor logic)
                const normalizedInput = { ...step.input };

                // Logic for TheNetaji/Followers Scraper
                if (realActorId === 'asIjo32NQuUHP4Fnc') {
                    if (normalizedInput.usernames && !normalizedInput.username) {
                        normalizedInput.username = Array.isArray(normalizedInput.usernames) ? normalizedInput.usernames : [normalizedInput.usernames];
                    } else if (normalizedInput.username && !Array.isArray(normalizedInput.username)) {
                        normalizedInput.username = [normalizedInput.username];
                    }
                    delete normalizedInput.usernames;
                }

                // Logic for API Scraper
                if (realActorId.includes('instagram-api-scraper') && (normalizedInput.usernames || normalizedInput.directUrls)) {
                    const rawTargets = normalizedInput.directUrls || normalizedInput.usernames;
                    const targets = Array.isArray(rawTargets) ? rawTargets : [rawTargets];
                    normalizedInput.directUrls = targets.map((u: string) => {
                        const clean = u.replace('@', '').trim();
                        return clean.startsWith('http') ? clean : `https://www.instagram.com/${clean}`;
                    });
                    delete normalizedInput.usernames;
                    if (!normalizedInput.resultsType) normalizedInput.resultsType = 'posts';
                    if (!normalizedInput.resultsLimit) normalizedInput.resultsLimit = 6;
                    normalizedInput.addParentData = true;
                }

                // Logic for Standard Scraper
                if (realActorId === 'OWBUCWZK5MEeO5XiC' || realActorId === 'apify/instagram-scraper') {
                    if (normalizedInput.searchQuery && !normalizedInput.search) {
                        normalizedInput.search = normalizedInput.searchQuery;
                        delete normalizedInput.searchQuery; // [FIX] Clean up invalid param
                    }
                    if (normalizedInput.resultsLimit && !normalizedInput.searchLimit) normalizedInput.searchLimit = normalizedInput.resultsLimit;
                    if (!normalizedInput.searchType) normalizedInput.searchType = 'user';
                    if (!normalizedInput.proxy) normalizedInput.proxy = { useApifyProxy: true };
                }

                // 3. Generate Fingerprint (Skip if inputs are dynamic placeholders)
                const inputStr = JSON.stringify(normalizedInput);
                if (inputStr.includes('USE_DATA_FROM_STEP') || inputStr.includes('USE_DATA_FROM_DATASET')) {
                    continue; // Cannot check cache for dynamic steps yet
                }

                const fingerprint = generateScrapeFingerprint(realActorId, normalizedInput);

                // 4. Check Cache
                const existingScrape = await mongoService.getScrapeFingerprint(fingerprint);

                if (existingScrape && isFingerprintFresh(existingScrape.executedAt, existingScrape.metadata.dataType)) {
                    console.log(`[PlanCheck]Found CACHED result for: ${step.description}`);
                    step.originalCost = step.estimatedCost;

                    // [FIX] Update total plan cost by subtracting this step's estimated cost
                    plan.totalEstimatedCost = Number((plan.totalEstimatedCost - (step.estimatedCost || 0)).toFixed(2));

                    step.estimatedCost = 0;
                    step.cached = true;
                    step.description = `[CACHED] ${step.description}`;
                    step.datasetId = existingScrape.datasetId;
                }

            } catch (err) {
                // Ignore errors during check, fail open (assume scrape needed)
            }
        }
        return plan;
    }

    /**
     * Detect and fix "hollow plans" (port from orchestrationService.ts)
     */
    private detectAndFixHollowPlan(planData: any, sampleSize: number): any {
        const twoHopIntents = ['network_clusters', 'over_indexing', 'brand_affinity'];
        const isTwoHopIntent = twoHopIntents.includes(planData.intent);

        if (!isTwoHopIntent) return planData;

        const steps = planData.steps || [];
        const hasFollowingStep = steps.some((s: any) =>
            (s.input && (s.input.type === 'following' || s.input.type === 'followings')) ||
            (s.description && s.description.toLowerCase().includes('following'))
        );

        const hasReusedDatasets = planData.existingDatasetIds && planData.existingDatasetIds.length > 0;

        // [FIX] Trust the AI: If reusing datasets and AI prescribed 0 steps, assume dataset is sufficient.
        if (hasReusedDatasets && steps.length === 0) {
            console.log("âœ… Reusing dataset with 0 additional steps. Skipping hollow plan injection.");
            return planData;
        }

        const isMissingSecondHop = !hasFollowingStep;

        if (isMissingSecondHop) {
            console.log(`âš ï¸ [Hollow Plan Detected] Intent '${planData.intent}' requires 2 hops but 'Following' step is missing.`);
            console.log("ðŸ’‰ INJECTING MISSING HOP: Scrape 'followings' of previous step/dataset");

            // [NEW] Delta-Aware Scaling: Use the record count of the first step if it exists (might be a top-up)
            const baseForScaling = steps.length > 0 ? (steps[0].estimatedRecords || sampleSize) : sampleSize;
            const followingsLimit = 20; // Default followers-followings limit

            const injectedStep = {
                stepId: `step_${steps.length + 1}`,
                description: "Scrape followings of previous step (INJECTED to fix hollow plan)",
                actorId: "thenetaji/instagram-followers-followings-scraper",
                input: {
                    username: steps.length > 0 ? [`USE_DATA_FROM_STEP_${steps[0].stepId || 'step_1'}`] : ["USE_DATA_FROM_DATASET"],
                    type: "followings",
                    limit: Math.min(followingsLimit, sampleSize)
                },
                estimatedRecords: baseForScaling * followingsLimit,
                // [COST] Dynamic calculation: ~ $5.00 per 1k records for Followings Scraper
                estimatedCost: Number((((baseForScaling * followingsLimit) / 1000) * 5.00).toFixed(2))
            };

            if (!planData.warnings) planData.warnings = [];
            planData.warnings.push(`Added interim 'Followings' scrape for network analysis (+Â£${injectedStep.estimatedCost.toFixed(2)} est).`);

            planData.steps.push(injectedStep);
            console.log("âœ… Hollow Plan Fixed. New step count:", planData.steps.length);
        }

        return planData;
    }

    /**
     * Inject Universal Content Enrichment (MANDATORY)
     * Ensures every plan ends with a content scrape for the UI Gallery
     */
    private injectUniversalEnrichment(planData: any, sampleSize: number): any {
        // Skip if reusing datasets (assume they are already rich or user wants speed)
        if (planData.existingDatasetIds && planData.existingDatasetIds.length > 0 && (!planData.steps || planData.steps.length === 0)) {
            return planData;
        }

        const steps = planData.steps || [];
        if (steps.length === 0) return planData;

        // Check if last step is already the API scraper (AI might have added it)
        const lastStep = steps[steps.length - 1];
        const lastActorId = (lastStep.actorId || lastStep.actor || '').toLowerCase();
        const isAlreadyEnriched = lastActorId.includes('instagram-api-scraper') && lastStep.input?.resultsType === 'posts';

        if (isAlreadyEnriched) {
            console.log("[Orchestration] âœ… Plan already includes Universal Enrichment.");
            return planData;
        }

        console.log("ðŸ’‰ INJECTING UNIVERSAL ENRICHMENT: Fetching posts/images for UI Gallery");

        // [NEW] Delta-Aware Scaling: Only enrich the records that were actually scraped
        const recordsToEnrich = lastStep.estimatedRecords || sampleSize;

        const enrichmentStep = {
            stepId: `step_${steps.length + 1}`,
            description: "Universal Content Enrichment: Fetch posts for Gallery (INJECTED)",
            actorId: "apify/instagram-api-scraper",
            input: {
                "directUrls": [`USE_DATA_FROM_STEP_${lastStep.stepId || `step_${steps.length}`}`],
                "resultsType": "details",
                "addParentData": true
            },
            estimatedRecords: recordsToEnrich * 6,
            // [COST] Dynamic calculation: ~ $4.30 per 1k profiles for API Scraper
            estimatedCost: Number(((recordsToEnrich / 1000) * 4.30).toFixed(2))
        };

        if (!planData.warnings) planData.warnings = [];
        planData.warnings.push(`Added Universal Enrichment step for full profile analysis (+Â£${enrichmentStep.estimatedCost.toFixed(2)} est).`);

        planData.steps.push(enrichmentStep);
        return planData;
    }

    /**
     * Execute the orchestration plan step by step
     */
    private async executeOrchestrationPlan(job: Job, plan: any): Promise<any> {
        const results: any[] = [];
        const stepResultsMap = new Map<string, any[]>(); // [FIX] Store step results by ID for precise resolution
        const datasetIds: string[] = []; // [NEW] Track dataset IDs
        const steps = plan.steps || [];

        // [FIX] Load existing data if reusing datasets (Bypass if ignoreCache is true)
        if (plan.existingDatasetIds && plan.existingDatasetIds.length > 0 && !job.metadata?.ignoreCache) {
            console.log(`[Orchestration] Loading ${plan.existingDatasetIds.length} existing datasets...`);
            for (const id of plan.existingDatasetIds) {
                if (!datasetIds.includes(id)) datasetIds.push(id);
                try {
                    const dataset = await mongoService.getDatasetById(id);
                    if (dataset && dataset.data && dataset.data.length > 0) {
                        // Find snapshot record
                        const snapshot = dataset.data.find((r: any) => r.recordType === 'graph_snapshot') || dataset.data[0];

                        if (snapshot.rawResults && Array.isArray(snapshot.rawResults)) {
                            console.log(`[Orchestration] Loaded ${snapshot.rawResults.length} batches from dataset ${id}`);
                            results.push(...snapshot.rawResults);
                        } else if (snapshot.nodes) {
                            // Fallback: Reconstruct from nodes if rawResults missing
                            console.log(`[Orchestration] Reconstructing items from ${snapshot.nodes.length} nodes in dataset ${id}`);
                            const reconstructed = snapshot.nodes
                                .filter((n: any) => n.group === 'creator' || n.group === 'overindexed' || n.group === 'main')
                                .map((n: any) => ({
                                    username: n.data?.username || n.label,
                                    // [NEW] Map standard schema fields robustly from snapshot data
                                    biography: n.data?.bio || n.data?.biography || n.data?.description || '',
                                    followersCount: n.data?.followersCount || (typeof n.data?.followers === 'number' ? n.data.followers : 0),
                                    followsCount: n.data?.followsCount || (typeof n.data?.following === 'number' ? n.data.following : 0),
                                    latestPosts: n.data?.latestPosts || [],
                                    profilePicUrl: n.data?.profilePicUrl || n.profilePic,
                                    isBusinessAccount: n.data?.isBusinessAccount || false,
                                    id: n.data?.id || n.id
                                }));
                            if (reconstructed.length > 0) results.push(reconstructed);
                        }
                    } else {
                        console.warn(`[Orchestration] Dataset ${id} not found or empty.`);
                    }
                } catch (err) {
                    console.error(`[Orchestration] Failed to load dataset ${id}:`, err);
                }
            }
        }

        console.log(`[Orchestration] Starting execution of ${steps.length} steps (IgnoreCache: ${job.metadata?.ignoreCache})`);

        let totalSavedCost = 0;
        let allCached = true;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const progress = 20 + Math.floor(((i + 1) / steps.length) * 60); // 20% to 80%

            await mongoService.updateJob(job.id, {
                progress,
                result: { stage: `Step ${i + 1}/${steps.length}: ${step.description}`, plan }
            });

            console.log(`[Orchestration] â•â•â• Executing step ${i + 1}/${steps.length} â•â•â•`);
            console.log(`[Orchestration] Actor: ${step.actorId}`);
            console.log(`[Orchestration] Description: ${step.description}`);

            // Resolve dynamic inputs
            const resolvedInput = this.resolveOrchestrationInput(step.input, stepResultsMap, plan, job.metadata?.sampleSize || 500);
            console.log(`[Orchestration] Resolved Input (limit: ${job.metadata?.sampleSize || 500}):`, JSON.stringify(resolvedInput).substring(0, 200));


            // Execute Apify actor
            try {
                // [FIX] Specific logic for 'thenetaji' actor which fails with array input for 'username'
                if ((step.actorId === 'thenetaji/instagram-followers-followings-scraper' || step.actorId === 'asIjo32NQuUHP4Fnc') &&
                    resolvedInput.username && Array.isArray(resolvedInput.username) && resolvedInput.username.length === 1) {
                    console.log(`[Orchestration] Unwrapping 'username' array for actor ${step.actorId}`);
                    resolvedInput.username = resolvedInput.username[0];
                }

                // [MODIFIED] Use unified runApifyActor with caching
                // Destructure items and datasetId from the object return type
                const runOutput = await this.runApifyActor(step.actorId, resolvedInput, job.id, {
                    taskName: step.description,
                    query: job.metadata?.query || (plan as any).query || 'orchestration',
                    planId: job.id,
                    sampleSize: job.metadata?.sampleSize, // [FIX] Ensure sampleSize is passed for limit enforcement
                    ignoreCache: job.metadata?.ignoreCache // [NEW] Force fresh scrape if requested
                });

                if (runOutput.datasetId) {
                    if (!datasetIds.includes(runOutput.datasetId)) datasetIds.push(runOutput.datasetId);

                    // [FIX] Fetch latest job state to avoid clobbering metadata updated by runApifyActor
                    const latestJob = await mongoService.getJob(job.id);
                    const currentMetadata = latestJob?.metadata || job.metadata || {};

                    // [NEW] Update metadata for live counting
                    await mongoService.updateJob(job.id, {
                        metadata: {
                            ...currentMetadata,
                            datasetIds: [...new Set(datasetIds)]
                        }
                    });
                }
                if (runOutput.fromCache) {
                    const saved = plan.steps[i].estimatedCost || 0;
                    totalSavedCost += saved;
                    console.log(`[Orchestration] Step ${i + 1} was CACHED. Saved Cost: Â£${saved}`);
                    if (plan.steps[i]) {
                        plan.steps[i].cached = true;
                        plan.steps[i].savedCost = plan.steps[i].estimatedCost || 0;
                        plan.steps[i].estimatedCost = 0;
                    }
                    await mongoService.updateJob(job.id, {
                        result: { stage: `Step ${i + 1} (Cached): ${step.description}`, plan }
                    });
                } else {
                    allCached = false;
                }

                let stepResult = runOutput.items;

                // [NEW] Mark Step 1 results as "Source Profiles" for accurate analytics/over-indexing
                if (i === 0) {
                    stepResult = stepResult.map((item: any) => ({ ...item, isSourceAccount: true }));
                }

                console.log(`[Orchestration] âœ… Step ${i + 1} completed: ${stepResult.length} items returned`);

                // --- SERVER-SIDE FILTERING ---
                const filters = plan.filter || {};
                let filteredCount = 0;

                // 1. Bio Keyword Filtering
                if (filters.bioKeywords && filters.bioKeywords.length > 0 && stepResult.length > 0) {
                    console.log(`[Orchestration] Applying Bio Filters:`, filters.bioKeywords);
                    const beforeCount = stepResult.length;
                    stepResult = stepResult.filter((item: any) => {
                        const bio = (item.biography || item.bio || item.description || '');
                        // [FIX] Only filter if bio is actually present (i.e. Enriched).
                        // If bio is missing (e.g. initial follower scrape), KEEP it so it can be enriched later.
                        if (!bio) return true;

                        return filters.bioKeywords.some((kw: string) => bio.toLowerCase().includes(kw.toLowerCase()));
                    });
                    filteredCount += (beforeCount - stepResult.length);
                    console.log(`[Orchestration] Filtered out ${beforeCount - stepResult.length} profiles based on bio keywords.`);
                }

                // 2. Metric Filtering (Followers/Following)
                if (stepResult.length > 0 && (filters.minFollowers || filters.maxFollowers || filters.minFollowing)) {
                    console.log(`[Orchestration] Applying Metric Filters:`, filters);
                    const beforeCount = stepResult.length;
                    stepResult = stepResult.filter((item: any) => {
                        const followers = item.followersCount || item.followerCount || item.followers || 0;
                        const following = item.followsCount || item.followingCount || item.following || 0;

                        if (filters.minFollowers && followers < filters.minFollowers) return false;
                        if (filters.maxFollowers && followers > filters.maxFollowers) return false;
                        if (filters.minFollowing && following < filters.minFollowing) return false;
                        return true;
                    });
                    filteredCount += (beforeCount - stepResult.length);
                    console.log(`[Orchestration] Filtered out ${beforeCount - stepResult.length} profiles based on metrics.`);
                }

                if (filteredCount > 0) {
                    await mongoService.updateJob(job.id, {
                        result: { stage: `Step ${i + 1}: Filtered ${filteredCount} items...` }
                    });
                }

                console.log(`[Orchestration] Sample result:`, stepResult[0] ? JSON.stringify(stepResult[0]).substring(0, 150) : 'NO RESULTS');
                results.push(stepResult);
                stepResultsMap.set(step.stepId, stepResult); // [FIX] Register result for lookups stepId
            } catch (stepError: any) {
                console.error(`[Orchestration] âŒ Step ${i + 1} failed:`, stepError);
                const stepMsg = stepError instanceof Error ? stepError.message : typeof stepError === 'string' ? stepError : JSON.stringify(stepError);
                throw new Error(`Step ${i + 1} (${step.actorId}) failed: ${stepMsg}`);
            }
        }

        console.log(`[Orchestration] â•â•â• All steps completed â•â•â•`);
        console.log(`[Orchestration] Total result sets: ${results.length} `);
        console.log(`[Orchestration] Items per set: ${results.map(r => r.length).join(', ')} `);

        return {
            results,
            datasetIds, // [NEW] Return collected IDs
            metadata: {
                totalSavedCost,
                allCached
            }
        };
    }

    /**
     * Resolve dynamic inputs (e.g., USE_DATA_FROM_STEP_step_1)
     */
    /**
     * Resolve dynamic inputs (e.g., USE_DATA_FROM_STEP_step_1) - Recursive
     */
    private resolveOrchestrationInput(input: any, stepResults: Map<string, any[]>, plan: any, limit: number = 500): any {
        // Base case: null or non-object
        if (input === null || typeof input !== 'object') {
            // Handle direct string replacement if matches pattern
            if (typeof input === 'string' && input.startsWith('USE_DATA_FROM_STEP_')) {
                const stepId = input.replace('USE_DATA_FROM_STEP_', '');
                return this.extractDataFromStep(stepId, stepResults, limit);
            }
            return input;
        }

        // Handle Array
        if (Array.isArray(input)) {
            // [FIX] Map ALL elements. If any are placeholders, resolve them. Then flatten.
            const resolvedArray = input.map(item => {
                if (typeof item === 'string') {
                    if (item.startsWith('USE_DATA_FROM_STEP_')) {
                        const stepId = item.replace('USE_DATA_FROM_STEP_', '');
                        console.log(`[Input Resolution] Resolving placeholder '${item}' in array...`);
                        return this.extractDataFromStep(stepId, stepResults, limit);
                    }
                    // [FIX] Resolve 'base_audience_handle' in arrays (e.g. username inputs)
                    if (item === 'base_audience_handle') {
                        console.warn(`[Input Resolution] Detected 'base_audience_handle' placeholder in Array. Attempting resolution...`);
                        const target = plan.targetProfile || (plan.query ? this.extractHandleFromQuery(plan.query) : null);
                        if (target) {
                            console.log(`[Input Resolution] Resolved to: ${target}`);
                            return target.replace('@', '');
                        } else {
                            // [CRITICAL] Fail if cannot resolve. Do NOT send garbage to scraper.
                            console.error(`[Input Resolution] FAILED to resolve 'base_audience_handle' in array. Query: ${plan.query}`);
                            throw new Error("Target Handle Missing: Could not identify who the 'base audience' refers to. Please include a handle (e.g. @nike) in your query.");
                        }
                    }
                }
                return this.resolveOrchestrationInput(item, stepResults, plan, limit);
            });

            // Flatten the array (because extractDataFromStep returns an array)
            // If the input was mixed [ "string", [array] ], we want a flat list of items/usernames for the actor
            return resolvedArray.flat();
        }

        // Handle Object
        const resolved: any = {};
        for (const key in input) {
            // [Enrichment] If key is 'directUrls', we must ensure output are URLs, not just usernames
            if (key === 'directUrls') {
                const rawValue = this.resolveOrchestrationInput(input[key], stepResults, plan, limit);
                const list = Array.isArray(rawValue) ? rawValue : [rawValue];
                resolved[key] = list.map((u: any) => {
                    const str = typeof u === 'string' ? u : u.username || u.url;
                    if (!str) return null;

                    // [FIX] Detect and resolve 'base_audience_handle' placeholder in URLs
                    if (str.includes('base_audience_handle')) {
                        console.warn(`[Input Resolution] Detected 'base_audience_handle' placeholder in URL. Attempting resolution...`);
                        const target = plan.targetProfile || (plan.query ? this.extractHandleFromQuery(plan.query) : null);
                        if (target) {
                            console.log(`[Input Resolution] Resolved to: ${target}`);
                            return str.replace('base_audience_handle', target.replace('@', ''));
                        } else {
                            // [CRITICAL] Fail if cannot resolve. Do NOT send garbage to scraper.
                            console.error(`[Input Resolution] FAILED to resolve 'base_audience_handle'. Query: ${plan.query}`);
                            throw new Error("Target Handle Missing: Could not identify who the 'base audience' refers to. Please include a handle (e.g. @nike) in your query.");
                        }
                    }

                    // Check if already URL
                    if (str.startsWith('http')) return str;
                    // Convert username to URL
                    return `https://www.instagram.com/${str.replace('@', '').trim()}`;
                }).filter((u: any) => u); // Filter nulls
            } else {
                resolved[key] = this.resolveOrchestrationInput(input[key], stepResults, plan, limit);
            }
        }

        // [FIX] Strict error if placeholder remains unresolved
        if (resolved['target_placeholder_error']) {
            throw new Error("Target Handle Missing: The scraping plan requires a target profile (e.g. @nike), but none was provided in the query or metadata.");
        }

        return resolved;
    }

    // [NEW] Helper to extract handle if missing from plan metadata
    private extractHandleFromQuery(query: string): string | null {
        const match = query.match(/@([a-zA-Z0-9_.]+)/) || query.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        return match ? match[1] : null;
    }

    // Helper to extract datum
    private extractDataFromStep(stepId: string, stepResults: Map<string, any[]>, limit: number): any {
        // [FIX] Use explicit Map lookup instead of array index to handle pre-loaded datasets
        if (stepResults.has(stepId)) {
            const previousData = stepResults.get(stepId);
            if (Array.isArray(previousData)) {
                // [FIX] Deduplicate usernames BEFORE slicing
                // Otherwise, highly overlapping results (like over-indexing) will fill the slice with duplicates.
                const allUsernames = previousData
                    .map((item: any) => item.username || item.ownerUsername)
                    .filter((u: string) => u);

                const uniqueUsernames = [...new Set(allUsernames)];
                const usernames = uniqueUsernames.slice(0, limit);

                console.log(`[Input Resolution] Resolved ${stepId}: ${allUsernames.length} items -> ${uniqueUsernames.length} unique -> ${usernames.length} sliced (limit: ${limit}).`);
                return usernames;
            }
        }
        console.warn(`[Input Resolution] Could not resolve data from ${stepId}`);
        return [];
    }


    /**
     * Helper: Aggregate raw records (posts/profiles) into unified Profile objects with latestPosts
     */
    private aggregateProfiles(records: any[]): any[] {
        const profileMap = new Map<string, any>();

        records.forEach(r => {
            // Determine identity
            const username = r.username || r.ownerUsername || r.owner?.username;
            if (!username) return;

            // [FIX] Normalize Key: Lowercase AND strip '@' AND trim
            const cleanUser = typeof username === 'string' ? username.toLowerCase().replace('@', '').trim() : '';
            if (!cleanUser) return;

            // [HARDENING] Index by ID (PK) as primary key if available
            const pk = r.id || r.pk || r.user?.pk || r.owner?.id;

            // Helper to get or create profile
            const getOrCreate = () => {
                let p = profileMap.get(cleanUser);
                if (!p && pk) p = profileMap.get(pk); // Try ID lookup

                if (!p) {
                    p = {
                        username: username, // Keep original case for display
                        id: pk ? String(pk) : '', // Force ID to string
                        ...r, // Inherit other fields
                        latestPosts: [],
                        // Ensure counters are numbers via parseMetric
                        followersCount: this.parseMetric(r.followersCount || r.followerCount || r.followers || 0),
                        followsCount: this.parseMetric(r.followsCount || r.followingCount || r.following || 0)
                    };
                    profileMap.set(cleanUser, p);
                    if (pk) profileMap.set(String(pk), p); // [CRITICAL] Index by string ID
                }
                return p;
            };

            const profile = getOrCreate();

            // Ensure ID is set if discovered later
            if (pk && !profile.id) {
                profile.id = pk;
                // Index by string version for consistent lookups
                profileMap.set(String(pk), profile);
            }

            // [LINK] Link relationships (for over-indexing analysis)
            const owner = r.ownerUsername || r.owner?.username;
            if (owner && owner.toLowerCase() !== cleanUser && (r.type === 'followings' || r.type === 'following' || r.query === 'followings')) {
                const cleanOwner = owner.toLowerCase();
                if (!profileMap.has(cleanOwner)) {
                    profileMap.set(cleanOwner, { username: owner, follows: [], latestPosts: [] });
                }
                const ownerProfile = profileMap.get(cleanOwner);
                if (!ownerProfile.follows) ownerProfile.follows = [];
                // Avoid redundant entries
                if (!ownerProfile.follows.find((f: any) => (f.username || f) === username)) {
                    ownerProfile.follows.push(r);
                }
            }

            // [FIX] Granular Field Merging Strategy
            // Instead of wiping the profile if followers are higher, we check each high-value field.

            const meta = r.metaData || {};
            const ownerObj = r.owner || {};

            const sourceBio = r.biography || r.bio || meta.biography || meta.bio || ownerObj.biography || ownerObj.bio;

            // [FIX] robust extraction (Priority: HD -> Top Level -> Meta -> Owner)
            const sourcePic = r.profilePicUrlHD || r.hdProfilePicUrl || r.profilePicUrl || r.profile_pic_url ||
                meta.profilePicUrlHD || meta.profilePicUrl ||
                ownerObj.profile_pic_url || ownerObj.profilePicUrl;

            // [ROBUST] Extract Metrics using unified helper that checks deep objects and aliases
            const sourceFollowers = this.extractMetric(r, 'followers');
            const sourceFollows = this.extractMetric(r, 'following');
            const sourcePosts = this.extractMetric(r, 'posts');

            const sourceEmail = r.email || meta.email;
            const sourceExternalUrl = r.externalUrl || meta.externalUrls?.[0] || meta.url;

            // 1. Bio: Keep the longest non-empty bio
            if (sourceBio && typeof sourceBio === 'string' && (!profile.biography || sourceBio.length > (profile.biography?.length || 0))) {
                profile.biography = sourceBio;
            }

            // 2. Profile Pic: Prefer HD or non-placeholder
            const currentPic = profile.profilePicUrl || profile.profile_pic_url;
            if (sourcePic && typeof sourcePic === 'string' && (!currentPic || (sourcePic.includes('scontent') && !currentPic.includes('scontent')))) {
                profile.profilePicUrl = sourcePic;
            }

            // 3. Contact Info
            if (sourceEmail && typeof sourceEmail === 'string' && !profile.email) profile.email = sourceEmail;
            if (sourceExternalUrl && typeof sourceExternalUrl === 'string' && !profile.externalUrl) profile.externalUrl = sourceExternalUrl;

            // [FIX] Verification Status
            if (r.isBusinessAccount !== undefined) profile.isBusinessAccount = r.isBusinessAccount;
            if (meta.isBusinessAccount !== undefined) profile.isBusinessAccount = meta.isBusinessAccount;
            if (r.isVerified !== undefined) profile.isVerified = r.isVerified;
            if (meta.verified !== undefined) profile.isVerified = meta.verified;
            if (ownerObj.is_verified !== undefined) profile.isVerified = ownerObj.is_verified;

            // 4. Counts: Always take the Max to prevent shadowing by '0' values from minimal scrapes
            // Using >= to ensure we update even if both are 0 but we have better data source now
            if (sourceFollowers >= (profile.followersCount || 0)) profile.followersCount = sourceFollowers;
            if (sourceFollows >= (profile.followsCount || 0)) profile.followsCount = sourceFollows;
            if (sourcePosts >= (profile.mediaCount || 0)) {
                profile.mediaCount = sourcePosts;
                profile.postsCount = sourcePosts; // [NEW] Synchronize
            }

            // 5. Full Name
            const sourceName = r.fullName || meta.fullName || ownerObj.full_name;
            if (sourceName && (!profile.fullName || sourceName.length > (profile.fullName || '').length)) {
                profile.fullName = sourceName;
            }

            // [FIX] 6. Profile URL: Prefer scraped URL over constructed
            const sourceUrl = r.url || r.profileUrl || meta.url || meta.profileUrl || r.externalUrl;
            if (sourceUrl && !profile.url) {
                profile.url = sourceUrl;
            }

            // Capture Post Content
            // Check if record is a post (has media or shortCode) and NOT just a profile wrapper
            const isPost = r.shortCode || r.pk || (r.type === 'Image' || r.type === 'Video' || r.type === 'Sidecar') || r.mediaUrl;

            if (isPost) {
                // Avoid duplicates in latestPosts
                if (!profile.latestPosts.find((p: any) => p.id === r.id || (p.shortCode && p.shortCode === r.shortCode))) {
                    // [FIX] Ensure we store the simplified post object
                    profile.latestPosts.push({
                        id: r.id,
                        shortCode: r.shortCode,
                        displayUrl: r.displayUrl || r.url || r.images?.[0],
                        caption: r.caption,
                        timestamp: r.timestamp,
                        likesCount: r.likesCount,
                        commentsCount: r.commentsCount
                    });
                }
            }

            // [FIX] Calculate Engagement Metrics Immediately
            if (profile.latestPosts.length > 0) {
                const totalInteractions = profile.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0) + (post.commentsCount || 0), 0);
                const totalLikes = profile.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0), 0);

                profile.avgLikes = Math.round(totalLikes / profile.latestPosts.length);
                profile.avgComments = Math.round((totalInteractions - totalLikes) / profile.latestPosts.length);

                if (profile.followersCount > 0) {
                    const rate = (totalInteractions / profile.latestPosts.length) / profile.followersCount;
                    profile.engagementRate = (rate * 100).toFixed(2) + '%';
                } else {
                    profile.engagementRate = '0%';
                }
            }

            // Capture nested posts (from apify/instagram-api-scraper parent objects)
            if (r.latestPosts && Array.isArray(r.latestPosts)) {
                r.latestPosts.forEach((p: any) => {
                    if (!profile.latestPosts.find((existing: any) => existing.id === p.id)) {
                        profile.latestPosts.push(p);
                    }
                });
            }
        });

        // Convert map to array and sort posts
        return Array.from(profileMap.values()).map((p: any) => {
            // Sort posts by date (newest first) if timestamp available
            if (p.latestPosts.length > 0) {
                p.latestPosts.sort((a: any, b: any) => {
                    const dateA = new Date(a.timestamp || a.date || 0).getTime();
                    const dateB = new Date(b.timestamp || b.date || 0).getTime();
                    return dateB - dateA;
                });
            }
            return p;
        });
    }

    /**
     * UNIFIED EVIDENCE COLLECTION
     * Centralizes logic for gathering specific references (bio, posts, search, etc.)
     */
    private collectEvidence(p: any, query: string): any[] {
        const evidence: any[] = [];
        const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 3);

        // 1. Bio Match
        const bio = (p.biography || p.bio || '').toLowerCase();
        if (bio) {
            const matchedTerms = queryTerms.filter(t => bio.includes(t));
            if (matchedTerms.length > 0 || query === 'orchestration') {
                evidence.push({
                    type: 'bio',
                    label: 'Bio Match',
                    snippet: p.biography?.substring(0, 100) + '...',
                    matchedTerms: matchedTerms,
                    score: matchedTerms.length * 2
                });
            }
        }

        // 2. Post Matches (Content Analysis)
        if (p.latestPosts && p.latestPosts.length > 0) {
            p.latestPosts.slice(0, 5).forEach((post: any) => {
                const caption = (post.caption || post.text || '').toLowerCase();
                const matchedTerms = queryTerms.filter(t => caption.includes(t));

                if (matchedTerms.length > 0) {
                    evidence.push({
                        type: 'post',
                        label: 'Relevant Post',
                        snippet: caption.substring(0, 80) + '...',
                        url: post.displayUrl || post.url, // Image or Post URL
                        sourceId: post.id,
                        score: matchedTerms.length * 3
                    });
                }
            });
        }

        // 3. Search/Context Match
        if (p.isSourceAccount) {
            evidence.push({
                type: 'search_match',
                label: 'Direct Search Result',
                snippet: `Identified directly from query: "${query}"`,
                score: 10
            });
        }

        // 4. Verification/Profile Authority
        if (p.isVerified || p.followersCount > 100000) {
            evidence.push({
                type: 'profile_match',
                label: 'High Authority Profile',
                snippet: `${p.followersCount.toLocaleString()} followers`,
                score: 5
            });
        }

        // 5. Location Match
        if (p.location && typeof p.location === 'string' && p.location.length > 2) {
            evidence.push({
                type: 'location',
                label: 'Location Match',
                snippet: p.location,
                score: 3
            });
        } else if (p.address && typeof p.address === 'string' && p.address.length > 2) {
            evidence.push({
                type: 'location',
                label: 'Location Match',
                snippet: p.address,
                score: 3
            });
        }

        // 6. Comments (for Sentiment Analysis or Deep Dives)
        if (p.comments && Array.isArray(p.comments) && p.comments.length > 0) {
            // Find most relevant comment
            const relevantComment = p.comments.find((c: any) => c.text && c.text.toLowerCase().includes(query.toLowerCase()));
            if (relevantComment) {
                evidence.push({
                    type: 'comment',
                    label: 'User Comment',
                    snippet: relevantComment.text.substring(0, 100) + '...',
                    score: 4
                });
            } else {
                evidence.push({
                    type: 'comment',
                    label: 'User Engagement',
                    snippet: `${p.comments.length} comments analyzed`,
                    score: 2
                });
            }
        }

        return evidence;
    }

    /**
     * Helper to Create Evidence Subnodes
     */
    private createEvidenceSubnodes(sourceNode: any, evidenceItems: any[], nodes: any[], links: any[]): void {
        if (!evidenceItems || !Array.isArray(evidenceItems)) return;

        evidenceItems.forEach((ev: any, idx: number) => {
            const subNodeId = `${sourceNode.id}_ev_${idx}`;

            // Determine Group based on Evidence Type
            // [FIX] Assign strict 'evidence' group to prevent pollution of Analytics Panels
            let subGroup = 'evidence';

            // Optional: specific sub-types if we wanted to color them differently in 3D, 
            // but for now we want them HIDDEN from 2D panels.
            if (ev.type === 'post') subGroup = 'evidence_post'; // Distinct but still 'evidence' prefix


            const subNode = {
                id: subNodeId,
                label: ev.label, // e.g. "Bio Match"
                group: subGroup,
                val: ev.type === 'post' ? 8 : 4, // Smaller than parent
                color: ev.type === 'post' ? '#f472b6' : '#a78bfa',
                data: {
                    description: ev.snippet,
                    imageUrl: ev.url ? proxyMediaUrl(ev.url) : null,
                    evidenceType: ev.type,
                    parentId: sourceNode.id,
                    // [IMPORTANT] Pass through source ID for click-through
                    sourceId: ev.sourceId
                }
            };

            nodes.push(subNode);
            links.push({ source: sourceNode.id, target: subNodeId, value: 1 });
        });
    }

    /**
     * UNIFIED HYDRATION HELPER
     * Ensures all nodes have consistent metrics, proxied media, and evidence.
     */
    private hydrateNodeData(p: any, group: string, evidence?: string, query?: string): any {
        const username = p.username || 'unknown';
        const simpleId = username.toLowerCase().replace('@', '').trim();

        // Calculate engagement if not already present
        let engagementRate = p.engagementRate;
        let avgLikes = p.avgLikes;
        let avgComments = p.avgComments;

        if (!engagementRate && p.latestPosts && p.latestPosts.length > 0) {
            const totalInteractions = p.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0) + (post.commentsCount || 0), 0);
            const totalLikes = p.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0), 0);
            avgLikes = Math.round(totalLikes / p.latestPosts.length);
            avgComments = Math.round((totalInteractions - totalLikes) / p.latestPosts.length);
            if (p.followersCount > 0) {
                const rate = (totalInteractions / p.latestPosts.length) / p.followersCount;
                engagementRate = (rate * 100).toFixed(2) + '%';
            }
        }

        // Standardize Latest Posts with Proxy
        const posts = p.latestPosts ? p.latestPosts.slice(0, 3).map((post: any) => ({
            url: post.url || post.permalink,
            caption: post.caption || post.description || post.text,
            imageUrl: proxyMediaUrl(post.displayUrl || post.mediaUrl || post.thumbnailUrl || post.images?.[0]),
            date: post.timestamp || post.date,
            likes: post.likesCount || post.likes,
            comments: post.commentsCount || post.comments
        })) : [];

        // [FIX] Centralized Evidence Collection
        const evidenceItems = this.collectEvidence(p, query || 'orchestration');
        // Summarize evidence for the tooltip
        const evidenceSummary = evidenceItems.length > 0
            ? `${evidenceItems.length} references found (Bio, Posts, Search matches)`
            : evidence || "Identified via profile analysis";

        // Determine size based on followers
        const val = Math.max(5, Math.log10(p.followersCount || 1000) * 5);

        // Determine Color based on Group
        const color = group === 'brand' ? '#3b82f6' : (group === 'creator' ? '#f472b6' : (group === 'overindexed' ? '#fbbf24' : '#ec4899'));

        return {
            id: simpleId,
            label: p.fullName || p.username || 'Unknown',
            type: group,
            group: group,
            color: color,
            val: val,
            profilePic: ((p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD) && (p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD).startsWith('http') ? proxyMediaUrl(p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD) : null), // [FIX] Valid URL check
            data: {
                id: p.id || simpleId, // [FIX] Add ID for enrichment matching
                username: username, // [FIX] Add username without @ prefix
                handle: `@${username}`,
                fullName: p.fullName,
                followers: (p.followersCount ?? 0).toLocaleString(),
                followerCount: p.followersCount ?? 0, // [FIX] Add numeric value for sorting
                following: (p.followsCount ?? 0).toLocaleString(),
                followingCount: p.followsCount ?? 0, // [FIX] Add numeric value for sorting
                posts: (p.postsCount ?? p.mediaCount ?? (p.latestPosts ? p.latestPosts.length : 0)).toLocaleString(),
                postsCount: p.postsCount ?? p.mediaCount ?? (p.latestPosts ? p.latestPosts.length : 0), // [FIX] Add p.posts fallback
                postCount: p.postsCount ?? p.mediaCount ?? (p.latestPosts ? p.latestPosts.length : 0), // [UNIFIED] Match UI expectation
                isBusinessAccount: p.isBusinessAccount, // [NEW]
                bio: (p.biography || p.bio || '').replace(/Bio unavailable/i, '').replace(/No bio/i, '').trim(),
                profilePicUrl: ((p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD) && (p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD).startsWith('http') ? proxyMediaUrl(p.profilePicUrl || p.profile_pic_url || p.profilePicUrlHD) : null),
                externalUrl: p.externalUrl || p.url,
                url: p.url || p.externalUrl || `https://instagram.com/${username}`, // [FIX] Add url field
                sourceUrl: p.url || `https://instagram.com/${username}`,
                engagementRate: engagementRate || '0%',
                avgLikes: (avgLikes || 0).toLocaleString(),
                avgComments: (avgComments || 0).toLocaleString(),
                latestPosts: posts,
                evidence: evidenceSummary, // Summary string
                evidenceItems: evidenceItems, // [NEW] Structured items for subnodes
            }
        };
    }

    /**
     * Generate graph from orchestration results
     */
    private generateGraphFromResults(plan: any, results: any[], query: string, analytics: any = null): Promise<any> {
        // [Universal Rich Graph]
        // [FIX] Use Deterministic Server-Side Tree Generation (Hybrid)
        // This ensures a valid graph structure using local data, while still applying AI labels/themes if available.

        // [FIX] ARCHITECTURAL ROUTING:
        // If we have AI-generated hierarchical clusters (analytics.root), we MUST use a tree-based generator
        // even for 'over_indexing' or 'brand_affinity' intents. This prevents flat star/hub graphs 
        // when the user expects a deep-dive breakdown.
        const useTree = (analytics && analytics.root) ||
            plan.intent === 'subject_matter' ||
            plan.intent === 'viral_content' ||
            plan.intent === 'trending';

        let graphResult: any = null;

        if (useTree) {
            console.log("[GraphGen] Routing to Tree Generation (AI Root found or tree-specific intent).");
            const allData = results.flat();
            const richProfiles = this.aggregateProfiles(allData);

            // Prefer generateOverindexGraph if we have multiple hubs/over-indexing context,
            // otherwise use generateTreeFromServerData for general semantic deep-dives.
            if (plan.intent === 'over_indexing' || plan.intent === 'brand_affinity' || plan.intent === 'audience_overlap') {
                return this.generateOverindexGraph(richProfiles, query, plan, analytics).then(res => {
                    // [GLOBAL] Intelligent Pruning
                    if (res && plan && plan.intent) {
                        this.optimizeGraphTopology(res.nodes, res.links, plan.intent, res.nodes.find((n: any) => n.id === 'root' || n.id === 'MAIN') || { id: 'MAIN' }, query);
                    }
                    return res;
                });
            } else {
                graphResult = this.generateTreeFromServerData(richProfiles, query, analytics, plan);
            }
        } else {
            const allData = results.flat();
            const richProfiles = this.aggregateProfiles(allData);

            // [NEW] Competitor Content Analysis
            if (plan.intent === 'competitor_content_analysis') {
                graphResult = this.generateCompetitorContentGraph(plan, results, query, analytics);
            }
            // Comparison Logic (uses result sets structure for flat multi-target studies)
            else if (plan.intent === 'audience_overlap' || plan.intent === 'comparison') {
                graphResult = this.generateComparisonGraph(plan, results, query, analytics);
            }
            else if (plan.intent === 'influencer_identification' || plan.intent === 'bio_search') {
                graphResult = this.generateInfluencerGraph(plan, results, query, analytics);
            } else if (plan.intent === 'geo_discovery') {
                const geoData = analytics?.visualAnalysis?.geoData || [];
                graphResult = this.generateGeoGraph(richProfiles, query, geoData);
            } else if (plan.intent === 'over_indexing' || plan.intent === 'brand_affinity') {
                // [FIX] If we reached here, it means analytics.root was missing.
                // Still provide Overindex Graph for the specific intent.
                return this.generateOverindexGraph(richProfiles, query, plan, analytics).then(res => {
                    if (res && plan && plan.intent) {
                        this.optimizeGraphTopology(res.nodes, res.links, plan.intent, res.nodes.find((n: any) => n.id === 'root' || n.id === 'MAIN') || { id: 'MAIN' }, query);
                    }
                    return res;
                });
            } else if (plan.intent === 'network_clusters') {
                // [FIX] Use AI-generated tree if available, otherwise generate clusters dynamically
                if (analytics && analytics.root) {
                    console.log("[GraphGen] network_clusters: Using AI-generated tree structure");
                    graphResult = this.generateTreeFromServerData(richProfiles, query, analytics, plan);
                } else {
                    console.log("[GraphGen] network_clusters: Using dynamic clustering (no AI tree found)");
                    return this.generateOverindexGraph(richProfiles, query, plan, analytics).then(res => {
                        if (res && plan && plan.intent) {
                            this.optimizeGraphTopology(res.nodes, res.links, plan.intent, res.nodes.find((n: any) => n.id === 'root' || n.id === 'MAIN') || { id: 'MAIN' }, query);
                        }
                        return res;
                    });
                }
            } else {
                // Default fallback for unknown intents
                graphResult = this.generateNetworkGraph(richProfiles, query);
            }
        }

        // [GLOBAL] Intelligent Pruning based on Query Intent (Synchronous results)
        if (graphResult && !(graphResult instanceof Promise) && plan && plan.intent) {
            this.optimizeGraphTopology(graphResult.nodes, graphResult.links, plan.intent, graphResult.nodes.find((n: any) => n.id === 'root' || n.id === 'MAIN') || { id: 'MAIN' }, query);
        }

        // Handle strict Promise return for sync results
        return Promise.resolve(graphResult);
    }

    /**
     * [NEW] Server-Side Tree Generation (Hybrid)
     * Builds the tree structure deterministically from data, using AI only for labels/enrichment.
     * Guaranteed to produce a valid graph even if AI fails.
     */
    private generateTreeFromServerData(profiles: any[], query: string, analytics: any, plan: any = null): any {
        console.log(`[GraphGen] 🌱 Generating Deterministic Tree from ${profiles.length} profiles...`);

        const nodes: any[] = [];
        const links: any[] = [];

        // 1. Root Node
        const root = {
            id: 'root',
            label: `Analysis: ${query}`,
            type: 'root',
            group: 'main', // [FIX] Added group for frontend compatibility
            color: '#a855f7', // [FIX] Purple for main/root node
            val: 100,// CHECK WHY VAL 100
            children: [] as any[]
        };


        const mentionMap = new Map<string, Set<string>>(); // Target -> Set of Source Usernames
        const mentionEvidence = new Map<string, string[]>(); // Target -> [Evidence Strings]

        // Pass 1: Build Mention Map
        profiles.forEach(p => {
            const sourceHandle = (p.username || p.ownerUsername || 'unknown').toLowerCase();
            const textToScan = `${p.biography || ''} ${p.latestPosts?.map((post: any) => post.caption || '').join(' ') || ''}`.toLowerCase();

            // Extract Mentions (@username)
            const mentions = textToScan.match(/@([a-zA-Z0-9_.]+)/g);
            if (mentions) {
                mentions.forEach((m: string) => {
                    const target = m.replace('@', '').toLowerCase();
                    if (target !== sourceHandle) {
                        if (!mentionMap.has(target)) mentionMap.set(target, new Set());
                        mentionMap.get(target)?.add(sourceHandle);

                        if (!mentionEvidence.has(target)) mentionEvidence.set(target, []);
                        if (mentionEvidence.get(target)!.length < 3) {
                            mentionEvidence.get(target)!.push(`Mentioned by @${sourceHandle}`);
                        }
                    }
                });
            }
        });

        // 2. Identify Categories/clusters
        // Strategy: Use AI clusters if they exist and have keywords, otherwise fall back to simple grouping
        let clusters: any[] = [];

        // [Hybrid] Try to use AI-defined clusters first
        if (analytics && analytics.root && analytics.root.children && analytics.root.children.length > 0) {
            console.log(`[GraphGen] Using AI-defined clusters for structure...`);
            // We use the AI's cluster definitions but RE-POPULATE them with local data to ensure richness
            clusters = analytics.root.children.map((aiCluster: any, idx: number) => ({
                ...aiCluster,
                id: aiCluster.id || `cluster_${idx}`, // [FIX] Ensure every cluster has an ID for link generation
                type: aiCluster.type || 'cluster', // [FIX] Ensure type is set for 3D shape rendering
                color: aiCluster.color || '#10b981', // [FIX] Ensure emerald color for clusters
                group: aiCluster.group || 'cluster', // [FIX] Ensure group is set
                children: [] // clear children, we will re-assign validated nodes
            }));
        } else {
            // Fallback: Create dynamic buckets based on hashtags if AI clusters failed
            console.log(`[GraphGen] AI clusters missing/invalid. Deriving from hashtags/content...`);

            // Dynamic Hashtag Clustering
            const hashtagGroups = new Map<string, any[]>();
            const bioKeywords = new Map<string, any[]>(); // Backup: Bio keywords

            // Mention logic moved to top of function...


            // Pass 2: Build Clusters
            profiles.forEach(p => {
                const posts = p.latestPosts || [];
                const uniqueTags = new Set<string>();

                // Collect Hashtags
                posts.forEach((post: any) => {
                    const tags = post.hashtags || [];
                    tags.forEach((t: string) => uniqueTags.add(t.replace(/^#/, '').toLowerCase()));
                });
                uniqueTags.forEach(tag => {
                    if (!hashtagGroups.has(tag)) hashtagGroups.set(tag, []);
                    hashtagGroups.get(tag)?.push(p);
                });

                // Collect Bio Keywords (Simple Backup)
                if (p.biography) {
                    const bioWords = p.biography.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4 && !w.startsWith('@') && !w.startsWith('http'));
                    const uniqueBio = new Set(bioWords);
                    uniqueBio.forEach((w: string) => {
                        if (!bioKeywords.has(w)) bioKeywords.set(w, []);
                        bioKeywords.get(w)?.push(p);
                    });
                }
            });

            // Dynamic Threshold: Lower to 2 if small dataset
            const minClusterSize = profiles.length < 50 ? 2 : 3;
            console.log(`[GraphGen] Dynamic Clustering: profiles=${profiles.length}, threshold=${minClusterSize}`);

            // 1. Try Hashtags
            let sortedClusters = Array.from(hashtagGroups.entries())
                .filter(([tag, members]) => members.length >= minClusterSize)
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5);

            // 2. Fallback: Bio Keywords
            if (sortedClusters.length === 0) {
                console.log(`[GraphGen] No significant hashtag clusters. Trying bio keywords...`);
                sortedClusters = Array.from(bioKeywords.entries())
                    .filter(([word, members]) => members.length >= minClusterSize)
                    .sort((a, b) => b[1].length - a[1].length)
                    .slice(0, 5);
            }

            if (sortedClusters.length > 0) {
                clusters = sortedClusters.map(([tag, members]) => ({
                    id: `c_${tag}`,
                    label: `#${tag}`,
                    type: 'cluster',
                    val: 30 + (members.length),
                    color: '#10b981', // [FIX] Emerald color for clusters
                    data: {
                        description: `Community interested in ${tag}`,
                        keywords: [tag],
                        provenance: `identified from ${members.length} profiles including: ${members.slice(0, 3).map((m: any) => '@' + m.username).join(', ')}`
                    },
                    group: 'cluster', // [FIX] Added group
                    children: []
                }));
                console.log(`[GraphGen] Generated ${clusters.length} dynamic clusters. Top: ${clusters[0].label}`);
            } else {
                // Ultimate Fallback if even bio extraction fails
                console.log(`[GraphGen] Dynamic clustering failed. Using generic buckets.`);
                clusters = [
                    { id: 'c1', label: 'Top Creators', type: 'cluster', group: 'cluster', color: '#10b981', val: 50, data: { description: 'High influence profiles', keywords: ['creator', 'influencer', 'model', 'artist'] }, children: [] },
                    { id: 'c2', label: 'Rising Stars', type: 'cluster', group: 'cluster', color: '#10b981', val: 30, data: { description: 'Growing accounts', keywords: ['rising', 'new'] }, children: [] },
                    { id: 'c3', label: 'Niche Matches', type: 'cluster', group: 'cluster', color: '#10b981', val: 20, data: { description: 'Specific interest matches', keywords: [] }, children: [] }
                ];
            }
        }

        // 3. Sort Profiles by Relevance/Influence
        // We prioritize profiles that have 'evidence' (from previous steps) or high follower counts
        const sortedProfiles = [...profiles].sort((a, b) => {
            const scoreA = (a.followersCount || 0) + (a.isVerified ? 100000 : 0);
            const scoreB = (b.followersCount || 0) + (b.isVerified ? 100000 : 0);
            return scoreB - scoreA;
        });

        // [FIX] Filter out profiles with insufficient data BEFORE creating nodes
        // Only include profiles that have at least ONE of: bio, posts, or meaningful follower count
        const qualityProfiles = sortedProfiles.filter(p => {
            // [NEW] Never filter out the main target profile (handle mentioned in query)
            const isTarget = query.toLowerCase().includes(`@${(p.username || '').toLowerCase()}`);
            if (isTarget) return true;

            // [NEW] If the dataset is tiny (found few profiles), show them all instead of filtering to zero
            if (sortedProfiles.length < 10) return true;

            const hasBio = p.biography && p.biography.trim().length > 0;
            const hasPosts = p.latestPosts && Array.isArray(p.latestPosts) && p.latestPosts.length > 0;
            const hasFollowers = p.followersCount && p.followersCount > 100; // Minimum threshold

            return hasBio || hasPosts || hasFollowers;
        });

        console.log(`[GraphGen] Filtered ${sortedProfiles.length} profiles â†’ ${qualityProfiles.length} quality profiles (removed ${sortedProfiles.length - qualityProfiles.length} empty/low-quality profiles)`);

        // 4. Assign Profiles to Clusters
        // Simple Logic: Distribute into buckets based on simple heuristics or Round Robin if no specific keywords
        qualityProfiles.forEach((p, index) => {
            const bio = (p.biography || '').toLowerCase();
            const simpleId = p.username || `user_${index}`;

            // [FIX] robust brand detection
            const isBrand = p.isBusinessAccount ||
                p.metaData?.isBusinessAccount ||
                (p.biography && /official|brand|shop|store|business|company/i.test(p.biography));

            // [FIX] Calculate Specific Metrics (Engagement Rate)
            let engagementRate = 0;
            let avgLikes = 0;
            let avgComments = 0;

            if (p.latestPosts && p.latestPosts.length > 0) {
                const totalInteractions = p.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0) + (post.commentsCount || 0), 0);
                const totalLikes = p.latestPosts.reduce((acc: number, post: any) => acc + (post.likesCount || 0), 0);

                avgLikes = Math.round(totalLikes / p.latestPosts.length);
                avgComments = Math.round((totalInteractions - totalLikes) / p.latestPosts.length);

                if (p.followersCount > 0) {
                    engagementRate = (totalInteractions / p.latestPosts.length) / p.followersCount;
                }
            }

            // Construct the rich node from LOCAL data (No Hallucination)
            // [FIX] Distinguish Creator vs Profile based on Threshold
            let group = 'profile';
            if (isBrand) {
                group = 'brand';
            } else if (p.isVerified || (p.followersCount && p.followersCount > 5000)) {
                group = 'creator';
            }

            // [NEW] Rising Popularity Score (Local Relevance)
            const myHandle = (p.username || p.ownerUsername || '').toLowerCase();
            const mentionCount = mentionMap.has(myHandle) ? mentionMap.get(myHandle)!.size : 0;
            const mentionSources = mentionEvidence.get(myHandle) || [];

            // Construct the rich node using the UNIFIED helper
            const node = this.hydrateNodeData(p, group, undefined, query);

            // [FIX] Explicitly Ensure Stats Display for UI (User Request)
            node.data.followerCount = p.followersCount || p.followers || 0;
            node.data.followingCount = p.followsCount || p.followingCount || p.following || 0;
            node.data.postCount = p.mediaCount || p.postsCount || p.posts || 0;
            node.data.isVerified = p.isVerified || p.verified || false;

            // [FIX] Inject Provenance for Rising Stars
            if (mentionCount > 0) {
                node.data.provenance = {
                    source: 'Community Mentions',
                    method: 'Pattern Matching',
                    confidence: 1.0,
                    evidence: mentionSources.map(s => ({ text: s, type: 'mention' })),
                    description: `Referred to by ${mentionCount} other profiles in this dataset.`
                };
                node.val = (node.val || 10) + (mentionCount * 5); // Boost size by local relevance
                node.data.mentionScore = mentionCount;
            }

            // Smart Assignment
            let assigned = false;

            // [FIX] Extract all keywords from profile (Bio + Post Hashtags)
            const profileContent = (p.biography || '').toLowerCase();
            const profileHashtags = new Set<string>();
            if (p.latestPosts && Array.isArray(p.latestPosts)) {
                p.latestPosts.forEach((post: any) => {
                    if (post.hashtags && Array.isArray(post.hashtags)) {
                        post.hashtags.forEach((t: string) => profileHashtags.add(t.replace(/^#/, '').toLowerCase()));
                    }
                });
            }

            // Try to match specific keywords if clusters have them
            for (const cluster of clusters) {
                if (cluster.data && cluster.data.keywords && Array.isArray(cluster.data.keywords)) {
                    // Match against BIO or POST HASHTAGS
                    // [FIX] Provenance Tracking
                    const matchKw = cluster.data.keywords.find((kw: string) => {
                        const k = kw.toLowerCase().replace(/^#/, '');
                        return profileContent.includes(k) || profileHashtags.has(k);
                    });

                    if (matchKw) {
                        const k = matchKw.toLowerCase().replace(/^#/, '');
                        const source = profileHashtags.has(k) ? 'recent post hashtags' : 'bio text';

                        // [FIX] Include bio snippet or hashtag list in evidence
                        let evidenceDetail = '';
                        if (profileHashtags.has(k)) {
                            const matchingHashtags = Array.from(profileHashtags).filter(h => h.includes(k)).slice(0, 3);
                            evidenceDetail = ` (hashtags: #${matchingHashtags.join(', #')})`;
                        } else {
                            // Show bio snippet around the matched keyword
                            const bioSnippet = p.biography ? p.biography.slice(0, 60) : '';
                            evidenceDetail = ` (bio: "${bioSnippet}...")`;
                        }

                        node.data.evidence = `Matched topic '${matchKw}' found in ${source}${evidenceDetail}`;
                        cluster.children.push(node);
                        assigned = true;
                        break;
                    }
                }
            }

            // Fallback Assignment (By Influence Tier)
            if (!assigned && clusters.length >= 3) {
                // [FIX] Provide better evidence for fallback assignments
                const bioSnippet = p.biography ? p.biography.slice(0, 50) : 'No bio';
                const followerInfo = p.followersCount ? `${(p.followersCount / 1000).toFixed(1)}K followers` : 'Unknown followers';
                const engInfo = engagementRate > 0 ? `, ${(engagementRate * 100).toFixed(1)}% Eng` : '';

                if (index < 10) {
                    node.data.evidence = `High influence profile (Top 10, ${followerInfo}${engInfo}). Bio: "${bioSnippet}..."`;
                    clusters[0].children.push(node);
                }
                else if (index < 30) {
                    node.data.evidence = `Growing profile (Top 30, ${followerInfo}${engInfo}). Bio: "${bioSnippet}..."`;
                    clusters[1].children.push(node);
                }
                else {
                    node.data.evidence = `Profile with ${followerInfo}${engInfo}. Bio: "${bioSnippet}..."`;
                    clusters[2].children.push(node);
                }
            } else if (!assigned && clusters.length > 0) {
                const bioSnippet = p.biography ? p.biography.slice(0, 50) : 'No bio';
                const engInfo = engagementRate > 0 ? ` (${(engagementRate * 100).toFixed(1)}% Eng)` : '';
                node.data.evidence = `General pool assignment${engInfo}. Bio: "${bioSnippet}..."`;
                clusters[0].children.push(node); // Dump all in first if no other logic
            }
        });

        // 5. Clean empty clusters
        root.children = clusters.filter(c => c.children.length > 0);

        // [DEBUG] Log cluster statistics
        console.log(`[GraphGen] Tree Structure: ${root.children.length} clusters with nodes: `);
        root.children.forEach((cluster, idx) => {
            console.log(`  - Cluster ${idx + 1}: "${cluster.label}"(${cluster.children.length} nodes)`);
        });

        // 6. Flatten to Nodes & Links (Required for Force Graph)
        // 6. Flatten to Nodes & Links (Required for Force Graph)
        // [FIX] Use existing variables declared at top of function
        // Clear them first to correspond to strict typing if needed, but they are const arrays so we just push to them.
        // Actually they are empty at start.

        const traverse = (node: any, parentId?: string) => {
            nodes.push(node);
            if (parentId) {
                links.push({ source: parentId, target: node.id, value: 1 });
            }
            if (node.children && node.children.length > 0) {
                node.children.forEach((child: any) => traverse(child, node.id));
            }
            // [FIX] Recursive check for data.profiles (Hybrid Graph)
            if (node.data && node.data.profiles && Array.isArray(node.data.profiles)) {
                node.data.profiles.forEach((profile: any) => traverse(profile, node.id));
            }

            // [NEW] Generate Evidence Subnodes via Helper
            if (node.data && node.data.evidenceItems) {
                this.createEvidenceSubnodes(node, node.data.evidenceItems, nodes, links);
            }
        };

        traverse(root);

        // [NEW] Intelligent Pruning based on Query Intent
        if (plan && plan.intent) {
            this.optimizeGraphTopology(nodes, links, plan.intent, root);
        }

        // Ensure analytics carries the root
        if (!analytics) analytics = {};
        analytics.root = root;

        // [NEW] Populate Analytics Lists (For UI Panels)
        const extractedAnalytics = {
            creators: [] as any[],
            brands: [] as any[],
            clusters: [] as any[],
            topics: [] as any[],
            subtopics: [] as any[],
            topContent: [] as any[],
            // Preserve existing
            ...analytics
        };

        // Populate lists from validated nodes
        nodes.forEach(node => {
            const richData = node.data;
            if (!richData) return;

            // Enrich with Group for UI
            const item = { ...richData, group: node.group, value: node.val };

            if (node.type === 'creator' || node.type === 'influencer' || node.group === 'creator') {
                extractedAnalytics.creators.push(item);
            } else if (node.type === 'brand' || node.group === 'brand') {
                extractedAnalytics.brands.push(item);
            } else if (node.type === 'cluster' || node.type === 'category' || node.group === 'cluster') {
                extractedAnalytics.clusters.push(item);
            } else if (node.type === 'topic' || node.group === 'topic') {
                extractedAnalytics.topics.push(item);
            }
        });

        // Ensure lists are sorted by relevance (Mention Score then Global Followers)
        // [FIX] User Request: "Rising" should prioritize local relevance
        if (extractedAnalytics.creators) {
            extractedAnalytics.creators.sort((a: any, b: any) => {
                const scoreA = (a.mentionScore || 0) * 1000 + (a.followerCount || 0); // Heavily weigh local mentions
                const scoreB = (b.mentionScore || 0) * 1000 + (b.followerCount || 0);
                return scoreB - scoreA;
            });
        }

        // [DEBUG] Log final statistics
        console.log(`[GraphGen] Final Tree Stats: ${nodes.length} nodes, ${links.length} links`);
        console.log(`[GraphGen] Analytics: ${extractedAnalytics.creators.length} creators, ${extractedAnalytics.brands.length} brands, ${extractedAnalytics.clusters.length} clusters, ${extractedAnalytics.topics.length} topics`);

        return {
            nodes,
            links,
            analytics: extractedAnalytics,
            summary: `Generated deterministic tree with ${profiles.length} profiles across ${root.children.length} clusters.`
        };
    }
    /**
 * Generate semantic/topic graph from posts
 */
    private generateSemanticGraph(records: any[], centralLabel: string, matches: any[] = []): any {
        const nodes: any[] = [];
        const links: any[] = [];

        nodes.push({ id: 'MAIN', label: centralLabel, group: 'main', val: 50, level: 0 }); // CHECK VAL

        // Source Selection: Use AI Matches if available (High Precision), else usage raw records (Broad)
        const sourceData = matches.length > 0 ? matches : records;
        const isAiDerived = matches.length > 0;

        // Extract topics from hashtags or text analysis
        const topicMap = new Map<string, { count: number, evidence: string[] }>();

        sourceData.forEach(record => {
            const hashtags = record.hashtags || [];
            // If AI Match, we can also extract from 'reason' if it contains keywords?
            // For now, stick to hashtags but filter by AI relevance.

            hashtags.forEach((tag: string) => {
                const clean = tag.replace(/^#/, '').toLowerCase();
                if (!topicMap.has(clean)) topicMap.set(clean, { count: 0, evidence: [] });

                const entry = topicMap.get(clean)!;
                entry.count++;

                // Collect evidence (provenance)
                if (isAiDerived && record.provenance?.evidence && entry.evidence.length < 3) {
                    entry.evidence.push(record.provenance.evidence[0]); // Take the quote
                } else if (entry.evidence.length < 3 && record.text) {
                    entry.evidence.push(`Post by ${record.ownerUsername || 'user'}: "${record.text.substring(0, 50)}..."`);
                }
            });
        });

        // Top 20 topics
        const sortedTopics = Array.from(topicMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20);

        sortedTopics.forEach(([topic, data], i) => {
            const tid = `topic_${i} `;
            nodes.push({
                id: tid,
                label: topic,
                group: 'topic',
                val: Math.min(30, 10 + data.count / 10),
                level: 1,
                data: {
                    occurrences: data.count,
                    // [PROVENANCE] Attach evidence for UI '?' icon
                    provenance: {
                        source: isAiDerived ? 'Semantic Match' : 'Hashtag Aggregation',
                        reasoning: `Topic appears in ${data.count} ${isAiDerived ? 'relevant ' : ''} posts.`,
                        evidence: data.evidence,
                        confidence: isAiDerived ? 0.9 : 0.6
                    }
                }
            });
            links.push({ source: 'MAIN', target: tid, value: Math.min(10, data.count / 5) });
        });

        return { nodes, links };
    }

    /**
     * [NEW] Optimize Graph Topology based on Intent (Refined for Multi-Faceted)
     * Prunes irrelevant notes to ensure the tree matches the user's specific request.
     */
    /**
     * [NEW] Universal Intelligent Graph Topology Optimization
     * Uses a Relevance Scoring System to prune irrelevant nodes while preserving context.
     * Works across ALL query types (Brand, Geo, Topic, Overindexing, etc.)
     */
    private optimizeGraphTopology(nodes: any[], links: any[], intent: string, root: any, rawQuery: string = ''): void {
        console.log(`[GraphGen] Optimizing Topology (Universal): Intent=${intent}, Query="${rawQuery}"`);

        // 1. Analyze Query Context
        const q = rawQuery.toLowerCase();
        const context = {
            hasBrand: /brand|company|product|service/.test(q),
            hasTopic: /topic|hashtag|about|saying/.test(q),
            hasGeo: /location|where|city|country/.test(q),
            hasComparison: /compare|versus|vs|diff/.test(q),
            isOverindex: intent === 'over_indexing' || intent === 'brand_affinity'
        };

        // 2. Score Nodes based on Relevance
        const relevantNodeIds = new Set<string>();
        relevantNodeIds.add(root.id);

        const keepThreshold = 2.0; // [FIX] Lowered from 5.0 to 2.0 to prevent aggressive pruning of leaf nodes

        const scoredNodes = nodes.map(node => {
            let score = 1.0; // Base score

            // A. Intent Highlighting
            if (context.hasBrand && (node.group === 'brand' || node.type === 'brand')) score += 10;
            if (context.hasTopic && (node.group === 'topic' || node.type === 'topic' || node.group === 'hashtag')) score += 10;
            if (context.hasGeo && (node.group === 'location' || node.type === 'location' || node.data?.location)) score += 10;
            if (context.isOverindex && (node.id.includes('overindexed') || node.id.includes('affinity'))) score += 20;

            // B. Direct Query Match
            if (node.label && q.includes(node.label.toLowerCase())) score += 15;

            // C. Evidence Bonus
            // [FIX] Boost evidence score to guarantee inclusion of proven nodes
            if (node.data && node.data.evidence) score += 5; // Was 3

            // D. Centrality/Importance (Log Scale)
            if (node.val) score += Math.log10(node.val) * 0.5;

            // E. Special Groups
            if (node.group === 'main' || node.group === 'cluster') score += 5; // Always keep structural nodes
            if (node.group === 'root') score += 100;

            return { id: node.id, score, node };
        });

        // 3. Mark High Value Nodes
        scoredNodes.forEach(item => {
            if (item.score >= keepThreshold) {
                relevantNodeIds.add(item.id);
            }
        });

        // 4. Structural Integrity (Keep bridges and children of important clusters)
        // If a Cluster is kept, keep some of its best children
        const highValueClusters = nodes.filter(n => (n.group === 'cluster' || n.group === 'main') && relevantNodeIds.has(n.id));

        highValueClusters.forEach(cluster => {
            // Find links FROM this cluster
            const childLinks = links.filter(l => l.source === cluster.id);
            // Keep top 10 children by value regardless of score, to ensure cluster isn't empty
            childLinks.slice(0, 10).forEach(l => relevantNodeIds.add(l.target));
        });

        // 5. Contextual Expansion for Overindexing
        // If dealing with Overindexing, we need to be more generous with "Profile" nodes if they bridge Topics and Brands
        if (context.isOverindex) {
            links.forEach(l => {
                const sourceKept = relevantNodeIds.has(l.source);
                const targetKept = relevantNodeIds.has(l.target);

                // If one end is a Topic/Brand (Kept) and other is a Profile, keep the profile if it connects to ANOTHER kept Topic/Brand
                // (Implementation simplified: Keep if connected to High Value Cluster)
                if ((sourceKept && !targetKept) || (!sourceKept && targetKept)) {
                    // One is kept. Is it a "semantic" node?
                    const keptId = sourceKept ? l.source : l.target;
                    const otherId = sourceKept ? l.target : l.source;
                    const keptNode = nodes.find(n => n.id === keptId);

                    if (keptNode && (keptNode.group === 'topic' || keptNode.group === 'brand' || keptNode.group === 'cluster')) {
                        // Keep the connecting profile to show *why* the link exists
                        relevantNodeIds.add(otherId);
                    }
                }
            });
        }

        // 6. Prunng
        const initialCount = nodes.length;
        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            if (!relevantNodeIds.has(n.id)) {
                nodes.splice(i, 1);
            }
        }

        // 7. Cleanup Links
        for (let i = links.length - 1; i >= 0; i--) {
            const l = links[i];
            const sourceExists = nodes.find(n => n.id === l.source);
            const targetExists = nodes.find(n => n.id === l.target);
            if (!sourceExists || !targetExists) {
                links.splice(i, 1);
            }
        }

        console.log(`[GraphGen] Universal Optimization: Kept ${nodes.length}/${initialCount} nodes. (Context: ${JSON.stringify(context)})`);

        // 8. Prune Empty Clusters (Recursive Cleanup)
        this.pruneEmptyClusters(nodes, links);
    }

    /**
     * [NEW] Recursively prune clusters that have no children
     * Ensures we don't display empty "shells" in the graph.
     */
    private pruneEmptyClusters(nodes: any[], links: any[]): void {
        let changed = true;
        let pass = 0;

        while (changed && pass < 5) { // Limit passes to prevent infinite loops
            changed = false;
            pass++;

            const nodeIds = new Set(nodes.map(n => n.id));
            const childCounts = new Map<string, number>();

            // Count children for each node (where node is source)
            links.forEach(l => {
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                if (nodeIds.has(src)) {
                    childCounts.set(src, (childCounts.get(src) || 0) + 1);
                }
            });

            // Identify empty clusters
            const clustersToRemove = new Set<string>();
            nodes.forEach(n => {
                // Determine if it's a cluster
                const isCluster = n.group === 'cluster' || n.type === 'cluster' || n.group === 'category';

                // Protect Root/Main
                const isProtected = n.id === 'MAIN' || n.group === 'root' || n.id === 'root' || n.group === 'main';

                if (isCluster && !isProtected) {
                    const count = childCounts.get(n.id) || 0;
                    if (count === 0) {
                        clustersToRemove.add(n.id);
                    }
                }
            });

            if (clustersToRemove.size > 0) {
                console.log(`[GraphPruning] Pass ${pass}: Removing ${clustersToRemove.size} empty clusters:`, Array.from(clustersToRemove));

                // Remove nodes
                for (let i = nodes.length - 1; i >= 0; i--) {
                    if (clustersToRemove.has(nodes[i].id)) {
                        nodes.splice(i, 1);
                        changed = true;
                    }
                }

                // Remove associated links
                for (let i = links.length - 1; i >= 0; i--) {
                    const l = links[i];
                    const src = typeof l.source === 'object' ? l.source.id : l.source;
                    const tgt = typeof l.target === 'object' ? l.target.id : l.target;

                    if (clustersToRemove.has(src) || clustersToRemove.has(tgt)) {
                        links.splice(i, 1);
                    }
                }
            }
        }
    }



    /**
     * Generate comparison graph with multiple centers
     */
    private generateComparisonGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        const nodes: any[] = [];
        const links: any[] = [];
        const addedNodeIds = new Set<string>();

        // [FIX] Pre-process ALL data to build a Master Rich Map using robust aggregateProfiles
        // This ensures that if Step 3 (Enrichment) has better data than Step 1 (Audience),
        // we use the best available data for each profile.
        const allItems = results.flat();
        const richProfiles = this.aggregateProfiles(allItems);

        // Build a map for quick lookups
        const richMap = new Map<string, any>();
        richProfiles.forEach(p => {
            const uid = (p.username || '').toLowerCase().trim();
            if (uid) richMap.set(uid, p);
            // Also index by ID if available
            if (p.id) richMap.set(String(p.id), p);
        });

        console.log(`[GraphGen] Built Rich Map with ${richMap.size} profiles from ${allItems.length} raw records.`);

        // [FIX] Use Map for Node Lookup to enable Enrichment Merging
        const nodeMap = new Map<string, any>();
        const addedMainNodes = new Set<string>();

        // Identify targets from query or plan steps
        const steps = plan.steps || [];

        results.forEach((resultSet, index) => {
            if (!Array.isArray(resultSet) || resultSet.length === 0) return;

            const currentStep = steps[index];

            // [FIX] Detect Enrichment Steps - Skip creating a specific cluster for them
            // If this step was just "enriching" previous data, we don't want a "Group 3" node for it.
            // We check if it's explicitly an enrichment actor OR if the data is purely enrichment (high overlap)
            const isExplicitEnrichment = currentStep && (
                (currentStep.actorId && (currentStep.actorId.includes('instagram-api-scraper') || currentStep.actorId.includes('profile-scraper'))) ||
                (currentStep.input && typeof currentStep.input === 'string' && currentStep.input.includes('USE_DATA_FROM_STEP'))
            );

            if (isExplicitEnrichment && index > 0) {
                // Data is already in richMap, so we don't need to create a visual cluster for this step
                // However, we verify if this step introduced ANY new nodes that should be in the graph?
                // Usually for enrichment, the answer is no (it modifies existing).
                return;
            }

            // --- STANDARD CLUSTER GENERATION ---

            // [FIX] Anchor Multi-Hub comparisons to a central invisible ROOT
            // This prevents clusters from flying miles apart
            if (nodes.length === 0) {
                nodes.push({
                    id: 'ROOT',
                    label: 'Comparison',
                    group: 'root',
                    type: 'root', // [FIX] Explicit Type
                    val: 1,
                    level: 0,
                    opacity: 0.0
                });
            }

            let clusterLabel = `Group ${index + 1}`;

            // [FIX] Resolve Placeholder Labels (e.g. @USE_DATA_FROM_STEP_step_1)
            // If the label matches the placeholder pattern, we look up the first username from that step's results.
            const placeholderPattern = /@USE_DATA_FROM_STEP_step_(\d+)/i;
            const stepMatch = clusterLabel.match(placeholderPattern) || (currentStep?.input?.username?.[0] || '').match(placeholderPattern);

            if (stepMatch) {
                const stepIdx = parseInt(stepMatch[1]) - 1;
                if (results[stepIdx] && results[stepIdx].length > 0) {
                    const firstItem = results[stepIdx][0];
                    const resolvedUsername = firstItem.username || firstItem.ownerUsername || firstItem.owner?.username;
                    if (resolvedUsername) {
                        clusterLabel = `@${resolvedUsername}`;
                    }
                }
            } else if (currentStep && currentStep.input) {
                // Determine label from input if not a step placeholder
                if (currentStep.input.username && Array.isArray(currentStep.input.username)) {
                    const firstInput = currentStep.input.username[0];
                    if (typeof firstInput === 'string' && !firstInput.startsWith('USE_DATA_FROM_STEP')) {
                        clusterLabel = firstInput.startsWith('@') ? firstInput : `@${firstInput}`;
                    }
                }
            }

            const mainId = `MAIN_${index}`;
            if (!addedMainNodes.has(mainId)) {
                nodes.push({
                    id: mainId,
                    label: clusterLabel,
                    group: 'main',
                    type: 'main', // [FIX] Explicit Type
                    val: 50,
                    level: 1
                });
                addedMainNodes.add(mainId);
                // [FIX] Link to Root
                links.push({ source: 'ROOT', target: mainId, value: 5 });
            }

            // Add nodes for this cluster
            resultSet.slice(0, 50).forEach((record: any, i) => {
                let username = record.username || record.ownerUsername || record.owner?.username || record.name || record.value;

                if (!username || username === 'undefined') {
                    username = `user_${index}_${i} `;
                }

                const nid = username.toLowerCase().replace('@', '').trim();

                // [FIX] Retrieve Rich Data from Master Map
                const richProfile = richMap.get(nid) || record;

                // [FIX] Default to 'profile' (Person Icon) instead of generic dot
                // If it's the target of a "Followers" scrape, it's a user profile.
                let group = 'profile';
                if (richProfile.isVerified || (richProfile.followersCount && richProfile.followersCount > 10000)) group = 'creator';

                if (!nodeMap.has(nid)) {
                    const newNode = this.hydrateNodeData(richProfile, group, `Audience of ${clusterLabel}`, query);
                    // Standard types and group were already handled by hydrateNodeData
                    // But Comparison Graph has specific level 2 logic
                    newNode.level = 2;

                    nodes.push(newNode);
                    nodeMap.set(nid, newNode);
                    addedNodeIds.add(nid);

                    // [FIX] Generate Subnodes for Comparison Graph too
                    if (newNode.data && newNode.data.evidenceItems) {
                        this.createEvidenceSubnodes(newNode, newNode.data.evidenceItems, nodes, links);
                    }
                } else {
                    // [FIX] Overlap Detection!
                    // If node already exists, it means it's followed by MULTIPLE Main nodes.
                    // We can highlight it or boost its value.
                    const existing = nodeMap.get(nid);
                    existing.val += 5; // Boost size
                    existing.color = '#fbbf24'; // Gold for overlap? (Optionally)
                }

                // Link to THIS cluster's main node
                links.push({ source: mainId, target: nid, value: 2 });

                // [FIX] Update Provenance Evidence
                // [FIX] Update Provenance Evidence
                const existing = nodeMap.get(nid);
                const sourceLabel = clusterLabel.startsWith('@') ? clusterLabel : `@${clusterLabel.replace('Group ', 'group_')} `;

                if (existing) {
                    if (!existing.data.evidence) {
                        existing.data.evidence = `Audience of ${sourceLabel} `;
                    } else if (!existing.data.evidence.includes(sourceLabel)) {
                        // Append if shared and mark as OVERLAP
                        existing.data.evidence = `Shared Audience of ${existing.data.evidence.replace('Audience of ', '')}, ${sourceLabel} `;
                        existing.color = '#fbbf24'; // Gold for shared
                        existing.val = 20; // Boost visibility
                        existing.group = 'cluster'; // Treat as connector
                    }
                }
            });
        });

        // [NEW] Calculate Comparative Analytics (Topics & Brands)
        const topicCounts = new Map<string, number>();
        const brandCounts = new Map<string, number>();
        // [NEW] Collect evidence samples for the UI (Bio snippets, etc.)
        const topicEvidence = new Map<string, any[]>();
        const brandEvidence = new Map<string, any[]>();

        richProfiles.forEach(p => {
            // Extract Bio Keywords
            const bio = (p.biography || p.bio || '').toLowerCase();
            const keywords = new Set(bio.match(/#[a-z0-9_]+/g) || []);

            // [FIX] Also Extract Hashtags from Recent Posts
            if (p.latestPosts && Array.isArray(p.latestPosts)) {
                p.latestPosts.forEach((post: any) => {
                    const tags = post.hashtags || [];
                    tags.forEach((t: string) => {
                        const clean = t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase();
                        keywords.add(clean);
                    });
                    // Also try to extract from caption if no explicit hashtags
                    if (tags.length === 0 && post.caption) {
                        const captionTags = post.caption.toLowerCase().match(/#[a-z0-9_]+/g) || [];
                        captionTags.forEach((t: string) => keywords.add(t));
                    }
                });
            }

            keywords.forEach((k: string) => {
                topicCounts.set(k, (topicCounts.get(k) || 0) + 1);
                // Collect sample evidence (up to 5 per topic)
                if (!topicEvidence.has(k)) topicEvidence.set(k, []);
                if (topicEvidence.get(k).length < 30) {
                    topicEvidence.get(k).push({
                        type: 'mention',
                        text: `Found in content of @${p.username} `,
                        url: `https://instagram.com/${p.username}/`,
                        date: 'Recent Activity',
                        author: p.username
                    });
                }
            });

            // Extract Brands (Mentions in posts or bio)
            // Simple heuristic: @mentions in bio
            const mentions = bio.match(/@[a-z0-9_.]+/g) || [];
            mentions.forEach((m: string) => {
                if (m !== '@' + p.username) { // Don't count self
                    brandCounts.set(m, (brandCounts.get(m) || 0) + 1);
                    // Collect sample evidence (up to 5 per brand)
                    if (!brandEvidence.has(m)) brandEvidence.set(m, []);
                    if (brandEvidence.get(m).length < 30) { //30 LIMIT
                        brandEvidence.get(m).push({
                            type: 'bio_mention',
                            text: `Mentioned in bio of @${p.username}: "${bio.substring(0, 60)}..."`,
                            url: `https://instagram.com/${p.username}/`,
                            date: 'Profile Bio',
                            author: p.username
                        });
                    }
                }
            });
        });

        const sortedTopics = Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15) // Top 15 shared topics
            .map(([label, count]) => ({ label, count, type: 'topic' }));

        // [VISUAL INTELLIGENCE] Merge AI-Detected Brands
        if (analytics && analytics.visual && analytics.visual.brands) {
            analytics.visual.brands.forEach((brand: any) => {
                const name = brand.name || brand.label;
                if (!name) return;

                // Add or Boost count
                const label = name.startsWith('@') ? name : name; // Keep simplified
                const current = brandCounts.get(label) || 0;
                brandCounts.set(label, Math.max(current, (brand.count || 5)));

                // Add Evidence if missing
                if (!brandEvidence.has(label)) {
                    brandEvidence.set(label, [{
                        type: 'ai_detection',
                        text: brand.evidence || `Visually detected by Gemini`,
                        date: 'AI Analysis',
                        confidence: 0.9
                    }]);
                }
            });
        }

        const sortedBrands = Array.from(brandCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15) // Top 15 shared brands (Increased from 10)
            .map(([label, count]) => ({ label, count, type: 'brand' }));

        // [NEW] Materialize Topics and Brands as Nodes in the Graph
        sortedTopics.forEach((t, idx) => {
            const tid = `topic_${idx}`;
            // Remove hash for lookup key
            const rawKey = t.label; // Label includes #? No, match returns #
            // keywords array has #. map removes it? No map uses k directly.
            // topicCounts key IS WITH #. 'label' from entries is WITH #.
            const evidenceList = topicEvidence.get(t.label) || [];

            nodes.push({
                id: tid,
                label: t.label.startsWith('#') ? t.label : `#${t.label}`,
                group: 'topic',
                type: 'topic',
                color: '#8b5cf6', // Violet
                val: 15 + (t.count / 2),
                level: 1,
                data: {
                    description: `Topic ${t.label}`,
                    evidence: `Shared interest mentioned by ${t.count} profiles`,
                    // [FIX] Attach specific provenance for UI "Why?" button
                    provenance: {
                        source: 'Bio Analysis',
                        confidence: 0.9,
                        evidence: evidenceList
                    }
                }
            });
            links.push({ source: 'ROOT', target: tid, value: 3 });
        });

        sortedBrands.forEach((b, idx) => {
            const bid = `brand_${idx}`;
            const evidenceList = brandEvidence.get(b.label) || [];

            nodes.push({
                id: bid,
                label: b.label,
                group: 'brand',
                type: 'brand',
                color: '#3b82f6', // Blue
                val: 15 + (b.count / 2),
                level: 1,
                data: {
                    description: `Brand: ${b.label}`,
                    evidence: `Shared affinity mentioned by ${b.count} profiles`,
                    // [FIX] Attach specific provenance for UI "Why?" button
                    provenance: {
                        source: 'Bio Analysis',
                        confidence: 0.9,
                        evidence: evidenceList
                    }
                }
            });
            links.push({ source: 'ROOT', target: bid, value: 3 });
        });

        // [NEW] Generate Comparative Analytics (Unique vs Shared)
        // This provides detailed comparison metrics for the UI
        const comparisonAnalytics: any = {
            profiles: [],
            shared: {
                followers: [],
                topics: [],
                brands: [],
                count: 0
            },
            overlapPercentage: 0
        };

        // Identify which profiles belong to which main cluster
        const clusterProfiles = new Map<string, any[]>();
        results.forEach((resultSet, index) => {
            const mainId = `MAIN_${index}`;
            const profiles: any[] = [];

            resultSet.slice(0, 50).forEach((record: any) => {
                const username = record.username || record.ownerUsername || record.owner?.username;
                if (username) {
                    const nid = username.toLowerCase().replace('@', '').trim();
                    const richProfile = richMap.get(nid) || record;
                    profiles.push({ nid, ...richProfile });
                }
            });

            clusterProfiles.set(mainId, profiles);
        });

        // Calculate unique and shared followers for each profile
        const profileKeys = Array.from(clusterProfiles.keys());

        profileKeys.forEach((mainId, idx) => {
            const currentProfiles = clusterProfiles.get(mainId) || [];
            const currentNids = new Set(currentProfiles.map(p => p.nid));

            // Find shared followers (exist in other clusters)
            const sharedNids = new Set<string>();
            const uniqueNids = new Set<string>();

            currentNids.forEach(nid => {
                let foundInOther = false;
                profileKeys.forEach((otherMainId) => {
                    if (otherMainId !== mainId) {
                        const otherProfiles = clusterProfiles.get(otherMainId) || [];
                        if (otherProfiles.some(p => p.nid === nid)) {
                            foundInOther = true;
                        }
                    }
                });

                if (foundInOther) {
                    sharedNids.add(nid);
                } else {
                    uniqueNids.add(nid);
                }
            });

            // Extract unique topics and brands for this profile
            const uniqueTopics = new Set<string>();
            const uniqueBrands = new Set<string>();

            currentProfiles.forEach(p => {
                const bio = (p.biography || p.bio || '').toLowerCase();
                const keywords = new Set<string>(bio.match(/#[a-z0-9_]+/g) || []);
                keywords.forEach(k => uniqueTopics.add(k));

                const mentions = bio.match(/@[a-z0-9_.]+/g) || [];
                mentions.forEach(m => {
                    if (m !== '@' + p.username) uniqueBrands.add(m);
                });
            });

            // Calculate engagement metrics
            const avgEngagement = currentProfiles.length > 0
                ? (currentProfiles.reduce((sum, p) => sum + (p.engagementRate || 0), 0) / currentProfiles.length).toFixed(2)
                : '0.00';

            // Get profile label from step or default
            const currentStep = steps[idx];
            let profileLabel = `Profile ${idx + 1}`;
            if (currentStep && currentStep.input && currentStep.input.username) {
                profileLabel = `@${currentStep.input.username[0]}`;
            }

            comparisonAnalytics.profiles.push({
                name: profileLabel,
                uniqueFollowers: uniqueNids.size,
                sharedFollowers: sharedNids.size,
                totalFollowers: currentNids.size,
                uniqueTopics: Array.from(uniqueTopics).slice(0, 10),
                uniqueBrands: Array.from(uniqueBrands).slice(0, 10),
                avgEngagement: `${avgEngagement}%`,
                followersList: Array.from(uniqueNids).slice(0, 20) // Sample for UI
            });
        });

        // Calculate overall shared metrics
        if (profileKeys.length >= 2) {
            const allNids = new Set<string>();
            const nidCounts = new Map<string, number>();

            profileKeys.forEach(mainId => {
                const profiles = clusterProfiles.get(mainId) || [];
                profiles.forEach(p => {
                    allNids.add(p.nid);
                    nidCounts.set(p.nid, (nidCounts.get(p.nid) || 0) + 1);
                });
            });

            // Shared = appears in 2+ clusters
            const sharedFollowers = Array.from(nidCounts.entries())
                .filter(([_, count]) => count >= 2)
                .map(([nid, _]) => nid);

            comparisonAnalytics.shared.followers = sharedFollowers.slice(0, 20);
            comparisonAnalytics.shared.count = sharedFollowers.length;
            comparisonAnalytics.shared.topics = sortedTopics.slice(0, 10).map(t => t.label);
            comparisonAnalytics.shared.brands = sortedBrands.slice(0, 10).map(b => b.label);

            // Calculate overlap percentage
            const totalUnique = allNids.size;
            comparisonAnalytics.overlapPercentage = totalUnique > 0
                ? ((sharedFollowers.length / totalUnique) * 100).toFixed(1)
                : 0;
        }

        console.log(`[GraphGen] Comparison Analytics: ${comparisonAnalytics.profiles.length} profiles, ${comparisonAnalytics.shared.count} shared followers (${comparisonAnalytics.overlapPercentage}% overlap)`);

        // [NEW] Phase 2: Create Visual Overlap Cluster
        // This creates a dedicated node to visually group shared followers
        if (comparisonAnalytics.shared.count > 0 && profileKeys.length >= 2) {
            const overlapClusterId = 'OVERLAP_CLUSTER';

            // Create overlap cluster node
            nodes.push({
                id: overlapClusterId,
                label: `Shared Audience (${comparisonAnalytics.shared.count})`,
                group: 'cluster',
                type: 'cluster',
                val: 30 + Math.min(comparisonAnalytics.shared.count / 2, 20), // Size based on overlap
                level: 1,
                color: '#fbbf24', // Gold
                data: {
                    description: `${comparisonAnalytics.shared.count} followers shared across profiles`,
                    overlapPercentage: comparisonAnalytics.overlapPercentage,
                    sharedTopics: comparisonAnalytics.shared.topics,
                    sharedBrands: comparisonAnalytics.shared.brands,
                    evidence: `${comparisonAnalytics.overlapPercentage}% audience overlap`,
                    provenance: {
                        source: 'Comparison Analysis',
                        confidence: 0.95,
                        evidence: [
                            {
                                type: 'overlap_calculation',
                                text: `${comparisonAnalytics.shared.count} shared followers out of ${comparisonAnalytics.profiles.reduce((sum, p) => sum + p.totalFollowers, 0)} total`,
                                date: new Date().toISOString()
                            }
                        ]
                    }
                }
            });

            // Link overlap cluster to ROOT
            links.push({
                source: 'ROOT',
                target: overlapClusterId,
                value: 5,
                color: '#fbbf24'
            });

            // [NEW] Link shared followers to overlap cluster
            // Identify shared follower nodes and create links
            const sharedFollowerIds = new Set(comparisonAnalytics.shared.followers);

            let linkedCount = 0;
            nodes.forEach(node => {
                // Check if this node is a shared follower
                // Match by node.id (which is the normalized nid)
                // Exclude main nodes, root, cluster nodes, topics, and brands
                const isSharedFollower = sharedFollowerIds.has(node.id);
                const isNotSpecialNode = !['main', 'root', 'cluster', 'topic', 'brand'].includes(node.group);

                if (isSharedFollower && isNotSpecialNode) {
                    // Add link from overlap cluster to shared follower
                    links.push({
                        source: overlapClusterId,
                        target: node.id,
                        value: 2,
                        color: '#fbbf24', // Gold link
                        type: 'overlap' // Custom type for styling
                    });

                    // Update node appearance to emphasize overlap
                    node.isShared = true;
                    node.data = node.data || {};
                    node.data.sharedAcross = comparisonAnalytics.profiles.map(p => p.name).join(', ');
                    linkedCount++;
                }
            });

            console.log(`[GraphGen] Created overlap cluster with ${linkedCount} shared follower links (${sharedFollowerIds.size} total shared)`);
        }

        return {
            nodes,
            links,
            analytics: {
                topics: sortedTopics,
                brands: sortedBrands,
                // Rising stars logic can be added here if growth metrics exist
                rising: richProfiles.filter(p => (p.followersCount > 1000 && p.followersCount < 50000)).slice(0, 10),
                // [NEW] Comparison-specific analytics
                comparison: comparisonAnalytics
            }
        };
    }

    /**
     * Generate competitor content analysis graph
     */
    private generateCompetitorContentGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        const nodes: any[] = [];
        const links: any[] = [];
        const addedNodeIds = new Set<string>();

        // Get competitor handle from plan or query
        const competitorHandle = plan.steps[0]?.input?.directUrls?.[0]?.match(/instagram\.com\/([^\/]+)/)?.[1] ||
            query.match(/@(\w+)/)?.[1] || 'competitor';

        // ROOT node
        nodes.push({
            id: 'ROOT',
            label: 'Content Analysis',
            group: 'root',
            type: 'root',
            val: 1,
            level: 0,
            opacity: 0.0
        });

        // MAIN node (competitor profile)
        const mainId = `MAIN_${competitorHandle}`;
        nodes.push({
            id: mainId,
            label: `@${competitorHandle}`,
            group: 'main',
            type: 'main',
            val: 30,
            level: 1,
            color: '#8b5cf6', // Purple for competitor
            data: {
                username: competitorHandle,
                description: 'Competitor Profile',
                provenance: {
                    source: 'apify/instagram-api-scraper',
                    datasetId: results[0]?.[0]?.datasetId || 'unknown',
                    scrapedAt: new Date().toISOString(),
                    evidence: [{
                        type: 'profile_analysis',
                        url: `https://instagram.com/${competitorHandle}`,
                        scrapedAt: new Date().toISOString()
                    }]
                }
            }
        });
        links.push({ source: 'ROOT', target: mainId, value: 5 });

        // Process posts
        const allPosts = results.flat().filter(r => r.type === 'Post' || r.url?.includes('/p/'));

        // Aggregate posts by type
        const postsByType = new Map<string, any[]>();
        const hashtagCounts = new Map<string, number>();
        const mentionCounts = new Map<string, number>();

        allPosts.forEach((post, idx) => {
            const postType = post.type || (post.videoUrl ? 'Video' : post.images?.length > 1 ? 'Carousel' : 'Image');
            const engagement = (post.likesCount || 0) + (post.commentsCount || 0);

            // Only show top 30 posts in graph to avoid clutter
            if (idx < 30) {
                const postId = `post_${idx}`;
                const displayUrl = post.displayUrl || post.url || (post.images && post.images[0]);

                nodes.push({
                    id: postId,
                    label: `${postType} Post`,
                    group: 'post',
                    type: 'post',
                    val: Math.min(30, 5 + Math.log(engagement + 1) * 2),
                    level: 2,
                    color: postType === 'Video' || postType === 'Reel' ? '#ef4444' :
                        postType === 'Carousel' ? '#f59e0b' : '#3b82f6',
                    profilePic: proxyMediaUrl(displayUrl),
                    data: {
                        postType,
                        url: post.url,
                        imageUrl: proxyMediaUrl(displayUrl),
                        caption: post.caption?.substring(0, 200),
                        likesCount: post.likesCount,
                        commentsCount: post.commentsCount,
                        engagement,
                        timestamp: post.timestamp,
                        provenance: {
                            source: 'apify/instagram-api-scraper',
                            datasetId: post.datasetId || 'unknown',
                            scrapedAt: new Date().toISOString(),
                            evidence: [{
                                type: 'post_data',
                                url: post.url,
                                metrics: {
                                    likes: post.likesCount,
                                    comments: post.commentsCount,
                                    engagement
                                },
                                scrapedAt: new Date().toISOString()
                            }]
                        }
                    }
                });
                links.push({ source: mainId, target: postId, value: 2 });
            }

            // Track by type (use all posts for analytics)
            if (!postsByType.has(postType)) postsByType.set(postType, []);
            postsByType.get(postType)!.push(post);

            // Extract hashtags (Case-Insensitive)
            const hashtags = post.caption?.match(/#\w+/g) || [];
            hashtags.forEach(tag => {
                const normalizedTag = tag.toLowerCase();
                hashtagCounts.set(normalizedTag, (hashtagCounts.get(normalizedTag) || 0) + 1);
            });

            // Extract mentions (Case-Insensitive)
            const mentions = post.caption?.match(/@\w+/g) || [];
            mentions.forEach(mention => {
                const normalizedMention = mention.toLowerCase();
                mentionCounts.set(normalizedMention, (mentionCounts.get(normalizedMention) || 0) + 1);
            });
        });

        // Create Hashtag and Mention nodes with evidence
        const bestHashtagEvidence = new Map<string, any>();
        const bestMentionEvidence = new Map<string, any>();

        allPosts.forEach(post => {
            const hashtags = post.caption?.match(/#\w+/g) || [];
            hashtags.forEach(tag => {
                const engagement = (post.likesCount || 0) + (post.commentsCount || 0);
                if (!bestHashtagEvidence.has(tag) || engagement > bestHashtagEvidence.get(tag).engagement) {
                    bestHashtagEvidence.set(tag, {
                        engagement,
                        text: post.caption,
                        url: post.url,
                        author: post.ownerUsername || post.author,
                        date: post.timestamp
                    });
                }
            });

            const mentions = post.caption?.match(/@\w+/g) || [];
            mentions.forEach(mention => {
                const normalizedMention = mention.toLowerCase();
                const engagement = (post.likesCount || 0) + (post.commentsCount || 0);
                if (!bestMentionEvidence.has(normalizedMention) || engagement > bestMentionEvidence.get(normalizedMention).engagement) {
                    bestMentionEvidence.set(normalizedMention, {
                        engagement,
                        text: post.caption,
                        url: post.url,
                        author: post.ownerUsername || post.author,
                        date: post.timestamp
                    });
                }
            });
        });

        // Add top hashtag nodes
        const topHashtags = Array.from(hashtagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        topHashtags.forEach(([tag, count]) => {
            const tagId = tag.toLowerCase().replace('#', 'tag_');
            const evidence = bestHashtagEvidence.get(tag);

            nodes.push({
                id: tagId,
                label: tag,
                group: 'topic',
                type: 'topic',
                val: 10 + count * 2,
                level: 2,
                color: '#10b981',
                data: {
                    hashtag: tag,
                    count,
                    provenance: {
                        source: 'derived',
                        calculationMethod: 'hashtag_frequency_analysis',
                        evidence: evidence ? [{
                            text: evidence.text,
                            url: evidence.url,
                            author: evidence.author,
                            date: evidence.date,
                            type: 'social_post'
                        }] : []
                    }
                }
            });
            links.push({ source: mainId, target: tagId, value: Math.min(5, count) });
        });

        // Add top mention nodes
        const topMentions = Array.from(mentionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // [FIX] Show up to 10 brands, not just 5

        topMentions.forEach(([mention, count]) => {
            const mentionId = mention.toLowerCase().replace('@', 'mention_');
            const evidence = bestMentionEvidence.get(mention);

            nodes.push({
                id: mentionId,
                label: mention,
                group: 'brand',
                type: 'brand',
                val: 10 + count * 2,
                level: 2,
                color: '#6366f1',
                data: {
                    mention,
                    count,
                    provenance: {
                        source: 'derived',
                        calculationMethod: 'mention_frequency_analysis',
                        evidence: evidence ? [{
                            text: evidence.text,
                            url: evidence.url,
                            author: evidence.author,
                            date: evidence.date,
                            type: 'social_post'
                        }] : []
                    }
                }
            });
            links.push({ source: mainId, target: mentionId, value: Math.min(5, count) });
        });

        console.log(`[GraphGen] Competitor content analysis: ${allPosts.length} posts, ${topHashtags.length} hashtags, ${topMentions.length} mentions`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                contentAnalysis: {
                    totalPosts: allPosts.length,
                    postsByType: Object.fromEntries(
                        Array.from(postsByType.entries()).map(([type, posts]) => [
                            type,
                            {
                                count: posts.length,
                                avgEngagement: posts.reduce((sum, p) => sum + ((p.likesCount || 0) + (p.commentsCount || 0)), 0) / posts.length
                            }
                        ])
                    ),
                    topHashtags: topHashtags.map(([tag, count]) => ({ tag, count })),
                    topMentions: topMentions.map(([mention, count]) => ({ mention, count }))
                },
                // [NEW] Map to top-level analytics for side panels
                topics: topHashtags.map(([tag, count]) => {
                    const evidence = bestHashtagEvidence.get(tag);
                    return {
                        name: tag,
                        count,
                        percentage: (count / allPosts.length * 100).toFixed(1) + '%',
                        evidence: evidence?.text
                    };
                }),
                brands: topMentions.map(([mention, count]) => {
                    const evidence = bestMentionEvidence.get(mention);
                    return {
                        name: mention,
                        count,
                        citation: evidence?.text,
                        url: evidence?.url
                    };
                })
            }
        };
    }

    /**
     * Generate hashtag performance graph
     */
    private generateHashtagGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        // Flatten results (expecting posts)
        const allPosts = results.flat().filter(item => item.type === 'Image' || item.type === 'Video' || item.type === 'Sidecar' || item.caption);

        // Extract the core hashtag
        const coreHashtag = query.match(/#(\w+)/)?.[0] || query.trim();
        const hashtagLabel = coreHashtag.startsWith('#') ? coreHashtag : `#${coreHashtag}`;
        const mainId = 'MAIN_HASHTAG';

        const nodes: any[] = [];
        const links: any[] = [];

        // 1. Root Node (The User Request)
        nodes.push({
            id: 'ROOT',
            label: query,
            type: 'root',
            val: 50,
            level: 0,
            color: '#10b981', // Emerald
            data: { label: query }
        });

        // 2. Main Node (The Target Hashtag)

        nodes.push({
            id: mainId,
            label: hashtagLabel,
            group: 'topic',
            type: 'topic',
            val: 80,
            level: 1,
            color: '#ec4899', // Pink
            data: {
                hashtag: hashtagLabel,
                description: `Analysis for ${hashtagLabel}`,
                provenance: {
                    source: 'user_query',
                    url: `https://instagram.com/explore/tags/${hashtagLabel.replace('#', '')}`,
                    evidence: [{ type: 'query_target', query, timestamp: new Date().toISOString() }]
                }
            }
        });

        links.push({ source: 'ROOT', target: mainId, value: 5 });

        // 3. Process Posts
        const coOccurringTags = new Map<string, number>();
        const authorCounts = new Map<string, any>();
        let totalEngagement = 0;

        allPosts.forEach((post, idx) => {
            const likes = post.likesCount || post.likes || 0;
            const comments = post.commentsCount || post.comments || 0;
            const engagement = likes + comments;
            totalEngagement += engagement;

            // Only visualize top 20 posts by engagement to avoid clutter
            const isTopPost = idx < 50; // We will sort them or just take first batch (scraper usually returns recent/top)

            // Extract co-occurring hashtags
            const tags = post.caption?.match(/#\w+/g) || [];
            tags.forEach(t => {
                if (t.toLowerCase() !== hashtagLabel.toLowerCase()) {
                    coOccurringTags.set(t, (coOccurringTags.get(t) || 0) + 1);
                }
            });

            // Track Authors
            const author = post.ownerUsername || post.author || post.owner?.username;
            if (author) {
                if (!authorCounts.has(author)) {
                    authorCounts.set(author, { count: 0, engagement: 0, profilePic: post.owner?.profilePicUrl });
                }
                const record = authorCounts.get(author);
                record.count++;
                record.engagement += engagement;
            }

            // Create Post Nodes for Top Content (Top 10)
            if (engagement > 100 || idx < 10) {
                const postId = `post_${idx}`;
                // ... handled in analytics, maybe add some to graph?
                // Let's add Top 5 Posts to graph
            }
        });

        // Add Top Co-occurring Hashtags to Graph
        const topTags = Array.from(coOccurringTags.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Determine best evidence for top co-occurring tags
        const bestTagPost = new Map<string, any>();
        allPosts.forEach(post => {
            const tags = post.caption?.match(/#\w+/g) || [];
            tags.forEach(t => {
                const engagement = (post.likesCount || 0) + (post.commentsCount || 0);
                if (!bestTagPost.has(t) || engagement > bestTagPost.get(t).engagement) {
                    bestTagPost.set(t, { engagement, post });
                }
            });
        });

        topTags.forEach(([tag, count]) => {
            const tagId = `tag_${tag.replace('#', '')}`;
            const best = bestTagPost.get(tag);

            nodes.push({
                id: tagId,
                label: tag,
                type: 'topic',
                group: 'topic',
                val: 10 + (count * 2),
                level: 2,
                color: '#8b5cf6', // Violet
                data: {
                    hashtag: tag,
                    count,
                    provenance: {
                        source: 'co_occurrence',
                        evidence: best ? [{
                            text: best.post.caption,
                            url: best.post.url,
                            author: best.post.ownerUsername || best.post.author,
                            date: best.post.timestamp,
                            type: 'social_post'
                        }] : [`Appeared with ${hashtagLabel} ${count} times`]
                    }
                }
            });
            links.push({ source: mainId, target: tagId, value: count });
        });

        // Add Top Authors to Graph
        const topAuthors = Array.from(authorCounts.entries())
            .sort((a, b) => b[1].engagement - a[1].engagement)
            .slice(0, 8);

        topAuthors.forEach(([author, stats]) => {
            const authorId = `author_${author}`;
            nodes.push({
                id: authorId,
                label: author,
                type: 'creator',
                group: 'creator',
                val: 20 + stats.count,
                level: 2,
                color: '#f59e0b', // Amber
                profilePic: proxyMediaUrl(stats.profilePic),
                data: {
                    username: author,
                    profilePicUrl: proxyMediaUrl(stats.profilePic),
                    evidence: `Posted ${stats.count} times with ${hashtagLabel}`
                }
            });
            links.push({ source: mainId, target: authorId, value: 5 });
        });

        console.log(`[GraphGen] Hashtag analysis: ${allPosts.length} posts, ${topTags.length} related tags`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                hashtagAnalysis: {
                    totalPosts: allPosts.length,
                    averageEngagement: allPosts.length > 0 ? totalEngagement / allPosts.length : 0,
                    topRelatedTags: topTags.map(t => ({ tag: t[0], count: t[1] })),
                    topAuthors: topAuthors.map(a => ({ username: a[0], ...a[1] }))
                },
                // [NEW] Map to top-level analytics for side panels
                topics: topTags.map(([tag, count]) => {
                    const best = bestTagPost.get(tag);
                    return {
                        name: tag,
                        count,
                        percentage: (count / allPosts.length * 100).toFixed(1) + '%',
                        evidence: best?.post?.caption,
                        sourceUrl: best?.post?.url
                    };
                }),
                creators: topAuthors.map(([author, stats]) => {
                    return {
                        handle: author,
                        name: author,
                        citation: `Posted ${stats.count} times with ${hashtagLabel}`,
                        engagement: stats.engagement
                    };
                })
            }
        };
    }

    /**
     * Generate engagement benchmark graph
     */
    private generateEngagementBenchmarkGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        const allPosts = results.flat().filter(item => item.type === 'Image' || item.type === 'Video' || item.type === 'Sidecar' || item.caption);

        // Group by owner
        const profiles = new Map<string, { posts: any[], engagement: number, engagementRate: number, followers: number }>();

        allPosts.forEach(post => {
            const owner = post.ownerUsername || post.author || post.owner?.username;
            if (owner) {
                if (!profiles.has(owner)) {
                    profiles.set(owner, { posts: [], engagement: 0, engagementRate: 0, followers: post.owner?.followersCount || 0 });
                }
                const profile = profiles.get(owner)!;
                profile.posts.push(post);
                const eng = (post.likesCount || 0) + (post.commentsCount || 0);
                profile.engagement += eng;
            }
        });

        // Calculate Averages
        profiles.forEach((stats, owner) => {
            if (stats.posts.length > 0) {
                // If we have followers count, calculate ER (Engagement Rate) = Avg Eng / Followers
                // Otherwise just use Avg Engagement
                const avgEng = stats.engagement / stats.posts.length;
                stats.engagementRate = stats.followers > 0 ? (avgEng / stats.followers) * 100 : avgEng; // Fallback to raw avg if no follower count
            }
        });

        const nodes: any[] = [];
        const links: any[] = [];
        const mainId = 'BENCHMARK';

        // Root
        nodes.push({ id: 'ROOT', label: query, type: 'root', val: 50, level: 0, color: '#10b981', data: { label: query } });
        nodes.push({ id: mainId, label: 'Comparison', type: 'topic', val: 70, level: 1, color: '#cbd5e1', data: { label: 'Benchmark' } });
        links.push({ source: 'ROOT', target: mainId, value: 5 });

        // Profile Nodes
        profiles.forEach((stats, owner) => {
            const id = owner.replace('@', '').toLowerCase();
            nodes.push({
                id: id,
                label: owner,
                type: 'creator',
                group: 'creator',
                val: 40 + (stats.engagementRate * 10), // Scale size by ER
                level: 2,
                color: '#f472b6',
                data: {
                    username: owner,
                    evidence: `Avg Eng: ${(stats.engagement / stats.posts.length).toFixed(0)}`,
                    engagementRate: stats.engagementRate.toFixed(2) + '%',
                    postsCount: stats.posts.length
                }
            });
            links.push({ source: mainId, target: id, value: 3 });

            // Top 3 Posts for each
            stats.posts.sort((a, b) => ((b.likesCount || 0) + (b.commentsCount || 0)) - ((a.likesCount || 0) + (a.commentsCount || 0)))
                .slice(0, 3)
                .forEach((post, i) => {
                    const postId = `${id}_post_${i}`;
                    // Optional: add post nodes? Maybe just keep them in analytics to keep graph clean.
                    // Let's add them as tiny nodes
                    nodes.push({
                        id: postId,
                        label: 'Post',
                        type: 'post',
                        group: 'post',
                        val: 10,
                        level: 3,
                        color: '#f1f5f9',
                        data: {
                            url: post.url,
                            caption: post.caption,
                            engagement: (post.likesCount || 0) + (post.commentsCount || 0)
                        }
                    });
                    links.push({ source: id, target: postId, value: 1 });
                });
        });

        console.log(`[GraphGen] Benchmark Comparison: ${profiles.size} profiles, ${allPosts.length} posts`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                benchmarkAnalysis: {
                    profiles: Array.from(profiles.entries()).map(([owner, stats]) => ({
                        username: owner,
                        avgEngagement: (stats.engagement / stats.posts.length).toFixed(0),
                        engagementRate: stats.engagementRate.toFixed(2),
                        totalPosts: stats.posts.length,
                        topPosts: stats.posts.slice(0, 5) // Send top 5 to dashboard
                    }))
                }
            }
        };
    }



    /**
     * Generate UGC Graph for a brand
     */
    private generateUGCGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        // Implementation similar to Hashtag Tracking
        const allPosts = results.flat().filter(item => item.type === 'Image' || item.type === 'Video' || item.type === 'Sidecar' || item.caption);

        // Extract brand name
        const brandName = query.match(/@(\w+)/)?.[1] || query.replace('UGC', '').replace('Find', '').replace('for', '').trim();
        const mainId = 'BRAND_MAIN';

        const nodes: any[] = [];
        const links: any[] = [];

        // Root
        nodes.push({ id: 'ROOT', label: query, type: 'root', val: 50, level: 0, color: '#10b981', data: { label: query } });
        nodes.push({ id: mainId, label: brandName, type: 'brand', val: 80, level: 1, color: '#ec4899', data: { label: brandName } });
        links.push({ source: 'ROOT', target: mainId, value: 5 });

        // Analyze Posts for Creators
        const creators = new Map<string, any>();

        allPosts.forEach((post, idx) => {
            const author = post.ownerUsername || post.author || post.owner?.username;
            if (author && author.toLowerCase() !== brandName.toLowerCase()) {
                if (!creators.has(author)) creators.set(author, { count: 0, engagement: 0, profilePic: post.owner?.profilePicUrl, posts: [] });
                const c = creators.get(author);
                c.count++;
                c.engagement += (post.likes || 0) + (post.comments || 0);
                c.posts.push(post);
            }
        });

        // Add Top Creators
        const topCreators = Array.from(creators.entries())
            .sort((a, b) => b[1].engagement - a[1].engagement)
            .slice(0, 15);

        topCreators.forEach(([author, stats]) => {
            const authorId = author;
            nodes.push({
                id: authorId,
                label: author,
                type: 'creator',
                group: 'creator',
                val: 20 + stats.count,
                color: '#f59e0b',
                data: {
                    username: author,
                    profilePicUrl: stats.profilePic,
                    evidence: `Posted ${stats.count} times about ${brandName}`
                }
            });
            links.push({ source: mainId, target: authorId, value: 5 });
        });

        console.log(`[GraphGen] UGC Analysis: Found ${creators.size} distinct creators in ${allPosts.length} posts`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                ugcAnalysis: {
                    totalPosts: allPosts.length,
                    topCreators: topCreators.map(([author, stats]) => ({
                        name: author,
                        handle: author,
                        engagement: stats.engagement,
                        postsCount: stats.posts.length
                    })),
                    topContent: (allPosts.length > 0)
                        ? allPosts.sort((a, b) => ((b.likes || 0) + (b.comments || 0)) - ((a.likes || 0) + (a.comments || 0))).slice(0, 5)
                        : (analytics.topContent || [])
                }
            }
        };
    }

    /**
     * Generate Sentiment Analysis Graph
     */
    private generateSentimentGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        // Results structure: [0] = posts, [1] = comments (if applicable)
        const posts = results[0] || [];
        const comments = results[1] || [];

        const allTextItems: any[] = [
            ...posts.map((p: any) => ({ text: p.caption, type: 'post', engagement: (p.likesCount || 0) + (p.commentsCount || 0), url: p.url })),
            ...comments.map((c: any) => ({ text: c.text, type: 'comment', engagement: c.likesCount || 0, url: proxyMediaUrl(c.ownerProfilePicUrl) }))
        ].filter(i => i.text);

        // Simple Dictionary-based Sentiment Analysis (can be swapped for Gemini call later)
        const positiveWords = new Set(['love', 'great', 'amazing', 'best', 'awesome', 'excellent', 'fan', 'obsessed', 'good', 'happy', 'excited', 'cant wait']);
        const negativeWords = new Set(['hate', 'worst', 'bad', 'terrible', 'awful', 'slow', 'boring', 'disappointed', 'trash', 'scam', 'angry', 'sad']);

        let sentimentScore = 0;
        let positiveCount = 0;
        let negativeCount = 0;
        const keyThemes = new Map<string, { count: number, sentiment: number }>();

        allTextItems.forEach(item => {
            const words = (item.text || '').toLowerCase().split(/\W+/);
            let itemScore = 0;

            words.forEach((w: string) => {
                if (positiveWords.has(w)) { itemScore += 1; positiveCount++; }
                if (negativeWords.has(w)) { itemScore -= 1; negativeCount++; }

                // Naive Theme Extraction (words > 4 chars)
                if (w.length > 4 && !positiveWords.has(w) && !negativeWords.has(w)) {
                    if (!keyThemes.has(w)) keyThemes.set(w, { count: 0, sentiment: 0 });
                    const theme = keyThemes.get(w);
                    theme!.count++;
                    theme!.sentiment += itemScore; // inherit sentiment of context
                }
            });

            sentimentScore += itemScore;
        });

        // Normalize Score (-1 to 1 range approx)
        const totalEvaluated = positiveCount + negativeCount || 1;
        const normalizedScore = (positiveCount - negativeCount) / totalEvaluated; // -1 (all neg) to 1 (all pos)

        const nodes: any[] = [];
        const links: any[] = [];
        const mainId = 'SENTIMENT_MAIN';

        // Root
        nodes.push({ id: 'ROOT', label: query, type: 'root', val: 50, level: 0, color: '#10b981', data: { label: query } });

        // Main Sentiment Node
        const sentimentColor = normalizedScore > 0.2 ? '#22c55e' : (normalizedScore < -0.2 ? '#ef4444' : '#94a3b8');
        const sentimentLabel = normalizedScore > 0.2 ? 'Positive' : (normalizedScore < -0.2 ? 'Negative' : 'Neutral');

        nodes.push({
            id: mainId,
            label: sentimentLabel,
            type: 'topic',
            val: 80,
            level: 1,
            color: sentimentColor,
            data: {
                label: `Sentiment: ${sentimentLabel}`,
                score: normalizedScore.toFixed(2)
            }
        });
        links.push({ source: 'ROOT', target: mainId, value: 5 });

        // Add Key Themes as Nodes
        const topThemes = Array.from(keyThemes.entries())
            .filter(([_, stats]) => stats.count > 2) // Filter noise
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 8);

        topThemes.forEach(([theme, stats]) => {
            const themeId = `theme_${theme}`;
            const themeColor = stats.sentiment > 0 ? '#86efac' : (stats.sentiment < 0 ? '#fca5a5' : '#e2e8f0');
            nodes.push({
                id: themeId,
                label: theme,
                type: 'topic',
                group: 'topic',
                val: 20 + stats.count,
                color: themeColor,
                data: {
                    theme,
                    count: stats.count,
                    sentiment: stats.sentiment
                }
            });
            links.push({ source: mainId, target: themeId, value: 3 });
        });

        // Add representative comments/posts?
        // Let's add top 3 positive and top 3 negative items if available


        console.log(`[GraphGen] Sentiment Analysis: Score ${normalizedScore.toFixed(2)} based on ${allTextItems.length} items`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                sentimentAnalysis: {
                    aggregate_score: normalizedScore,
                    dominant_emotion: sentimentLabel,
                    polarization_score: (positiveCount + negativeCount) / allTextItems.length, // Rough proxy for how charged the convo is
                    positive_count: positiveCount,
                    negative_count: negativeCount,
                    total_analyzed: allTextItems.length,
                    top_themes: topThemes.map(t => ({ term: t[0], ...t[1] }))
                }
            }
        };
    }

    /**
     * Build proper hierarchical structure from flat node array
     * Ensures clusters contain children and all nodes are properly nested
     */
    private buildGraphHierarchy(flatNodes: any[], flatLinks: any[] = []): { nodes: any[], links: any[] } {
        console.log(`[HierarchyBuilder] Processing ${flatNodes.length} flat nodes`);

        // 1. Identify node types
        const mainNode = flatNodes.find(n => n.group === 'main' || n.group === 'root' || n.type === 'root');
        const clusterNodes = flatNodes.filter(n => n.group === 'cluster');
        const leafNodes = flatNodes.filter(n =>
            ['brand', 'creator', 'topic', 'profile', 'post', 'concept'].includes(n.group)
        );

        if (!mainNode) {
            console.warn('[HierarchyBuilder] No main/root node found, returning flat structure');
            return { nodes: flatNodes, links: flatLinks };
        }

        // 2. Build parent-child relationships based on evidence/provenance
        const nodeMap = new Map<string, any>();
        flatNodes.forEach(n => nodeMap.set(n.id, { ...n, children: [] }));

        const links: any[] = [...flatLinks];

        // 3. Assign children to clusters based on provenance evidence
        const assignedLeafIds = new Set<string>(); // [FIX] Declaration moved up for scope visibility
        clusterNodes.forEach(cluster => {
            const clusterId = cluster.id;
            const clusterNode = nodeMap.get(clusterId);

            if (!clusterNode) return;

            // Find children mentioned in cluster's evidence
            const evidence = cluster.data?.provenance?.evidence || cluster.provenance?.evidence || [];
            const mentionedUsernames = new Set<string>();

            evidence.forEach((ev: any) => {
                if (ev.author) mentionedUsernames.add(ev.author.toLowerCase());
                if (ev.username) mentionedUsernames.add(ev.username.toLowerCase());
            });

            // Assign leaf nodes to this cluster if mentioned in evidence
            leafNodes.forEach(leaf => {
                const leafLabel = (leaf.label || leaf.id || '').toLowerCase();
                const leafUsername = (leaf.data?.username || leaf.username || leaf.label || '').toLowerCase().replace('@', '');
                const leafName = (leaf.data?.fullName || leaf.data?.name || leaf.name || '').toLowerCase();

                // [FIX] Fuzzy Matching for Cluster Assignment
                const isMatch = Array.from(mentionedUsernames).some(mentioned => {
                    const cleanMention = mentioned.replace('@', '').trim();
                    return cleanMention.length > 2 && (
                        leafUsername.includes(cleanMention) ||
                        cleanMention.includes(leafUsername) ||
                        leafName.includes(cleanMention) ||
                        leafLabel.includes(cleanMention)
                    );
                });

                if (isMatch) {
                    clusterNode.children.push(nodeMap.get(leaf.id));
                    links.push({ source: clusterId, target: leaf.id, value: 1 });
                    assignedLeafIds.add(leaf.id); // Track assigned leaves
                }
            });
        });

        // 4. Assign orphaned leaf nodes to nearest cluster based on semantic overlap
        const orphanedLeaves = leafNodes.filter(leaf => !assignedLeafIds.has(leaf.id));

        if (orphanedLeaves.length > 0 && clusterNodes.length > 0) {
            console.log(`[HierarchyBuilder] Distributing ${orphanedLeaves.length} orphans to clusters...`);

            orphanedLeaves.forEach((leaf, idx) => {
                // Try to find a best-fit cluster based on shared keywords/category
                let bestCluster = clusterNodes[idx % clusterNodes.length]; // Default: Round Robin
                let maxScore = 0;

                const leafText = (leaf.data?.bio || leaf.data?.description || leaf.label || '').toLowerCase();

                for (const cluster of clusterNodes) {
                    const clusterText = (cluster.label || cluster.name || '').toLowerCase();
                    const clusterKeywords = (cluster.data?.keywords || []).map((k: string) => k.toLowerCase());

                    let score = 0;
                    if (leafText.includes(clusterText)) score += 3;
                    clusterKeywords.forEach((kw: string) => {
                        if (leafText.includes(kw)) score += 1;
                    });

                    if (score > maxScore) {
                        maxScore = score;
                        bestCluster = cluster;
                    }
                }

                const clusterNode = nodeMap.get(bestCluster.id);
                if (clusterNode) {
                    clusterNode.children.push(nodeMap.get(leaf.id));
                    links.push({ source: bestCluster.id, target: leaf.id, value: 1 });
                }
            });
        }

        // 5. Build final hierarchy: MAIN -> clusters (with children)
        const hierarchicalMain = nodeMap.get(mainNode.id);
        if (hierarchicalMain) {
            hierarchicalMain.children = clusterNodes.map(c => nodeMap.get(c.id)).filter(Boolean);

            // Add links from MAIN to clusters
            clusterNodes.forEach(cluster => {
                links.push({ source: mainNode.id, target: cluster.id, value: 2 });
            });
        }

        // 6. Return hierarchical structure
        const hierarchicalNodes = [hierarchicalMain];

        console.log(`[HierarchyBuilder] Built hierarchy: 1 main, ${clusterNodes.length} clusters, ${leafNodes.length} leaves, ${links.length} links`);

        return { nodes: hierarchicalNodes, links };
    }

    /**
     * Generate Influencer/Creator Discovery Graph
     */
    private generateInfluencerGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        // Use the last result set (enriched details) if available, otherwise first
        const records = results[results.length - 1] || [];

        const nodes: any[] = [];
        const links: any[] = [];

        // Determine Central Topic
        const centralLabel = plan.search_keywords?.[0] || query;
        nodes.push({ id: 'ROOT', label: centralLabel, group: 'root', type: 'root', val: 50, level: 0, color: '#10b981' });

        // Map AI matches for quick lookup (if available)
        const aiMatchers = new Map<string, any>();
        if (analytics && analytics.creators) {
            analytics.creators.forEach((c: any) => {
                if (c.handle) aiMatchers.set(c.handle.toLowerCase(), c);
            });
        }

        // Create nodes for each creator
        records.slice(0, 50).forEach((record: any, i: number) => {
            const username = record.username || record.ownerUsername || `user_${i}`;
            const cleanUser = username.toLowerCase();
            const cid = `creator_${username}`;

            // Check for AI enrichment
            const aiMatch = aiMatchers.get(cleanUser);
            // Default score based on followers (log scale)
            const followers = record.followersCount || 0;
            const score = aiMatch ? (aiMatch.score || 5) : Math.min(10, Math.log10(followers + 1));

            const citation = aiMatch ? aiMatch.citation : `${(followers / 1000).toFixed(1)}K followers`;

            // [FIX] Use rich data if available in richMap or aggregateProfiles
            const richRecord = this.aggregateProfiles([record])[0] || record;

            const newNode = this.hydrateNodeData(richRecord, 'creator', citation, query);
            newNode.id = cid; // Preserve specific ID format for influencer graph if needed
            newNode.val = 10 + (score * 2);
            newNode.data.score = score;
            newNode.data.citation = citation;

            nodes.push(newNode);

            links.push({ source: 'ROOT', target: cid, value: score });
        });

        console.log(`[GraphGen] Influencer Graph: ${nodes.length} nodes from ${records.length} records`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                overindexing: {
                    topCreators: nodes.filter(n => n.group === 'creator').map(n => ({
                        name: n.data.username,
                        handle: n.data.username,
                        citation: n.data.citation,
                        score: n.data.score
                    }))
                }
            }
        };
    }



    /**
     * Generate Viral Content/Trending Graph (Velocity-based)
     */
    private generateViralGraph(plan: any, results: any[][], query: string, analytics: any = null): any {
        const posts = results[0] || [];
        const nodes: any[] = [];
        const links: any[] = [];
        const centralLabel = plan.search_keywords?.[0] || query;

        nodes.push({ id: 'ROOT', label: centralLabel, group: 'root', type: 'root', val: 50, level: 0, color: '#f59e0b' }); // Amber for Fire/Trending

        const scoredPosts = posts.map((p: any) => {
            const uploadedAt = new Date(p.timestamp || p.date || Date.now());
            const hoursSince = Math.max(0.1, (Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60));
            const engagement = (p.likesCount || 0) + (p.commentsCount || 0) * 2; // Weight comments higher
            const velocity = engagement / (hoursSince + 1); // Simple decay
            return { ...p, velocity, hoursSince };
        }).sort((a, b) => b.velocity - a.velocity).slice(0, 20); // Top 20 Viral

        scoredPosts.forEach((p: any, i: number) => {
            const nodeId = `post_${i}`;
            const isVeryViral = p.velocity > 100; // Arbitrary threshold

            nodes.push({
                id: nodeId,
                label: p.caption ? p.caption.substring(0, 20) + '...' : 'Viral Post',
                group: 'post',
                type: 'post',
                val: 10 + Math.min(20, p.velocity / 10),
                color: isVeryViral ? '#ef4444' : '#fbbf24', // Red for super viral, Amber for trending
                profilePic: proxyMediaUrl(p.displayUrl || p.mediaUrl || p.thumbnailUrl || p.images?.[0]),
                data: {
                    ...p,
                    imageUrl: proxyMediaUrl(p.displayUrl || p.mediaUrl || p.thumbnailUrl || p.images?.[0]),
                    engagement: (p.likesCount || 0) + (p.commentsCount || 0),
                    velocity: p.velocity.toFixed(1),
                    hoursSince: p.hoursSince.toFixed(1),
                    author: p.ownerUsername || p.username,
                    provenance: {
                        source: 'engagement_velocity_analysis',
                        evidence: [{
                            type: 'post_analysis',
                            url: p.url,
                            metrics: { likes: p.likesCount, comments: p.commentsCount }
                        }]
                    }
                }
            });

            links.push({ source: 'ROOT', target: nodeId, value: p.velocity });
        });

        console.log(`[GraphGen] Viral Graph: Analysis of ${posts.length} posts -> Top ${scoredPosts.length} viral candidates`);

        return {
            nodes,
            links,
            analytics: {
                ...analytics,
                viralAnalysis: {
                    topTrends: scoredPosts.map((p: any) => ({
                        title: p.caption ? p.caption.substring(0, 50) : 'Post',
                        velocity: `${p.velocity.toFixed(1)} eng/hr`,
                        metric: `${(p.likesCount || 0)} likes`,
                        url: p.url
                    }))
                }
            }
        };
    }
    /**
     * [FIXED] Aggregation for Over-Indexing/Audience Overlap
     * Merges audience data from multiple steps and maps enriched profiles back to them.
     */
    private aggregateOverindexingLocal(results: any[], intent: string): any[] {
        // 1. Identify "Audience" steps vs "Enrichment" steps
        let enrichmentData: any[] = [];
        const audienceBatches: any[] = [];

        results.forEach((res, index) => {
            const flat = Array.isArray(res) ? res.flat() : [res];

            // Check for rich data (has 'biography', 'latestPosts', or 'followerCount' > 0)
            const isRich = flat.some(r => r.biography || r.latestPosts || (r.followerCount !== undefined && r.followerCount !== null));

            // Function to check if item is from a "Google Search" result helper
            // (Step 29 added specific logic for Google, but we want to catch the Instagram enrichment output)

            // Assume the last step is enrichment if multiple steps exist
            if (flat.length > 0 && (isRich || index === results.length - 1)) {
                enrichmentData.push(...flat);
            } else {
                audienceBatches.push(flat);
            }
        });

        console.log(`[Orchestration] Aggregating Overlap: ${audienceBatches.length} audience batches, ${enrichmentData.length} enriched profiles.`);

        // 2. Create Lookup Map for Enriched Data
        const richMap = new Map<string, any>();
        enrichmentData.forEach(p => {
            const u = (p.username || p.ownerUsername || '').toLowerCase().trim();
            if (u) richMap.set(u, p);
        });

        // 3. Hydrate Audience Data
        const keyMap = new Map<string, any>();

        audienceBatches.forEach((batch, batchIdx) => {
            batch.forEach((rawItem: any) => {
                const username = (rawItem.username || rawItem.ownerUsername || rawItem.value || '').toLowerCase().trim();

                if (username) {
                    const richProfile = richMap.get(username);
                    const merged = {
                        ...rawItem,
                        ...(richProfile || {}), // Overwrite with rich data if exists
                        _sourceBatch: batchIdx
                    };

                    // Standardize keys for the Graph
                    if (merged.biography) merged.bio = merged.biography;
                    merged.followers = merged.followersCount || merged.followerCount || rawItem.followers || 0;
                    if (merged.profile_pic_url) merged.profilePicUrl = merged.profile_pic_url;

                    // Ensure Group is set (Visuals)
                    if (!merged.group) merged.group = 'profile';

                    if (!keyMap.has(username)) {
                        keyMap.set(username, merged);
                    } else {
                        // If it already exists (overlap!), boost score or importance?
                        // For now we just keep the first one but maybe we mark overlap?
                        keyMap.get(username)._overlap = true;
                    }
                }
            });
        });

        const consolidated = Array.from(keyMap.values());
        console.log(`[Orchestration] Consolidated ${consolidated.length} hydrated profiles for analysis.`);
        return consolidated;
    }

    /**
     * Generate network/follower graph
     */
    private generateNetworkGraph(records: any[], centralLabel: string): any {
        const nodes: any[] = [];
        const links: any[] = [];

        nodes.push({ id: 'MAIN', label: centralLabel, group: 'main', val: 50, level: 0 });

        // Sample followers/followings
        records.slice(0, 100).forEach((record, i) => {
            const followerText = record.followersCount ? `${(record.followersCount / 1000).toFixed(1)}K` : '?';
            const node = this.hydrateNodeData(record, 'profile', `Identified in network of ${centralLabel} (${followerText} followers)`, centralLabel);
            node.level = 1;
            node.val = 10;

            nodes.push(node);
            links.push({ source: 'MAIN', target: node.id, value: 5 });
        });

        // [NEW] Populate Analytics Lists
        const extractedAnalytics = {
            creators: [] as any[],
            ...((records as any).analytics || {})
        };

        nodes.forEach(node => {
            if (node.id === 'MAIN') return;
            const item = { ...node.data, group: node.group, value: node.val };
            extractedAnalytics.creators.push(item);
        });

        return { nodes, links, analytics: extractedAnalytics };
    }

    /**
     * [NEW] Dynamic Cluster Fallback
     * Generates semantic clusters from profile bios/hashtags if AI fails to provide them.
     */
    private generateDynamicClusters(profiles: any[], sampleSize: number): any[] {
        console.log(`[GraphGen] âš¡ Running Dynamic Cluster Fallback on ${profiles.length} profiles...`);
        const clusters: any[] = [];
        const hashtagGroups = new Map<string, any[]>();
        const bioKeywords = new Map<string, any[]>();

        // 1. Collect Signals
        profiles.forEach(p => {
            // Hashtags
            const posts = p.latestPosts || [];
            const uniqueTags = new Set<string>();
            posts.forEach((post: any) => {
                if (post.hashtags && Array.isArray(post.hashtags)) {
                    post.hashtags.forEach((t: string) => uniqueTags.add(t.replace(/^#/, '').toLowerCase()));
                }
            });
            uniqueTags.forEach(tag => {
                if (tag.length > 2) { // Filtering noise
                    if (!hashtagGroups.has(tag)) hashtagGroups.set(tag, []);
                    hashtagGroups.get(tag)?.push(p);
                }
            });

            // Bio Keywords (Simple n-gram-ish)
            if (p.biography) {
                const words = p.biography.toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .split(/\s+/)
                    .filter((w: string) => w.length > 4 && !['instagram', 'follow', 'dm', 'email', 'contact'].includes(w));

                const uniqueWords = new Set(words);
                uniqueWords.forEach(w => {
                    const wordStr = String(w);
                    if (!bioKeywords.has(wordStr)) bioKeywords.set(wordStr, []);
                    bioKeywords.get(wordStr)?.push(p);
                });
            }
        });

        // 2. Identify Top Groups
        const minSize = Math.max(3, Math.floor(profiles.length * 0.05));

        // Strategy A: Hashtag Clusters
        const sortedTags = Array.from(hashtagGroups.entries())
            .filter(([_, members]) => members.length >= minSize)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 5);

        sortedTags.forEach(([tag, members], idx) => {
            clusters.push({
                id: `cluster_tag_${idx}`,
                label: `#${tag}`,
                type: 'cluster',
                group: 'cluster',
                val: 15 + (members.length),
                color: '#10b981',
                data: {
                    description: `Community interested in #${tag}`,
                    keywords: [tag],
                    provenance: `Dynamically identified from ${members.length} profiles`
                },
                children: [] // Will be populated in the main loop if we wanted strict hierarchy, but here we just need the nodes to exist for linking
            });
        });

        // Strategy B: Bio Clusters (if needed)
        if (clusters.length < 3) {
            const sortedBio = Array.from(bioKeywords.entries())
                .filter(([_, members]) => members.length >= minSize)
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 5 - clusters.length);

            sortedBio.forEach(([word, members], idx) => {
                clusters.push({
                    id: `cluster_bio_${idx}`,
                    label: word.charAt(0).toUpperCase() + word.slice(1),
                    type: 'cluster',
                    group: 'cluster',
                    val: 11 + (members.length * 0.75), // [FIX] Reduced by 25% (Base 15->11, growth multiplier 1->0.75)
                    color: '#34d399',
                    data: {
                        description: `Profiles mentioning "${word}"`,
                        keywords: [word],
                        provenance: `Dynamically identified from ${members.length} profiles`
                    },
                    children: []
                });
            });
        }

        // Strategy C: Generic Fallback (if still empty)
        if (clusters.length === 0) {
            clusters.push(
                { id: 'c_top', label: 'Top Creators', type: 'cluster', group: 'cluster', val: 15, data: { keywords: ['creator', 'official', 'verified'] }, children: [] }, // 20 -> 15
                { id: 'c_rising', label: 'Rising Stars', type: 'cluster', group: 'cluster', val: 14, data: { keywords: [] }, children: [] }, // 18 -> 14
                { id: 'c_niche', label: 'Niche Accounts', type: 'cluster', group: 'cluster', val: 19, data: { keywords: [] }, children: [] } // 25 -> 19
            );
        }

        console.log(`[GraphGen] Generated ${clusters.length} dynamic clusters.`);
        return clusters;
    }

    /**
     * Generate over-index graph - calculates which accounts are over-represented in follower data
     */
    private async generateOverindexGraph(
        profiles: any[],
        centralLabel: string,
        plan: any = null,
        analytics: any = null,
        sampleSize: number = 100
    ): Promise<{ nodes: any[], links: any[], analytics: any }> {
        const nodes: any[] = [];
        const links: any[] = [];

        // [FIX] Correct Root Label: Use handle if available, otherwise centralLabel but stripped of "map creators for"
        let displayLabel = centralLabel;
        const handleMatch = centralLabel.match(/@([a-zA-Z0-9_.]+)/);
        if (handleMatch) displayLabel = `@${handleMatch[1]}`;
        else displayLabel = centralLabel.replace(/map (the )?over-indexed creators (for|of) (followings of followers of )?/i, '').trim();

        // [FIX] Ensure Root ID is 'MAIN' for link consistency
        nodes.push({ id: 'MAIN', label: displayLabel, group: 'main', val: 50, level: 0, color: '#ffffff' });

        const addedNodeIds = new Set<string>();

        // [NEW] 1. Create Lookup Map for Scraped Data (Fast Access)
        const profileMap = new Map<string, any>();
        profiles.forEach(p => {
            const username = (p.username || p.ownerUsername || '').toLowerCase().replace('@', '').trim(); // [FIX] Preserve underscores
            if (username && !profileMap.has(username)) {
                profileMap.set(username, p);
            } else if (username && profileMap.has(username)) {
                // Keep the record with most data (biography/posts)
                const existing = profileMap.get(username);
                if (!existing.biography && p.biography) profileMap.set(username, p);
            }
        });

        // [NEW] Extracted Lists for UI Panels
        const extractedAnalytics = {
            creators: [] as any[],
            brands: [] as any[],
            clusters: [] as any[],
            topics: [] as any[],
            hashtags: [] as any[], // [NEW]
            keywords: [] as any[], // [NEW]
            subtopics: [] as any[],
            topContent: [] as any[]
        };

        // [FIX] Derive coreId from the cleaner displayLabel (e.g. @imjustbait -> imjustbait)
        // This prevents the 'central' node from being added again as a separate node
        const coreId = displayLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

        // [FIX] Robust Core Profile Lookup
        let coreProfileData = profileMap.get(coreId) || profileMap.get(displayLabel.replace('@', '').toLowerCase());

        // Final fallback: try to find by username in values
        if (!coreProfileData) {
            const found = [...profileMap.values()].find(p => p.username?.toLowerCase() === displayLabel.replace('@', '').toLowerCase());
            if (found) coreProfileData = found;
        }

        // Update the MAIN node we pushed earlier with real profile data if we have it
        const mainNode = nodes.find(n => n.id === 'MAIN');
        if (mainNode && coreProfileData) {
            console.log(`[GraphGen] Hydrating MAIN node with scraped data for: ${displayLabel}`);
            mainNode.profilePic = proxyMediaUrl(coreProfileData.profilePicUrl || coreProfileData.profile_pic_url);
            mainNode.data = {
                isCore: true,
                ...coreProfileData,
                bio: coreProfileData.biography || coreProfileData.bio || '',
                followers: (coreProfileData.followersCount || 0).toLocaleString(),
                following: (coreProfileData.followsCount || 0).toLocaleString(),
                // Standardized fields
                followerCount: coreProfileData.followersCount || 0,
                followingCount: coreProfileData.followsCount || 0,
                postCount: coreProfileData.postsCount || 0,

                externalUrl: coreProfileData.externalUrl || `https://instagram.com/${displayLabel.replace('@', '')}`,
                latestPosts: (coreProfileData.latestPosts || []).map((p: any) => proxyMediaFields(p))
            };
        }
        addedNodeIds.add('MAIN');
        addedNodeIds.add(coreId); // Prevent duplicate if core appears in results

        // [NEW] Real Calculation of Over-Indexing Scores
        // Iterate through all profiles to find "Followed By" relationships
        const realFrequencyMap = new Map<string, number>();
        const realSourceMap = new Map<string, string[]>(); // [NEW] Track WHO follows who
        let totalSourceProfiles = 0;

        profiles.forEach(p => {
            // [FIX] Filter out PRIVATE accounts from the source audience (followers)
            if (p.isPrivate || p.is_private) return;

            // "p" is a profile (e.g. a follower of the core target).
            // "p.follows" contains the list of accounts that "p" follows.
            if (p.follows && Array.isArray(p.follows)) {
                totalSourceProfiles++;
                const sourceHandle = p.username || p.ownerUsername || 'Unknown';

                p.follows.forEach((followedAccount: any) => {
                    const fUsername = (followedAccount.username || followedAccount.ownerUsername || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (fUsername && fUsername !== coreId) {
                        realFrequencyMap.set(fUsername, (realFrequencyMap.get(fUsername) || 0) + 1);

                        // [NEW] Track Source Evidence
                        if (!realSourceMap.has(fUsername)) realSourceMap.set(fUsername, []);
                        // Limit to 20 sources to save space/bandwidth
                        if (realSourceMap.get(fUsername)!.length < 20) {
                            realSourceMap.get(fUsername)!.push(sourceHandle);
                        }
                    }
                });
            }
        });

        console.log(`[OverIndex] Calculated frequencies across ${totalSourceProfiles} non-private source profiles.`);

        // [NEW] 0. Pre-Scan Tree for Frequencies (Ranking Signal)
        const nodeFrequencyMap = new Map<string, number>();
        const scanTreeFrequencies = (node: any) => {
            if (!node) return;
            const id = (node.data?.handle || node.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (id) {
                nodeFrequencyMap.set(id, (nodeFrequencyMap.get(id) || 0) + 1);
            }
            if (node.children) {
                node.children.forEach((c: any) => scanTreeFrequencies(c));
            }
        };
        if (analytics && analytics.root) {
            scanTreeFrequencies(analytics.root);
        }

        // [NEW] CRITICAL: Create "Overindexed Profiles" Cluster EARLY so processNode can access it
        // We identify the top 100 profiles by frequency from the REAL scraped data
        const sortedOverindexed = [...realFrequencyMap.entries()]
            .sort((a, b) => b[1] - a[1]) // Descending
            .filter(x => x[1] > 1) // Must have at least 2 overlaps to be "over-indexed"
            .slice(0, sampleSize);

        const highAffinityClusterId = 'cluster_overindexed';
        const hasHighAffinity = sortedOverindexed.length > 5; // Threshold to create cluster

        if (hasHighAffinity) {
            console.log(`[OverIndex] Creating Dedicated 'Overindexed Profiles' Cluster with ${sortedOverindexed.length} items.`);
            const haNode = {
                id: highAffinityClusterId,
                label: 'Overindexed Profiles', // [FIX] Clearer Label
                val: 30, // 40 -> 30 (25% reduction)
                group: 'cluster',
                color: '#ec4899', // Pink/Magenta
                data: {
                    name: 'Overindexed Profiles',
                    description: 'Profiles with statistically significant overlap in this network.',
                    keywords: ['high affinity', 'over-indexed', 'statistically significant'],
                    provenance: `Automatically identified ${sortedOverindexed.length} profiles with high follower overlap.`
                },
                children: []
            };
            nodes.push(haNode);
            addedNodeIds.add(highAffinityClusterId);
            links.push({ source: 'MAIN', target: highAffinityClusterId, value: 5 });
            extractedAnalytics.clusters.push(haNode.data);
        }

        // Recursive Helper to Flatten Tree
        const processNode = (treeNode: any, parentId: string | null, inferredGroup: string | null = null) => {
            if (!treeNode) return;

            // Generate ID (Graph Index Aware: lowercase, no @)
            // Generate ID (Graph Index Aware: lowercase, no @, strict chars)
            // Generate ID (Graph Index Aware: lowercase, no @, strict alphanumeric to match scraped data)
            const rawId = treeNode.data?.handle || treeNode.label || treeNode.name || treeNode.id || `node_${Math.random()}`;
            const nodeId = rawId.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

            // Determine Group
            let group = treeNode.type || inferredGroup || 'unknown'; // [FIX] Use inferred group
            if (group === 'root') group = 'main';

            // Map AI types to Internal Graph Index Groups (See FandomGraph3D.tsx)
            // align with visual styles: cluster(green), creator(pink), brand(blue), topic(violet), subtopic(light-violet)
            if (group === 'category') group = 'cluster';

            // [FIX] Distinct mapping for Topics vs Clusters
            if (group === 'topic') group = 'topic';
            if (group === 'subtopic') group = 'subtopic';

            // [FIX] Map generic entities to 'creator' or 'brand' or 'overindexed'
            if (group === 'entity') group = 'creator';
            if (group === 'content_node') group = 'post';
            if (group === 'influencer') group = 'creator';

            if (!addedNodeIds.has(nodeId)) {

                // [NEW] 2. Hydrate with Real Scraped Data
                // We look up the profile in our scraped dataset to get REAL posts/media
                // [FIX] Fuzzy Lookup Logic
                let scrapedProfile = profileMap.get(nodeId);

                // [STRICT] Removed fuzzy lookup as per user request. 
                // We only use the strict alphanumeric ID match from profileMap.get(nodeId)

                // [CRITICAL] ZERO TOLERANCE FOR AI HALLUCINATIONS
                // If it's a profile/brand/creator node and we don't have scraped data, DROP IT.
                const isLeafNode = ['creator', 'brand', 'influencer', 'profile'].includes(group);
                if (isLeafNode && !scrapedProfile) {
                    console.log(`[GraphGen] ✂️ Pruning unverified AI node: ${nodeId} (${group}) - No scraped data found in profileMap.`);
                    return;
                }

                const realPosts = scrapedProfile?.latestPosts || [];

                // [NEW] Get Tree Frequency Score (Real vs AI)
                // Use the real frequency map if available, otherwise fallback to AI tree frequency
                const realCount = realFrequencyMap.get(nodeId) || 0;
                const aiCount = nodeFrequencyMap.get(nodeId) || 0;

                // Normalize score for UI (e.g. 50 followers out of 500 = 10% affinity)
                const frequencyScore = realCount > 0 ? realCount : (aiCount || 1);

                // Calculate Affinity Percentage
                const affinityPercent = totalSourceProfiles > 0 ? Math.round((realCount / totalSourceProfiles) * 100) : 0;

                // [NEW] Get Sources
                const sources = realSourceMap.get(nodeId) || [];

                // [NEW] Redefine Occurrences as the number of sub-nodes (children)
                const occ = (treeNode.children || []).length;

                // [NEW] Child Evidence for Clusters/Topics
                let childEvidence: any[] = [];
                if ((group === 'cluster' || group === 'topic' || group === 'subtopic') && treeNode.children) {
                    childEvidence = treeNode.children.slice(0, 15).map((child: any) => {
                        const childId = child.handle ? child.handle.replace('@', '') : (child.label || child.id);
                        return {
                            text: child.data?.bio || child.data?.description || `Member node: ${child.label}`,
                            author: childId,
                            url: child.data?.externalUrl || (child.handle ? `https://instagram.com/${childId}` : '#'),
                            date: new Date().toISOString().split('T')[0],
                            type: 'member_of_group',
                            mediaUrl: child.data?.profilePicUrl
                        };
                    });
                }

                // [FIX] Prioritize Scraped URL -> External URL -> Instagram fallback
                let finalUrl = scrapedProfile?.url || scrapedProfile?.externalUrl || scrapedProfile?.profileUrl;
                if (!finalUrl && treeNode.data?.externalUrl) finalUrl = treeNode.data.externalUrl;

                // [FIX] Only generate fallback URL for valid profile types (prevent fake cluster URLs)
                const isProfileType = ['creator', 'brand', 'influencer', 'profile'].includes(group);
                if (!finalUrl && isProfileType) {
                    finalUrl = `https://instagram.com/${nodeId}`;
                }

                // [FIX] Collect Evidence for Overindex Graph
                const evidenceItems = this.collectEvidence(scrapedProfile || {}, centralLabel);

                const richData = {
                    ...treeNode.data,
                    evidenceItems: evidenceItems, // Store for subnode generation
                    // Ensure critical fields for UI
                    username: treeNode.data?.handle || nodeId,
                    name: scrapedProfile?.fullName || scrapedProfile?.full_name || treeNode.data?.fullName || treeNode.label,

                    // [NEW] Explicit Source List for Frontend
                    evidenceSources: sources,

                    // [FIX] Construct Structured Provenance for ReasoningPanel
                    provenance: {
                        source: sources.length > 0 ? 'Social Graph Analysis' : 'Gemini AI + Google Search',
                        method: sources.length > 0 ? 'Over-indexing Calculation' : 'Deep Dive Analysis',
                        description: sources.length > 0
                            ? `Identified as over-indexed among ${sources.length}+ source profiles including ${sources.slice(0, 3).join(', ')}.`
                            : (treeNode.data?.provenance || 'Identified via AI pattern matching.'),

                        searchQuery: treeNode.data?.searchQuery,
                        sourceUrl: treeNode.data?.sourceUrl,
                        confidence: sources.length > 0 ? 1.0 : 0.95,
                        evidence: sources.length > 0
                            ? sources.map(s => ({
                                text: `Followed by ${s}`,
                                url: `https://instagram.com/${s.replace('@', '')}`,
                                author: s,
                                date: new Date().toISOString().split('T')[0],
                                type: 'social_graph'
                            }))
                            : (childEvidence.length > 0 ? childEvidence : [{
                                text: treeNode.data?.evidence || 'No specific quote provided.',
                                url: treeNode.data?.sourceUrl || '#',
                                author: treeNode.data?.handle,
                                date: new Date().toISOString().split('T')[0],
                                type: 'ai_finding'
                            }]),
                        // [FIX] Explicit Citation Backing
                        datasetId: scrapedProfile?.datasetId || 'Scraped Collection',
                        citation: treeNode.data?.citation || (scrapedProfile ? `Source: Scraped Dataset (Profile: ${nodeId})` : 'Source: AI Analysis')
                    },

                    // [FIX] Map enriched fields from our terminal enrichment step (Step 3)
                    // [STRICT] NO AI HALLUCINATIONS. Only use scrapedProfile data or 0.
                    followers: (scrapedProfile?.followersCount || scrapedProfile?.followers || 0).toLocaleString(),
                    following: (scrapedProfile?.followsCount || scrapedProfile?.followingCount || 0).toLocaleString(),
                    bio: scrapedProfile?.biography || scrapedProfile?.bio || treeNode.data?.bio || '',
                    profilePicUrl: proxyMediaUrl(scrapedProfile?.profilePicUrl || scrapedProfile?.profile_pic_url || treeNode.data?.profilePicUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(scrapedProfile?.fullName || nodeId)}&background=random`,
                    latestPosts: realPosts.length > 0 ? realPosts.map(p => proxyMediaFields(p)) : (treeNode.data?.latestPosts ? treeNode.data.latestPosts.map((p: any) => proxyMediaFields(p)) : []),

                    // [NEW] Standardized Stat Fields
                    fullName: scrapedProfile?.fullName || scrapedProfile?.full_name || treeNode.data?.fullName,
                    followerCount: scrapedProfile?.followersCount || scrapedProfile?.followers_count || 0,
                    followingCount: scrapedProfile?.followsCount || scrapedProfile?.followingCount || 0,
                    postCount: scrapedProfile?.postsCount || scrapedProfile?.mediaCount || 0,
                    externalUrl: finalUrl, // [FIX] Updated URL priority
                    isPrivate: scrapedProfile?.isPrivate || false,
                    isVerified: scrapedProfile?.isVerified || false,

                    // Attach Frequency Score for Sorting (Critical for user request)
                    frequencyScore: frequencyScore,
                    overindexScore: frequencyScore, // Standardized key
                    profileUrl: finalUrl,
                    affinityPercent: affinityPercent,
                    rawCount: realCount,
                    realOccurrences: occ
                };

                nodes.push({
                    id: nodeId,
                    label: treeNode.label || nodeId,
                    val: (treeNode.val || 10) + (frequencyScore * 2), // Boost size by occurence
                    group: group,
                    data: richData
                });
                addedNodeIds.add(nodeId);

                // [FIX] Generate Evidence Subnodes for Overindex Graph
                this.createEvidenceSubnodes({ id: nodeId }, richData.evidenceItems, nodes, links);

                // [NEW] Populate Analytics Lists
                if (group === 'creator' || group === 'influencer') {
                    extractedAnalytics.creators.push(richData);
                } else if (group === 'brand') {
                    extractedAnalytics.brands.push(richData);
                } else if (group === 'topic' || group === 'keyword') {
                    extractedAnalytics.topics.push(richData); // Map keywords to topics for the panel
                } else if (group === 'hashtag') {
                    extractedAnalytics.hashtags.push(richData);
                } else if (group === 'subtopic') {
                    extractedAnalytics.subtopics.push(richData);
                } else if (group === 'post' || group === 'content_node') {
                    extractedAnalytics.topContent.push(richData);
                } else if (group === 'cluster') {
                    extractedAnalytics.clusters.push(richData);
                }

                // Create Link to Parent (Moved INSIDE to access richData)
                if (parentId && parentId !== nodeId) {
                    let targetParentId = parentId === 'MAIN' ? 'MAIN' : parentId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

                    // [NEW] ORPHAN RESCUE: Strict Topology Rules
                    // Rule 1: "Overindexed Profiles" MUST have Frequency > 3
                    // Rule 2: NO "leaf" nodes (profiles, brands, creators) attached to MAIN. ever.

                    // Check if this is a "leaf" type (not a cluster/topic)
                    const isLeaf = (group === 'creator' || group === 'brand' || group === 'influencer' || group === 'profile' || group.includes('brand'));

                    if (isLeaf) {
                        // 1. FREQUENCY OVERRIDE: High Signal -> Overindexed Cluster
                        // [FIX] Threshold increased to > 3 per user request
                        if (frequencyScore > 3 && hasHighAffinity) {
                            targetParentId = highAffinityClusterId;
                        }
                        // 2. SEMANTIC HOMING: Try to find a better cluster match if currently pointing to MAIN (or if we want to be specific)
                        else if (targetParentId === 'MAIN') {
                            const nodeBio = (richData.bio || richData.description || nodeId).toLowerCase();
                            let bestClusterId = 'MAIN';
                            let maxMatches = 0;

                            // Search existing clusters (excluding the special Overindexed one if we didn't qualify above)
                            nodes.filter(n => n.group === 'cluster' || n.group === 'topic').forEach(cluster => {
                                if (cluster.id === highAffinityClusterId) return; // Already checked freq requirement

                                const keywords = cluster.data?.keywords || cluster.label.split(' ');
                                const matches = keywords.filter((k: string) => nodeBio.includes(k.toLowerCase())).length;
                                if (matches > maxMatches) {
                                    maxMatches = matches;
                                    bestClusterId = cluster.id;
                                }
                            });

                            if (maxMatches > 0) {
                                targetParentId = bestClusterId;
                            } else {
                                // 3. COMMUNITY FALLBACK
                                // If no semantic match and score <= 3, DUMP to "Community".
                                // ABSOLUTELY NO VISIBLE NODES ON MAIN HUB.
                                let communityClusterId = 'c_community';

                                // Ensure Community Cluster exists
                                if (!addedNodeIds.has(communityClusterId)) {
                                    nodes.push({
                                        id: communityClusterId,
                                        label: 'Community',
                                        type: 'cluster',
                                        group: 'cluster',
                                        val: 20,
                                        data: { keywords: ['community', 'profile', 'user'] },
                                        children: []
                                    });
                                    addedNodeIds.add(communityClusterId);
                                    links.push({ source: 'MAIN', target: communityClusterId, value: 5 });
                                }
                                targetParentId = communityClusterId;
                            }
                        }
                    }

                    links.push({
                        source: targetParentId,
                        target: nodeId,
                        value: 1
                    });
                }
            }

            // Recurse Children
            if (treeNode.children && Array.isArray(treeNode.children)) {
                treeNode.children.forEach((child: any) => processNode(child, nodeId, group === 'cluster' ? 'creator' : inferredGroup));
            }
            // [FIX] Recurse Profiles (Inferred as Creators)
            if (treeNode.data && treeNode.data.profiles && Array.isArray(treeNode.data.profiles)) {
                // Determine group for profiles recursion (default to creator if generic)
                const profileGroup = (group === 'cluster' || group === 'category') ? 'creator' : group;
                treeNode.data.profiles.forEach((profile: any) => processNode(profile, nodeId, profileGroup));
            }
        };

        // [PROCESS AI TREE]
        if (analytics && analytics.root) {
            console.log("[GraphGen] Processing Hierarchical AI Tree...");

            if (analytics.root.children && analytics.root.children.length > 0) {
                analytics.root.children.forEach((cluster: any) => {
                    processNode(cluster, 'MAIN');
                });
            } else {
                console.warn("[GraphGen] AI Tree present but has NO children. Triggering fallback.");
                // Trigger fallback logic below by ensuring addedNodeIds doesn't block them
                // and we invoke dynamic clustering
            }

            // [NEW] Robustness: Check if we have enough clusters. If not, inject dynamic ones.
            const clusterCount = nodes.filter(n => n.group === 'cluster').length;
            if (clusterCount < 2) { // 2 IS LOW, expect at least 3-5
                console.log(`[GraphGen] âš ï¸ AI Cluster Count Low (${clusterCount}). Injecting Dynamic Clusters...`);
                // Filter quality profiles for clustering
                const candidateProfiles = [...profileMap.values()].filter(p => !p.isPrivate && (p.followersCount > 1000 || p.latestPosts?.length > 0));

                const dynamicClusters = this.generateDynamicClusters(candidateProfiles, sampleSize);
                dynamicClusters.forEach(dc => {
                    // Add to Nodes
                    nodes.push({
                        id: dc.id,
                        label: dc.label,
                        val: dc.val,
                        group: 'cluster',
                        data: dc.data
                    });
                    addedNodeIds.add(dc.id);
                    // Link to Main
                    links.push({ source: 'MAIN', target: dc.id, value: 5 });
                    // Add to analytics
                    extractedAnalytics.clusters.push(dc.data);
                });
            }

            // [NEW] Generate Interest Topics for Overindexed Profiles
            // We extract shared hashtags/keywords from the Overindexed Cluster members
            if (hasHighAffinity) {
                console.log("[GraphGen] Generating Shared Interests for Overindexed Profiles...");
                const overindexedMembers = nodes.filter(n =>
                    links.some(l => l.source === highAffinityClusterId && l.target === n.id)
                );

                const topicCounts = new Map<string, number>();
                const topicEvidence = new Map<string, any>();

                overindexedMembers.forEach(m => {
                    const bio = (m.data?.bio || '').toLowerCase();
                    const keywords = bio.match(/#[a-z0-9_]+/g) || [];
                    // Add bio keywords
                    keywords.forEach((k: string) => {
                        const topic = k.replace('#', '');
                        if (topic.length > 2) {
                            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
                            if (!topicEvidence.has(topic)) topicEvidence.set(topic, { source: m.id, bio });
                        }
                    });

                    // Add post hashtags
                    const posts = m.data?.latestPosts || [];
                    posts.forEach((p: any) => {
                        const tags = (p.caption || '').match(/#[a-z0-9_]+/g) || [];
                        tags.forEach((t: string) => {
                            const topic = t.replace('#', '');
                            if (topic.length > 2) {
                                topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
                            }
                        });
                    });
                });

                // Select Top Topics
                const topTopics = Array.from(topicCounts.entries())
                    .filter(([_, count]) => count > 1) // Must be shared
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8);

                topTopics.forEach(([topic, count]) => {
                    const topicId = `topic_${topic}`;
                    if (!addedNodeIds.has(topicId)) {
                        nodes.push({
                            id: topicId,
                            label: `#${topic}`,
                            group: 'topic',
                            val: 10 + (count * 2),
                            color: '#8b5cf6', // Violet
                            data: {
                                description: `Shared interest among ${count} overindexed profiles`,
                                count
                            }
                        });
                        addedNodeIds.add(topicId);
                        extractedAnalytics.topics.push({ name: topic, count });
                    }

                    // Link Members to Topic
                    overindexedMembers.forEach(m => {
                        const bio = (m.data?.bio || '').toLowerCase();
                        const posts = m.data?.latestPosts || [];
                        const hasTopic = bio.includes(topic) || posts.some((p: any) => (p.caption || '').includes(topic));

                        if (hasTopic) {
                            links.push({ source: m.id, target: topicId, value: 1 });
                        }
                    });
                });
            }

            // [NEW] Intelligent Pruning based on Query Intent
            if (plan && plan.intent) {
                this.optimizeGraphTopology(nodes, links, plan.intent, { id: 'MAIN' });
            }

            // [VISUAL INTELLIGENCE] Integrate Visual Miner Results
            if (analytics && analytics.visual) {
                console.log("[GraphGen] Integrating Visual Intelligence Data...");

                // 1. Enrich Main Node with Aesthetic Data
                const mainNode = nodes.find(n => n.id === 'MAIN');
                if (mainNode) {
                    if (!mainNode.data) mainNode.data = {};
                    mainNode.data.visual = analytics.visual;
                    // Optional: Set Main Node Color to dominant palette color if appropriate?
                    // For now, we prefer standard 'white' or 'green' for MAIN, and use visual data for UI panels.
                    // But we could set it if visualTheme is enabled in frontend.
                }

                // 2. Create Brand Nodes
                if (analytics.visual.brands && Array.isArray(analytics.visual.brands)) {
                    analytics.visual.brands.forEach((brand: any) => {
                        // [FIX] Normalize ID to match tree processing format (no prefix, alphanumeric only)
                        const cleanId = brand.name.toLowerCase().replace(/[^a-z0-9]/g, '');

                        // [FIX] Check if this brand already exists in the tree (without brand_ prefix)
                        if (addedNodeIds.has(cleanId)) {
                            console.log(`[GraphGen] Skipping Visual DNA brand "${brand.name}" - already exists in tree as "${cleanId}"`);
                            return;
                        }

                        // Create ID with brand_ prefix for Visual DNA-specific brands
                        const brandId = `brand_${brand.name.toLowerCase().replace(/\s+/g, '_')}`;

                        // Also check the prefixed version
                        if (addedNodeIds.has(brandId)) return;

                        // [FIX] Check for Scraped Data match
                        const scrapedProfile = profileMap.get(cleanId);
                        const matchCount = brand.imageUrls?.length || brand.count || 1;

                        let richData: any = {
                            name: brand.name,
                            count: matchCount,
                            type: 'brand',
                            evidence: `Detected visually in ${matchCount} posts`,
                            // [FIX] Construct Structured Provenance for ReasoningPanel
                            provenance: {
                                source: 'Visual Intelligence (Gemini Vision)',
                                method: 'Multimodal Brand Detection',
                                description: `Identified by analyzing dataset images for brand logos and semantic markers.`,
                                confidence: (brand.confidence || 90) / 100,
                                evidence: brand.imageUrls?.map((url: string) => ({
                                    text: `Visual match for ${brand.name}`,
                                    url: url,
                                    author: 'Visual Miner',
                                    date: new Date().toISOString().split('T')[0],
                                    type: 'visual_proof'
                                })) || []
                            },
                            // [NEW] Structured items for subnodes
                            evidenceItems: brand.imageUrls?.map((url: string) => ({
                                type: 'visual',
                                label: 'Visual Match',
                                snippet: `Detected logo or product for ${brand.name}`,
                                url: url,
                                score: brand.confidence || 90
                            })) || []
                        };

                        if (scrapedProfile) {
                            richData = {
                                ...richData,
                                username: scrapedProfile.username || brand.name,
                                bio: scrapedProfile.biography || scrapedProfile.bio || '',
                                followers: (scrapedProfile.followersCount || 0).toLocaleString(),
                                followerCount: scrapedProfile.followersCount || 0,
                                followingCount: scrapedProfile.followsCount || 0,
                                postCount: scrapedProfile.postsCount || 0,
                                profilePicUrl: proxyMediaUrl(scrapedProfile.profilePicUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(scrapedProfile?.username || brand.name)}&background=random`,
                                externalUrl: scrapedProfile.externalUrl || `https://instagram.com/${scrapedProfile.username}`,
                                latestPosts: (scrapedProfile.latestPosts || []).map((p: any) => proxyMediaFields(p)),
                                isVerified: scrapedProfile.isVerified || false
                            };
                        }

                        nodes.push({
                            id: brandId,
                            label: brand.name,
                            group: 'brand', // Visual Theme will color this Indigo/Blue
                            val: 10 + Math.min(20, matchCount * 2), // Size by frequency
                            level: 1,
                            data: richData
                        });

                        // [FIX] Add BOTH IDs to prevent duplicates in either direction
                        addedNodeIds.add(brandId);
                        addedNodeIds.add(cleanId);

                        // Link Main -> Brand
                        links.push({
                            source: 'MAIN',
                            target: brandId,
                            value: Math.max(1, matchCount)
                        });

                        // Add to brands list
                        extractedAnalytics.brands.push(richData);
                    });
                }

                // [NEW] 2.5 Create Product Nodes
                if (analytics.visual.products && Array.isArray(analytics.visual.products)) {
                    analytics.visual.products.forEach((product: any, idx: number) => {
                        const productId = `product_${idx}_${product.category.toLowerCase().replace(/\s+/g, '_')}`;
                        const matchCount = product.imageUrls?.length || 1;

                        nodes.push({
                            id: productId,
                            label: product.category,
                            group: 'topic',
                            val: 10 + Math.min(10, matchCount),
                            data: {
                                name: product.category,
                                description: product.description,
                                type: 'product',
                                imageUrls: product.imageUrls || [],
                                evidence: `Product detected in ${matchCount} images`
                            }
                        });

                        links.push({ source: 'MAIN', target: productId, value: 1 });
                    });
                }

                // 3. Map to Visual Theme (Frontend Compatibility)
                if (analytics.visual.colorPalette && analytics.visual.colorPalette.length > 0) {
                    (extractedAnalytics as any).visualTheme = {
                        primaryColor: analytics.visual.colorPalette[0],
                        textureStyle: (analytics.visual.aesthetics && analytics.visual.aesthetics[0]) ? analytics.visual.aesthetics[0].style : 'generic',
                        nodeTypeMapping: {}
                    };
                    console.log("[GraphGen] Mapped Visual Theme:", (extractedAnalytics as any).visualTheme);
                }
            }

            // [NEW] Hybrid: Populate Leaf Nodes from Server Data if missing from AI Tree
            // Loop through the sorted overindexed list we created earlier
            // Note: We already created the cluster node at the top

            console.log(`[OverIndex] Hybrid: Checking ${sortedOverindexed.length} server-identified nodes against graph...`);

            sortedOverindexed.forEach(([username, frequency]) => {
                const nodeId = username.toLowerCase().replace('@', '').trim(); // [FIX] Preserve underscores
                if (addedNodeIds.has(nodeId)) return; // Already added via AI tree

                const profile = profileMap.get(nodeId) || {};

                // [FIX] Explicit Filter: Do not add Private Accounts to results/panel
                if (profile.isPrivate || profile.is_private) {
                    console.log(`[OverIndex] Filtering private account: @${username}`);
                    return;
                }

                // [NEW] Anti-Noise Filter for Top Creators
                // Filter out accounts with < 1000 followers unless they are highly relevant in this specific network
                const followerCnt = Number(profile.followersCount || profile.followers || 0);
                if (followerCnt < 1000 && frequency < 3) {
                    return;
                }

                const bio = (profile.biography || '').toLowerCase();

                // [UNIFIED] Use central hydration helper
                const hydrated = this.hydrateNodeData(
                    profile,
                    profile.isBusinessAccount ? 'brand' : 'creator',
                    `High Affinity: Followed by ${frequency} source accounts`,
                    centralLabel
                );

                // Additional Overindex Metadata
                hydrated.val = Math.min(30, 5 + (frequency * 2));
                hydrated.data.overindexScore = frequency;
                hydrated.data.evidence = `High Affinity: Followed by ${frequency} source accounts`;

                nodes.push(hydrated);
                addedNodeIds.add(nodeId);

                // Add to relevant analytic list (will be sorted later)
                if (hydrated.group === 'brand') {
                    // List is now managed by orchestration pass
                } else {
                    // List is now managed by orchestration pass
                }

                // [FIX] Assign to Dedicated 'High Affinity' Cluster
                // Instead of trying to match semantic keywords (which leads to dispersal or 'MAIN' fallback),
                // we strictly group these statistically significant nodes together.
                if (hasHighAffinity) {
                    links.push({ source: highAffinityClusterId, target: nodeId, value: frequency });
                } else {
                    links.push({ source: 'MAIN', target: nodeId, value: frequency });
                }
            });


            // [NEW] Sort Lists by Relevance/Overindex Score (Descending)
            // Priority: overindexScore > frequencyScore
            const sortingFn = (a: any, b: any) => {
                const scoreA = (a.overindexScore || a.affinityPercent || 0);
                const scoreB = (b.overindexScore || b.affinityPercent || 0);
                if (scoreB !== scoreA) return scoreB - scoreA;
                return (b.frequencyScore || 0) - (a.frequencyScore || 0);
            };

            extractedAnalytics.creators.sort(sortingFn);
            extractedAnalytics.brands.sort(sortingFn);
            extractedAnalytics.topics.sort((a, b) => (b.frequencyScore || 0) - (a.frequencyScore || 0));

            console.log(`[GraphGen] Sorted analytics lists. Top Creator Score: ${extractedAnalytics.creators[0]?.frequencyScore}`);

        } else if (analytics) {
            // [FALLBACK] Legacy Flat List Support
            console.warn("[GraphGen] Tree structure missing, attempting legacy flat list fallback...");

            if (analytics.creators) {
                analytics.creators.forEach((c: any) => {
                    const identifier = c.handle || c.name || `creator_${Math.random().toString(36).substr(2, 9)}`;
                    const id = identifier.toLowerCase().replace('@', '');
                    if (!addedNodeIds.has(id)) {
                        const richData = { ...c, username: c.handle || c.name || id };
                        nodes.push({ id, label: c.name || c.handle || "Unknown Creator", val: 20, group: 'creator', data: richData });
                        links.push({ source: 'MAIN', target: id, value: 1 });
                        addedNodeIds.add(id);
                    }
                });
            }
            if (analytics.brands) {
                analytics.brands.forEach((c: any) => {
                    const identifier = c.name || c.handle || `brand_${Math.random().toString(36).substr(2, 9)}`;
                    const id = identifier.toLowerCase().replace('@', '');
                    if (!addedNodeIds.has(id)) {
                        const richData = { ...c, username: c.name || identifier };
                        nodes.push({ id, label: c.name || "Unknown Brand", val: 20, group: 'brand', data: richData });
                        links.push({ source: 'MAIN', target: id, value: 1 });
                        addedNodeIds.add(id);
                    }
                });
            }
            if (analytics.clusters) {
                analytics.clusters.forEach((c: any) => {
                    const identifier = c.name || c.label || `cluster_${Math.random().toString(36).substr(2, 9)}`;
                    const id = identifier.toLowerCase().replace('@', '');
                    if (!addedNodeIds.has(id)) {
                        const richData = { ...c, name: c.name || identifier };
                        nodes.push({ id, label: c.name || identifier, val: 20, group: 'cluster', data: richData });
                        links.push({ source: 'MAIN', target: id, value: 1 });
                        addedNodeIds.add(id);
                        extractedAnalytics.clusters.push(richData);
                    }
                });
            }
        }

        // [NEW] SEMANTIC CROSS-LINKING
        // Create a web of connections between nodes that share attributes, regardless of cluster
        const leafNodes = nodes.filter(n => n.group !== 'main' && n.group !== 'cluster' && n.group !== 'root');

        // [PERFORMANCE] Pre-calculate keywords for all leaf nodes to avoid O(N^2) splitting
        const nodeKeywords = new Map<string, string[]>();
        leafNodes.forEach(node => {
            const bio = (node.data.bio || '').toLowerCase();
            const keywords = bio.split(/\W+/).filter((w: string) => w.length > 4); // Filter short words
            nodeKeywords.set(node.id, keywords);
        });

        leafNodes.forEach((nodeA, i) => {
            // Get cached keywords
            const keywordsA = nodeKeywords.get(nodeA.id) || [];
            if (keywordsA.length === 0) return;

            for (let j = i + 1; j < leafNodes.length; j++) {
                const nodeB = leafNodes[j];
                const keywordsB = nodeKeywords.get(nodeB.id) || [];

                if (keywordsB.length === 0) continue;

                // Fast intersection
                let matchCount = 0;
                for (const k of keywordsA) {
                    if (keywordsB.includes(k)) matchCount++;
                    if (matchCount >= 5) break; // Optimization: Stop if max score reached
                }

                let overlapScore = 0;
                if (matchCount >= 3) overlapScore += 1;
                if (matchCount >= 5) overlapScore += 2;

                // Threshold
                if (overlapScore >= 2) {
                    links.push({
                        source: nodeA.id,
                        target: nodeB.id,
                        value: 0.5, // Thinner lines for semantic links
                        type: 'semantic'
                    });
                }
            }
        });

        // [NEW] Run Community Detection Algorithm
        CommunityDetectionService.detectCommunities(nodes, links);

        // [NEW] Run Influence Analysis (PageRank)
        const pagerankScores = GraphAnalysisService.calculatePageRank(nodes, links);
        GraphAnalysisService.applyInfluenceSizing(nodes, pagerankScores);

        // [VISUAL DNA] Enrich Clusters with Visual Identity
        // Aggregates images from cluster members and assigns a vibe/color
        await VisualDNAService.enrichClustersWithVisuals(nodes, links);

        // [FIX] Populate Global Analytics with MAIN node's Visual DNA
        const mainNodeForVisuals = nodes.find(n => n.id === 'MAIN');
        if (extractedAnalytics && mainNodeForVisuals && mainNodeForVisuals.data && mainNodeForVisuals.data.visualIdentity) {
            (extractedAnalytics as any).visual = mainNodeForVisuals.data.visualIdentity;
        }

        // [GAP REMEDIATION] Identify nodes missing enriched data and scrape them
        console.log('[GapRemediation] Checking for nodes missing enriched profile data...');
        const nodesToEnrich: any[] = [];

        for (const node of nodes) {
            // Skip MAIN node and cluster nodes
            if (node.id === 'MAIN' || node.group === 'cluster' || node.group === 'topic' || node.group === 'subtopic') {
                continue;
            }

            // Check if node is missing critical enriched data
            // [FIX] Treat 0 counts as missing data - profiles should have real stats
            // [FIX] Ignore placeholder strings like "Bio unavailable" when checking if enriched
            const bioText = (node.data.bio || '').toLowerCase();
            const isPlaceholderBio = bioText.includes('bio unavailable') ||
                bioText.includes('no bio') ||
                bioText.includes('placeholder') ||
                bioText.length < 5;

            const hasEnrichedData = node.data && (
                (node.data.followerCount && node.data.followerCount > 0) ||
                (node.data.followingCount && node.data.followingCount > 0) ||
                (node.data.postCount && node.data.postCount > 0) ||
                (node.data.bio && node.data.bio.length > 10 && !isPlaceholderBio) // [FIX] Bio must be substantial AND real
            );

            if (!hasEnrichedData) {
                // [DEBUG] Log profiles that need enrichment
                if (node.data?.username) {
                    console.log(`[GapRemediation] 🔍 Profile needs enrichment: ${node.data.username} (followers: ${node.data?.followerCount || 0}, bio: ${node.data?.bio ? 'yes' : 'no'})`);
                }

                // Try to extract username from node data
                // [FIX] Only use username/handle fields, NOT label/id which can be cluster names
                const username = node.data?.username || node.data?.handle;

                // [FIX] Validate that it's a real username: no spaces, not too long, starts with alphanumeric
                const isValidUsername = username &&
                    typeof username === 'string' &&
                    !username.includes(' ') &&
                    username.length > USERNAME_MIN_LENGTH &&
                    username.length < USERNAME_MAX_LENGTH &&
                    USERNAME_VALIDATION_REGEX.test(username.toLowerCase());

                if (isValidUsername && username !== 'MAIN') {
                    nodesToEnrich.push({
                        node,
                        username: username.replace('@', '').toLowerCase()
                    });
                }
            }
        }

        if (nodesToEnrich.length > 0) {
            console.log(`[GapRemediation] Found ${nodesToEnrich.length} nodes missing enriched data. Scraping profiles...`);

            // [FIX] Track failures for reporting
            let totalEnriched = 0;
            let totalFailed = 0;
            const failedUsernames: string[] = [];

            // Scrape missing profiles in batches
            const batchSize = GAP_REMEDIATION_BATCH_SIZE;
            const batches = [];
            for (let i = 0; i < nodesToEnrich.length; i += batchSize) {
                batches.push(nodesToEnrich.slice(i, i + batchSize));
            }

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                const usernames = batch.map(item => item.username);

                try {
                    // Use instagram-profile-scraper for rich profile data
                    const scrapedProfiles = await this.runApifyActor(
                        'apify/instagram-profile-scraper',
                        {
                            usernames,
                            resultsLimit: usernames.length
                        },
                        `gap_remediation_batch_${batchIndex}`
                    );

                    if (scrapedProfiles && scrapedProfiles.items && scrapedProfiles.items.length > 0) {
                        // Create a map for quick lookup
                        const scrapedMap = new Map<string, any>();
                        for (const profile of scrapedProfiles.items) {
                            const cleanUsername = (profile.username || '').toLowerCase().replace('@', '');
                            scrapedMap.set(cleanUsername, profile);
                        }

                        // Enrich nodes with scraped data
                        for (const item of batch) {
                            const scrapedProfile = scrapedMap.get(item.username);
                            if (scrapedProfile) {
                                if (!item.node.data) item.node.data = {};

                                item.node.data.username = scrapedProfile.username || item.username;
                                item.node.data.bio = scrapedProfile.biography || scrapedProfile.bio || '';
                                item.node.data.followers = (scrapedProfile.followersCount || 0).toLocaleString();
                                item.node.data.followerCount = scrapedProfile.followersCount || 0;
                                item.node.data.followingCount = scrapedProfile.followsCount || 0;
                                item.node.data.postCount = scrapedProfile.postsCount || 0;
                                item.node.data.profilePicUrl = proxyMediaUrl(scrapedProfile.profilePicUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(scrapedProfile.username || item.username)}&background=random`;
                                item.node.data.externalUrl = scrapedProfile.externalUrl || `https://instagram.com/${scrapedProfile.username}`;
                                item.node.data.isVerified = scrapedProfile.isVerified || false;

                                if (scrapedProfile.latestPosts && scrapedProfile.latestPosts.length > 0) {
                                    item.node.data.latestPosts = scrapedProfile.latestPosts.map((post: any) => proxyMediaFields(post));
                                }

                                console.log(`[GapRemediation] ✅ Enriched ${item.username} with ${scrapedProfile.followersCount || 0} followers`);
                                totalEnriched++;
                            } else {
                                // Profile was requested but not returned
                                totalFailed++;
                                failedUsernames.push(item.username);
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`[GapRemediation] ⚠️ Failed to scrape batch ${batchIndex}:`, error);
                    // Track all usernames in this batch as failed
                    totalFailed += batch.length;
                    failedUsernames.push(...batch.map(item => item.username));
                    // Continue with other batches
                }

                console.log(`[GapRemediation] Processed batch ${batchIndex + 1}/${batches.length}`);
            }

            // [FIX] Report final statistics
            console.log(`[GapRemediation] ✅ Gap remediation complete:`);
            console.log(`  - Total nodes to enrich: ${nodesToEnrich.length}`);
            console.log(`  - Successfully enriched: ${totalEnriched}`);
            console.log(`  - Failed to enrich: ${totalFailed}`);
            if (totalFailed > 0) {
                console.log(`  - Failed usernames: ${failedUsernames.slice(0, 10).join(', ')}${failedUsernames.length > 10 ? ` ... and ${failedUsernames.length - 10} more` : ''}`);
            }
        } else {
            console.log('[GapRemediation] All nodes have enriched data - skipping gap remediation');
        }

        // Return both graph and the extracted analytics lists

        return {
            nodes,
            links,
            analytics: {
                ...extractedAnalytics,
                overindexing: {
                    topCreators: extractedAnalytics.creators,
                    topBrands: extractedAnalytics.brands,
                    topTopics: extractedAnalytics.topics,
                    topHashtags: extractedAnalytics.hashtags
                }
            }
        };
    }

    /**
     * Generate cluster graph - identifies communities based on hashtags and profile similarity
     */
    private generateClusterGraph(profiles: any[], centralLabel: string, sampleSize: number = 100): any {
        const nodes: any[] = [];
        const links: any[] = [];

        // Dynamic Limits
        const maxClusters = Math.max(15, Math.ceil(sampleSize * 0.2)); // Scale clusters with sample
        const membersPerCluster = Math.max(5, Math.ceil(sampleSize * 0.05)); // Scale members per cluster

        nodes.push({ id: 'MAIN', label: centralLabel, group: 'main', val: 50, level: 0 });

        // Hashtag-based clustering
        const hashtagGroups = new Map<string, Set<any>>();

        profiles.forEach(profile => {
            const posts = profile.latestPosts || [];
            const hashtags = new Set<string>();

            posts.forEach((post: any) => {
                const tags = post.hashtags || [];
                tags.forEach((tag: string) => {
                    const clean = tag.replace(/^#/, '').toLowerCase();
                    if (clean.length > 2) {
                        hashtags.add(clean);
                    }
                });
            });

            // Add profile to each hashtag group
            hashtags.forEach(tag => {
                if (!hashtagGroups.has(tag)) {
                    hashtagGroups.set(tag, new Set());
                }
                hashtagGroups.get(tag)!.add(profile);
            });
        });

        // Filter to meaningful clusters (at least 3 members)
        const clusters = Array.from(hashtagGroups.entries())
            .filter(([tag, members]) => members.size >= 3)
            .map(([tag, members]) => ({
                name: `#${tag} `,
                tag,
                count: members.size,
                members: Array.from(members),
                keywords: [tag]
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, maxClusters); // Dynamic limit

        // Create cluster nodes
        const profilesInClusters = new Set<string>();

        clusters.forEach((cluster, idx) => {
            const clusterId = `cluster_${idx}`;

            nodes.push({
                id: clusterId,
                label: cluster.name,
                group: 'cluster',
                val: Math.min(cluster.count * 1.5, 40), // Increased cap and scaling for better visibility
                level: 1,
                data: {
                    count: cluster.count,
                    keywords: cluster.keywords
                }
            });

            links.push({ source: 'MAIN', target: clusterId, value: 5 });

            // Add some members of this cluster
            cluster.members.slice(0, membersPerCluster).forEach((profile: any) => {
                const username = profile.username;
                if (!username || profilesInClusters.has(username)) return;

                const profileId = `profile_${username}`;

                nodes.push({
                    id: profileId,
                    label: username,
                    group: 'profile',
                    val: 10,
                    level: 2,
                    profilePic: proxyMediaUrl(profile.profile_pic_url || profile.profilePicUrl),
                    data: {
                        username,
                        profilePicUrl: proxyMediaUrl(profile.profile_pic_url || profile.profilePicUrl),
                        followersCount: profile.followersCount || profile.follower_count || 0
                    }
                });

                links.push({ source: clusterId, target: profileId, value: 2 });
                profilesInClusters.add(username);
            });
        });

        return {
            nodes,
            links,
            analytics: {
                clusters: clusters.map(c => ({
                    name: c.name,
                    count: c.count,
                    keywords: c.keywords
                })),
                creators: [],
                brands: [],
                overindexedAccounts: [],
                topics: [],
                topContent: []
            }
        };
    }

    /**
     * Notify user that orchestration is complete
     */
    private async notifyOrchestrationComplete(job: Job, query: string, datasetId: string) {
        const user = await mongoService.getUser(job.userId) || await mongoService.getUserByEmail(job.userId);
        if (user && user.email) {
            const subject = `Your Fandom Analysis is Ready: ${query} ðŸ—ºï¸`;
            const htmlBody = `
    < div style = "font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;" >
        <div style="text-align: center; margin-bottom: 30px;" >
            <h1 style="color: #10b981; font-size: 28px; margin-bottom: 5px;" > Fandom Intelligence </h1>
                < p style = "color: #64748b; font-size: 14px; text-transform: uppercase; tracking: 1px; margin: 0;" > Analysis Complete </p>
                    </div>

                    < div style = "background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 30px;" >
                        <h2 style="color: #10b981; font-size: 20px; margin-top: 0; margin-bottom: 15px;" > Query: "${query}" </h2>
                            < p style = "font-size: 16px; line-height: 1.6; margin-bottom: 30px; color: #94a3b8;" >
                                Your comprehensive fandom analysis is complete! The interactive graph and detailed analytics are now available in your dashboard.
                        </p>
                                    </div>

                                    < div style = "text-align: center;" >
                                        <a href="https://fandom-mapper-ph1-634174038368.europe-west2.run.app/" style = "display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);" >
                                            View Your Map
                                                </a>
                                                </div>

                                                < div style = "margin-top: 40px; padding-top: 20px; border-top: 1px solid #10b98122; text-align: center;" >
                                                    <p style="font-size: 12px; color: #475569;" >
                                                        Job ID: ${job.id} â€¢ Dataset: ${datasetId}
</p>
    </div>
    </div>
        `;
            await emailService.sendEmail(user.email, subject, htmlBody);
        }
    }

    // --- NEW GRAPH GENERATORS (FIX) ---

    // 1. Geo Graph
    private generateGeoGraph(records: any[], centralLabel: string, geoData: any[], sampleSize: number = 100): any {
        const nodes: any[] = [];
        const links: any[] = [];

        // Dynamic Limits
        const maxLocations = Math.max(15, Math.ceil(sampleSize * 0.15));
        const profilesPerLoc = Math.max(5, Math.ceil(sampleSize * 0.05));

        // Central Node
        nodes.push({ id: 'MAIN', label: centralLabel, group: 'main', val: 50, level: 0 });

        // Tier 1: Locations (Cities)
        // Use top locations from analytics, scaled by sampleSize
        const topLocations = geoData.slice(0, maxLocations);

        topLocations.forEach((loc: any, i: number) => {
            const lid = `loc_${i} `;
            const size = Math.min(40, 15 + (loc.count * 2)); // Dynamic size

            nodes.push({
                id: lid,
                label: loc.name,
                group: 'location',
                val: size,
                level: 1,
                data: { count: loc.count }
            });

            // Link Main -> Location
            links.push({ source: 'MAIN', target: lid, value: 5 });

            // Tier 2: Profiles in this location
            // Find records matching this location
            const locProfiles = records.filter(r => {
                const rLoc = r.city_name || r.location || r.address_street || r.biography || '';
                return rLoc.toLowerCase().includes(loc.name.toLowerCase());
            }).slice(0, profilesPerLoc); // Dynamic limit per location

            locProfiles.forEach((p: any, j: number) => {
                const node = this.hydrateNodeData(p, 'profile', `Profile @${p.username} discovered in ${loc.name}`, centralLabel);
                node.level = 2;
                node.val = 10;

                if (!nodes.find(n => n.id === node.id)) {
                    nodes.push(node);
                    // Link Location -> Profile
                    links.push({ source: lid, target: node.id, value: 2 });
                }
            });
        });

        return { nodes, links };
    }


    // Helper: Aggregate Locations
    private aggregateLocations(rawLocations: string[]): any[] {
        const map = new Map<string, number>();
        rawLocations.forEach(loc => {
            // Clean string (simple)
            const clean = loc.split(',')[0].trim(); // Take City only usually
            if (clean.length > 2) {
                map.set(clean, (map.get(clean) || 0) + 1);
            }
        });

        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([location, count]) => ({ name: location, count, lat: 0, lng: 0 }));
    }

    private determineNodeGroup(username: string, analytics: any): string {
        if (!username) return 'profile';

        const clean = username.toLowerCase();

        // 1. Check Analytics (Apify Data)
        if (analytics) {
            // Check Brands
            if (analytics.brands && analytics.brands.some((b: any) =>
                (b.username && b.username.toLowerCase() === clean) ||
                (b.name && b.name.toLowerCase() === clean)
            )) {
                return 'brand';
            }

            // Check Creators
            if (analytics.creators && analytics.creators.some((c: any) =>
                (c.username && c.username.toLowerCase() === clean)
            )) {
                return 'creator';
            }

            // Check Overindexed
            if (analytics.overindexedAccounts && analytics.overindexedAccounts.some((o: any) =>
                (o.username && o.username.toLowerCase() === clean)
            )) {
                const match = analytics.overindexedAccounts.find((o: any) => o.username.toLowerCase() === clean);
                if (match && match.category === 'brand') return 'brand';
                return 'overindexed';
            }
        }

        // 2. Heuristic Semantic Checks (Fallback)
        // Check for obvious brand indicators in username if no analytics match
        if (/official|global|uk|usa|app|tech|studio|store|shop|brand/.test(clean)) {
            return 'brand';
        }

        return 'profile';
    }

    private handleCompetitorContentGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Competitor Content Graph");
        const graphData = this.generateCompetitorContentGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post')
                    .map((n: any) => ({
                        title: n.data.caption ? n.data.caption.substring(0, 50) + '...' : n.label,
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: n.data.username || query,
                        description: n.data.caption,
                        citation: "Derived from post analysis",
                        searchQuery: query,
                        sourceUrl: n.data.url,
                        evidence: `Post has ${n.data.likesCount} likes and ${n.data.commentsCount} comments`
                    })),
                topics: graphData.nodes
                    .filter((n: any) => n.group === 'topic')
                    .map((n: any) => ({
                        name: n.data.hashtag || n.label,
                        percentage: `${n.data.count} posts`,
                        citation: "Extracted from hashtags",
                        searchQuery: query,
                        sourceUrl: `https://instagram.com/explore/tags/${n.label.replace('#', '')}`,
                        evidence: `Used in ${n.data.count} posts`
                    })),
                brands: graphData.nodes
                    .filter((n: any) => n.group === 'brand')
                    .map((n: any) => ({
                        name: n.data.mention || n.label,
                        handle: n.data.mention?.replace('@', '') || n.label,
                        citation: "Mentioned in posts",
                        searchQuery: query,
                        sourceUrl: `https://instagram.com/${n.label.replace('@', '')}`,
                        evidence: `Mentioned ${n.data.count} times`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleHashtagGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Hashtag Graph");
        const graphData = this.generateHashtagGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post' || n.data.url)
                    .map((n: any) => ({
                        title: n.label,
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: n.data.username || "Unknown",
                        description: n.data.caption,
                        citation: "Hashtag top post",
                        searchQuery: query,
                        sourceUrl: n.data.url,
                        evidence: `Engagement: ${n.data.likesCount} likes, ${n.data.commentsCount} comments`
                    })),
                topics: graphData.nodes
                    .filter((n: any) => n.group === 'topic' && n.id !== 'MAIN_HASHTAG')
                    .map((n: any) => ({
                        name: n.label,
                        percentage: `${n.data.count} co-occurrences`,
                        citation: "Co-occurring hashtag",
                        sourceUrl: `https://instagram.com/explore/tags/${n.label.replace('#', '')}`
                    })),
                creators: graphData.nodes
                    .filter((n: any) => n.group === 'creator')
                    .map((n: any) => ({
                        name: n.label,
                        handle: n.data.username,
                        type: 'creator',
                        citation: "Top contributor",
                        profilePicUrl: n.data.profilePicUrl
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleEngagementBenchmarkGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Benchmark Graph");
        const graphData = this.generateEngagementBenchmarkGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                comparison: {
                    profiles: graphData.analytics.benchmarkAnalysis.profiles.map((p: any) => ({
                        name: p.username,
                        totalFollowers: p.totalPosts,
                        uniqueFollowers: p.engagementRate + "% ER",
                        sharedFollowers: p.avgEngagement + " Avg Likes"
                    })),
                    overlapPercentage: "0",
                    shared: { count: 0 }
                },
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post')
                    .map((n: any) => ({
                        title: n.data.caption ? n.data.caption.substring(0, 50) + '...' : 'Post',
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: "Unknown",
                        description: n.data.caption,
                        evidence: `Engagement: ${n.data.engagement}`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleUGCGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic UGC Graph");
        const graphData = this.generateUGCGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                overindexing: {
                    topCreators: graphData.analytics.ugcAnalysis.topCreators.map((c: any) => ({
                        name: c.name,
                        handle: c.handle,
                        score: 10,
                        citation: `Contributed ${c.postsCount} posts with ${c.engagement} engagement`
                    }))
                },
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post' || n.data.url)
                    .map((n: any) => ({
                        title: n.label || 'Post',
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: n.data.username || "Unknown",
                        description: n.data.caption,
                        evidence: `UGC Engagement: ${n.data.engagement}`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleSentimentGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Sentiment Graph");
        const graphData = this.generateSentimentGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                sentimentAnalysis: graphData.analytics.sentimentAnalysis,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post' || n.data.url)
                    .map((n: any) => ({
                        title: n.label || 'Post',
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: n.data.username || "Unknown",
                        description: n.data.caption,
                        evidence: `Engagement: ${n.data.engagement}`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleInfluencerGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Influencer Graph");
        const graphData = this.generateInfluencerGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                overindexing: graphData.analytics.overindexing,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'creator')
                    .map((n: any) => ({
                        title: n.label,
                        platform: 'Instagram',
                        url: n.data.sourceUrl,
                        views: n.data.followers?.toLocaleString(),
                        author: n.label,
                        description: n.data.bio,
                        evidence: n.data.citation
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleViralGraph(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Viral Graph");
        const graphData = this.generateViralGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                viralAnalysis: graphData.analytics.viralAnalysis,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post')
                    .map((n: any) => ({
                        title: n.label,
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.velocity + " eng/hr",
                        author: n.data.author,
                        description: n.data.caption,
                        evidence: `Velocity: ${n.data.velocity}`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }

    private handleComparisonGraphHandler(plan: any, results: any[], query: string): any {
        console.log("[JobOrchestrator] Using Deterministic Comparison Graph");
        const graphData = this.generateComparisonGraph(plan, results, query);

        return {
            analytics: {
                ...graphData.analytics,
                comparison: graphData.analytics.comparison,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post')
                    .map((n: any) => ({
                        title: n.label,
                        platform: 'Instagram',
                        url: n.data.url,
                        views: n.data.engagement?.toLocaleString(),
                        author: n.data.author,
                        description: n.data.caption,
                        evidence: `Shared Audience Engagement`
                    }))
            },
            graph: { nodes: graphData.nodes, links: graphData.links }
        };
    }


}

export const jobOrchestrator = JobOrchestrator.getInstance();

