/**
 * Over-indexing Service
 * Calculates which accounts are followed by a disproportionate number of a profile's followers
 */

import {
    DatasetPlatform,
    OverindexedAccount,
    OverindexingResult,
    Dataset
} from '../types.js';
import { searchDatasets, createDataset, getDataset } from './datasetService.js';

/**
 * Aggregate following data from multiple follower samples
 * Returns a map of username -> frequency count
 */
const aggregateFollowing = (followingSamples: any[][]): Map<string, {
    count: number;
    accountData: any;
}> => {
    const aggregated = new Map<string, { count: number; accountData: any }>();

    for (const following of followingSamples) {
        for (const account of following) {
            const username = (account.username || account.ownerUsername || '').toLowerCase();
            if (!username) continue;

            const existing = aggregated.get(username);
            if (existing) {
                existing.count++;
            } else {
                aggregated.set(username, { count: 1, accountData: account });
            }
        }
    }

    return aggregated;
};

/**
 * Classify an account as creator, brand, media, or other
 */
const classifyAccount = (account: any): 'creator' | 'brand' | 'media' | 'other' => {
    const bio = (account.bio || account.biography || '').toLowerCase();
    const username = (account.username || '').toLowerCase();
    const fullName = (account.fullName || account.full_name || '').toLowerCase();

    // Media keywords
    const mediaKeywords = ['news', 'media', 'magazine', 'daily', 'tv', 'radio', 'podcast', 'channel'];
    if (mediaKeywords.some(k => bio.includes(k) || username.includes(k) || fullName.includes(k))) {
        return 'media';
    }

    // Brand keywords - expanded for better detection
    const brandKeywords = [
        'official', 'brand', 'company', 'shop', 'store', 'inc', 'ltd', 'corp', 'business',
        'drink', 'beverage', 'food', 'restaurant', 'cafe', 'coffee', 'beer', 'wine', 'brewery',
        'fashion', 'clothing', 'retail', 'service', 'hotel', 'gym', 'product', 'est.', 'since'
    ];
    if (brandKeywords.some(k => bio.includes(k) || fullName.includes(k))) {
        return 'brand';
    }

    // Check for verified + high follower count as likely brand/media
    // Lowered threshold to catch more brands
    if (account.isVerified && (account.followerCount || 0) > 50000) {
        return 'brand';
    }

    // Creator indicators
    const creatorKeywords = ['creator', 'influencer', 'content', 'youtube', 'streamer', 'dj', 'artist', 'musician', 'actor', 'model'];
    if (creatorKeywords.some(k => bio.includes(k))) {
        return 'creator';
    }

    // Default to creator for accounts with moderate follower counts
    // Raised threshold to avoid misclassifying brands
    if ((account.followerCount || 0) > 5000) {
        return 'creator';
    }

    return 'other';
};

/**
 * Calculate over-indexing score
 * Score > 1 means over-indexed (more popular than baseline)
 * Score = frequency_in_sample / expected_baseline
 */
const calculateOverindexScore = (
    frequencyInSample: number,
    sampleSize: number,
    baselineFrequency: number = 0.01 // Default 1% baseline
): number => {
    const actualFrequency = frequencyInSample / sampleSize;
    return actualFrequency / baselineFrequency;
};

/**
 * Main function to calculate over-indexed accounts
 */
export const calculateOverindexing = async (
    targetProfile: string,
    platform: DatasetPlatform,
    followersDatasetId?: string,
    followingDatasetIds: string[] = [],
    rawFollowers?: any[],     // Optimized: Pass data directly
    rawFollowing?: any[][]    // Optimized: Pass data directly
): Promise<OverindexingResult> => {

    // 1. Fetch Followers Data
    let followersData = rawFollowers;
    if (!followersData && followersDatasetId) {
        const followersDs = await getDataset(followersDatasetId);
        followersData = followersDs?.data || [];
    }

    // 2. Fetch Following Data (who they follow)
    const followingSamples: any[][] = rawFollowing || [];

    // If explicit following datasets are provided (and no raw data), load them
    if (followingSamples.length === 0 && followingDatasetIds.length > 0) {
        for (const id of followingDatasetIds) {
            const ds = await getDataset(id);
            if (ds && ds.data) {
                followingSamples.push(ds.data);
            }
        }
    }

    // Fallback: If no explicit following datasets, check if followersData contains composite data (Posts with mentions)
    if (followingSamples.length === 0 && followersData && followersData.length > 0) {
        const sampleEx = followersData[0];
        // Check if data looks like posts (has caption, text, or media properties)
        if (sampleEx.caption || sampleEx.taken_at || sampleEx.media_type || sampleEx.text) {
            console.log("No explicit following lists. Extracting interactions (mentions/tags) from Posts...");
            const posts = followersData;
            const interactionMap = new Map<string, Set<string>>();

            posts.forEach((post: any) => {
                // Robust Extraction of Owner
                let owner = post.ownerUsername || post.username;
                if (!owner && post.owner && post.owner.username) owner = post.owner.username;
                if (!owner && post.user && post.user.username) owner = post.user.username;

                if (!owner || owner === 'unknown') return;
                owner = owner.toLowerCase();

                if (!interactionMap.has(owner)) interactionMap.set(owner, new Set());
                const interactions = interactionMap.get(owner)!;

                // Robust Extraction of Caption
                let caption = post.caption || post.text || '';
                if (!caption && post.edge_media_to_caption && post.edge_media_to_caption.edges && post.edge_media_to_caption.edges.length > 0) {
                    caption = post.edge_media_to_caption.edges[0].node.text;
                }

                // 1. Extract from Caption Mentions
                const mentions = (caption || '').match(/@([\w._]+)/g) || [];
                mentions.forEach((m: string) => interactions.add(m.replace('@', '').toLowerCase()));

                // 2. Extract from Tagged Users (Nested check)
                if (post.taggedUsers && Array.isArray(post.taggedUsers)) {
                    post.taggedUsers.forEach((u: any) => {
                        if (typeof u === 'string') interactions.add(u.toLowerCase());
                        else if (u.username) interactions.add(u.username.toLowerCase());
                        else if (u.user && u.user.username) interactions.add(u.user.username.toLowerCase());
                    });
                }
                // 3. Extract from Mentions Array (if available)
                if (post.mentions && Array.isArray(post.mentions)) {
                    post.mentions.forEach((u: any) => interactions.add(u.toLowerCase()));
                }
            });

            // Convert Map to followingSamples format (Array of Arrays of Objects)
            interactionMap.forEach((targets, owner) => {
                if (targets.size > 0) {
                    const sample = Array.from(targets).map(username => ({ username }));
                    followingSamples.push(sample);
                }
            });

            console.log(`Derived 'following' proxys from ${posts.length} posts across ${interactionMap.size} users.`);
        }
    }

    if (followingSamples.length === 0) {
        console.warn("No following data OR interaction data available for over-indexing calculation");
        // DEBUG: Why did we fail?
        if (followersData && followersData.length > 0) {
            console.log("DEBUG: First Post Sample:", JSON.stringify(followersData[0], null, 2));
        }

        return {
            targetProfile,
            platform,
            followersSampled: 0,
            followingAnalyzed: 0,
            calculatedAt: new Date(),
            topCreators: [],
            topBrands: [],
            topMedia: [],
            clusters: []
        };
    }

    // 3. Process the data
    return processFollowingForOverindexing(
        targetProfile,
        platform,
        followingSamples
    );
};

/**
 * Process raw following data from multiple followers to find over-indexed accounts
 */
export const processFollowingForOverindexing = (
    targetProfile: string,
    platform: DatasetPlatform,
    followingSamples: any[][],
    minFrequency: number = 2, // Minimum threshold: Must appear at least 2 times
    topN: number = 50 // Return top N results per category
): OverindexingResult => {
    const sampleSize = followingSamples.length;
    const aggregated = aggregateFollowing(followingSamples);

    // [PROVENANCE] Generate Evidence for UI
    const allResults = Array.from(aggregated.entries()).map(([username, data]) => {
        const account = data.accountData;
        const percentage = data.count / sampleSize;
        const overindexScore = calculateOverindexScore(data.count, sampleSize);
        const evidenceUsers = data.accountData?._sampleFollowers || []; // If we tracked who follows them
        // If we don't have explicit list in accountData, we can't show "user X follows this".
        // But we can explain the math.

        const multiplier = overindexScore.toFixed(1);
        const provenance = {
            source: 'Audience Statistical Analysis',
            method: `Frequency Calculation (${multiplier}x baseline)`,
            confidence: data.count > 5 ? 0.9 : 0.7,
            reasoning: `This profile is followed by ${data.count} of the ${sampleSize} users analyzed, which is ${multiplier}x higher than the average baseline.`,
            evidence: [
                `Frequency: ${data.count} appearances in sample`,
                `Sample Size: ${sampleSize} profiles analyzed`,
                `Over-index Score: ${multiplier} (Normal > 1.0)`
            ]
        };

        return {
            username: account.username || username,
            platform,
            fullName: account.fullName || account.full_name || undefined,
            profilePicUrl: account.profilePicUrl || account.profile_pic_url || undefined,
            followerCount: account.followerCount || account.followers,
            category: classifyAccount(account),
            frequency: data.count,
            percentage: Math.round(percentage * 100) / 100,
            overindexScore: Math.round(overindexScore * 100) / 100,
            bio: account.bio || account.biography || undefined,
            url: account.url || `https://www.instagram.com/${account.username || username}/`,
            provenance // [NEW] Attach Provenance
        } as OverindexedAccount;
    })
        .filter((item): item is OverindexedAccount => item !== null)
        .sort((a, b) => b.overindexScore - a.overindexScore);

    // Filter to only show profiles with overindex score >= 3.0 (300% overindexed)
    const significantlyOverindexed = allResults.filter(a => a.overindexScore >= 3.0);

    // Take top N
    const topProfiles = significantlyOverindexed.slice(0, topN);

    // Separate by category for backwards compatibility
    const creators = topProfiles.filter(a => a.category === 'creator');
    const brands = topProfiles.filter(a => a.category === 'brand');
    const media = topProfiles.filter(a => a.category === 'media');

    // Calculate total following analyzed
    const totalFollowingAnalyzed = followingSamples.reduce(
        (sum, sample) => sum + sample.length,
        0
    );

    return {
        targetProfile,
        platform,
        followersSampled: sampleSize,
        followingAnalyzed: totalFollowingAnalyzed,
        calculatedAt: new Date(),
        topCreators: creators,
        topBrands: brands,
        topMedia: media,
        clusters: [] // Clustering would require additional processing
    };
};

/**
 * Find clusters of related over-indexed accounts
 * Groups accounts that frequently appear together in followers' following lists
 */
export const findClusters = (
    overindexedAccounts: OverindexedAccount[],
    followingSamples: any[][],
    minClusterSize: number = 3
): { name: string; accounts: OverindexedAccount[]; commonKeywords: string[] }[] => {
    // Create co-occurrence matrix
    const coOccurrence = new Map<string, Map<string, number>>();
    const accountNames = new Set(overindexedAccounts.map(a => a.username.toLowerCase()));

    for (const following of followingSamples) {
        const followingUsernames = following
            .map(a => (a.username || '').toLowerCase())
            .filter(u => accountNames.has(u));

        // Count pairs that appear together
        for (let i = 0; i < followingUsernames.length; i++) {
            for (let j = i + 1; j < followingUsernames.length; j++) {
                const u1 = followingUsernames[i];
                const u2 = followingUsernames[j];

                if (!coOccurrence.has(u1)) {
                    coOccurrence.set(u1, new Map());
                }
                const u1Map = coOccurrence.get(u1)!;
                u1Map.set(u2, (u1Map.get(u2) || 0) + 1);
            }
        }
    }

    // Simple clustering: group highly co-occurring accounts
    const clusters: { name: string; accounts: OverindexedAccount[]; commonKeywords: string[] }[] = [];
    const used = new Set<string>();
    const threshold = followingSamples.length * 0.1; // 10% co-occurrence threshold

    for (const account of overindexedAccounts) {
        const username = account.username.toLowerCase();
        if (used.has(username)) continue;

        const cluster: OverindexedAccount[] = [account];
        used.add(username);

        // Find accounts that frequently co-occur
        const accountCoOccurrence = coOccurrence.get(username);
        if (accountCoOccurrence) {
            accountCoOccurrence.forEach((count, otherUsername) => {
                if (count >= threshold && !used.has(otherUsername)) {
                    const otherAccount = overindexedAccounts.find(
                        a => a.username.toLowerCase() === otherUsername
                    );
                    if (otherAccount) {
                        cluster.push(otherAccount);
                        used.add(otherUsername);
                    }
                }
            });
        }

        if (cluster.length >= minClusterSize) {
            // Extract common keywords from bios
            const allWords = cluster
                .map(a => (a.bio || '').toLowerCase().split(/\s+/))
                .flat()
                .filter(w => w.length > 3);

            const wordCounts = new Map<string, number>();
            allWords.forEach(w => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));

            const commonKeywords = Array.from(wordCounts.entries())
                .filter(([_, count]) => count >= Math.ceil(cluster.length / 2))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([word]) => word);

            // Generate cluster name from top category and keywords
            const primaryCategory = cluster[0].category;
            const clusterName = commonKeywords.length > 0
                ? `${primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1)}s: ${commonKeywords[0]}`
                : `${primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1)} Group ${clusters.length + 1}`;

            clusters.push({
                name: clusterName,
                accounts: cluster,
                commonKeywords
            });
        }
    }

    return clusters;
};

/**
 * Save over-indexing results as a dataset
 */
export const saveOverindexingResults = async (
    results: OverindexingResult,
    name?: string
): Promise<Dataset> => {
    const datasetName = name ||
        `Over-indexed for ${results.targetProfile} (${results.platform})`;

    // Combine all accounts into data array
    const allAccounts = [
        ...results.topCreators,
        ...results.topBrands,
        ...results.topMedia
    ];

    return createDataset({
        name: datasetName,
        platform: results.platform,
        targetProfile: results.targetProfile,
        dataType: 'overindexed',
        recordCount: allAccounts.length,
        tags: ['auto-generated', 'over-indexing'],
        data: allAccounts,
        metadata: {
            sourceActor: 'overindexing-service',
            scrapeTimestamp: results.calculatedAt,
            scrapeParams: {
                followersSampled: results.followersSampled,
                followingAnalyzed: results.followingAnalyzed
            },
            estimatedCompleteness: Math.min(
                100,
                (results.followersSampled / 1000) * 100 // 1000 followers = 100% completeness
            )
        },
        sources: []
    });
};

/**
 * Quick lookup: get over-indexed accounts from existing dataset
 */
export const getOverindexedFromDataset = async (
    targetProfile: string,
    platform: DatasetPlatform
): Promise<OverindexingResult | null> => {
    const datasets = await searchDatasets({
        platform,
        targetProfile,
        dataType: 'overindexed'
    });

    if (datasets.length === 0) return null;

    // Get most recent
    const dataset = datasets[0];

    // Reconstruct result from stored data
    const accounts = dataset.data as OverindexedAccount[];

    return {
        targetProfile: dataset.targetProfile,
        platform: dataset.platform,
        followersSampled: dataset.metadata.scrapeParams?.followersSampled || 0,
        followingAnalyzed: dataset.metadata.scrapeParams?.followingAnalyzed || 0,
        calculatedAt: new Date(dataset.metadata.scrapeTimestamp),
        topCreators: accounts.filter(a => a.category === 'creator'),
        topBrands: accounts.filter(a => a.category === 'brand'),
        topMedia: accounts.filter(a => a.category === 'media'),
        clusters: [] // Clusters would need to be stored separately or recalculated
    };
};
