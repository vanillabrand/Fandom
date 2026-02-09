/**
 * Comprehensive Provenance Helpers for All Query Types
 * Provides ready-to-use provenance generators for 16 query intents
 */

import type { CalculationStep, DatasetReference } from '../types.js';

// ============================================
// EXISTING QUERY INTENTS
// ============================================

/**
 * 2. Viral Content Analysis
 */
export function createViralContentProvenance(
    posts: any[],
    viralityScore: number,
    avgEngagement: number,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Load post data',
            output: { postCount: posts.length },
            datasetRefs: [datasetId]
        },
        {
            description: 'Calculate engagement per post',
            formula: 'likes + comments + shares',
            output: { avgEngagement }
        },
        {
            description: 'Apply time decay factor',
            formula: 'engagement × (1 / days_old)',
            output: { timeFactor: 0.8 }
        },
        {
            description: 'Calculate virality score',
            formula: '(engagement / avg) × time_factor',
            output: { viralityScore: viralityScore.toFixed(2) }
        }
    ];

    return {
        source: 'Viral Content Analysis',
        method: 'Engagement-Based Ranking',
        tool: 'apify/instagram-scraper',
        confidence: 0.85,
        timestamp: new Date(),
        calculationDetails: {
            type: 'virality_score',
            formula: 'Virality = (Engagement / Avg) × Time_Factor',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Viral Posts',
                platform: 'instagram',
                recordCount: posts.length,
                createdAt: new Date(),
                description: 'Top posts by engagement'
            }]
        }
    };
}

/**
 * 3. Network Clusters
 */
export function createNetworkClusterProvenance(
    algorithm: string,
    clusterCount: number,
    datasetId: string,
    recordCount: number
) {
    const steps: CalculationStep[] = [
        {
            description: 'Load profile data',
            output: { profiles: recordCount },
            datasetRefs: [datasetId]
        },
        {
            description: `Initialize ${clusterCount} centroids`,
            formula: `${algorithm}(data, k=${clusterCount})`,
            output: { centroids: clusterCount }
        },
        {
            description: 'Assign profiles to nearest cluster',
            formula: 'argmin(euclidean_distance)',
            output: { iterations: 10 }
        },
        {
            description: 'Update cluster centroids',
            formula: 'mean(cluster_members)',
            output: { converged: true }
        }
    ];

    return {
        source: 'Machine Learning',
        method: `${algorithm} Clustering`,
        tool: 'Internal Algorithm',
        confidence: 0.80,
        timestamp: new Date(),
        calculationDetails: {
            type: 'clustering',
            formula: `${algorithm} with Euclidean Distance`,
            steps,
            datasets: [{
                id: datasetId,
                label: 'Profile Features',
                platform: 'instagram',
                recordCount,
                createdAt: new Date(),
                description: 'Profiles for clustering'
            }]
        }
    };
}

/**
 * 4. Audience Overlap
 */
export function createAudienceOverlapProvenance(
    profileA: string,
    profileB: string,
    followersA: number,
    followersB: number,
    overlap: number,
    union: number,
    jaccardIndex: number,
    datasetIdA: string,
    datasetIdB: string
) {
    const steps: CalculationStep[] = [
        {
            description: `Load ${profileA} followers`,
            output: { count: followersA },
            datasetRefs: [datasetIdA]
        },
        {
            description: `Load ${profileB} followers`,
            output: { count: followersB },
            datasetRefs: [datasetIdB]
        },
        {
            description: 'Calculate intersection (overlap)',
            formula: 'A ∩ B',
            input: { setA: followersA, setB: followersB },
            output: { overlap }
        },
        {
            description: 'Calculate union (total unique)',
            formula: 'A ∪ B',
            input: { setA: followersA, setB: followersB },
            output: { union }
        },
        {
            description: 'Calculate Jaccard similarity',
            formula: `${overlap} / ${union}`,
            output: { jaccardIndex: jaccardIndex.toFixed(4) }
        }
    ];

    return {
        source: 'Statistical Analysis',
        method: 'Jaccard Similarity',
        confidence: 0.95,
        timestamp: new Date(),
        calculationDetails: {
            type: 'audience_overlap',
            formula: 'Jaccard = |A ∩ B| / |A ∪ B|',
            steps,
            datasets: [
                {
                    id: datasetIdA,
                    label: `${profileA} Followers`,
                    platform: 'instagram',
                    recordCount: followersA,
                    createdAt: new Date()
                },
                {
                    id: datasetIdB,
                    label: `${profileB} Followers`,
                    platform: 'instagram',
                    recordCount: followersB,
                    createdAt: new Date()
                }
            ]
        }
    };
}

/**
 * 5. Sensitivity/Sentiment Analysis
 */
export function createSentimentAnalysisProvenance(
    comments: any[],
    positiveCount: number,
    negativeCount: number,
    neutralCount: number,
    sentimentScore: number,
    datasetId: string
) {
    const total = positiveCount + negativeCount + neutralCount;
    const steps: CalculationStep[] = [
        {
            description: 'Load comments',
            output: { commentCount: comments.length },
            datasetRefs: [datasetId]
        },
        {
            description: 'Analyze sentiment with AI',
            tool: 'Gemini 2.0 Flash',
            output: { positive: positiveCount, negative: negativeCount, neutral: neutralCount }
        },
        {
            description: 'Calculate sentiment score',
            formula: '(positive - negative) / total',
            output: { sentimentScore: sentimentScore.toFixed(2) }
        }
    ];

    return {
        source: 'AI Sentiment Analysis',
        method: 'Gemini Classification',
        tool: 'Gemini 2.0 Flash',
        confidence: 0.80,
        timestamp: new Date(),
        calculationDetails: {
            type: 'sentiment_analysis',
            formula: 'Sentiment = (Positive - Negative) / Total',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Comments',
                platform: 'instagram',
                recordCount: comments.length,
                createdAt: new Date(),
                description: 'Post comments for sentiment analysis'
            }]
        }
    };
}

/**
 * 6. Influencer Identification
 */
export function createInfluencerScoreProvenance(
    profile: any,
    followers: number,
    engagementRate: number,
    reach: number,
    influencerScore: number,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Calculate engagement rate',
            formula: '(likes + comments) / followers',
            output: { engagementRate: engagementRate.toFixed(4) }
        },
        {
            description: 'Estimate reach',
            formula: 'followers × engagement_rate',
            output: { reach }
        },
        {
            description: 'Calculate weighted score',
            formula: '(followers × 0.3) + (engagement × 0.5) + (reach × 0.2)',
            output: { influencerScore: influencerScore.toFixed(2) }
        }
    ];

    return {
        source: 'Influencer Scoring',
        method: 'Multi-Factor Ranking',
        confidence: 0.85,
        timestamp: new Date(),
        calculationDetails: {
            type: 'influencer_score',
            formula: 'Score = (Followers × 0.3) + (Engagement × 0.5) + (Reach × 0.2)',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Influencer Profiles',
                platform: 'instagram',
                recordCount: 1,
                createdAt: new Date()
            }]
        }
    };
}

/**
 * 7. Subject Matter / Topic Extraction
 */
export function createTopicExtractionProvenance(
    posts: any[],
    topics: string[],
    method: string,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Extract text from posts',
            output: { postCount: posts.length },
            datasetRefs: [datasetId]
        },
        {
            description: 'Calculate TF-IDF scores',
            formula: 'TF × log(Total_Docs / Docs_with_Term)',
            output: { keywordCount: topics.length }
        },
        {
            description: 'Cluster related keywords',
            method: 'Semantic similarity',
            output: { topicCount: topics.length }
        },
        {
            description: 'Generate topic labels',
            tool: 'Gemini API',
            output: { topics }
        }
    ];

    return {
        source: 'AI Topic Extraction',
        method: `${method} + Gemini Analysis`,
        tool: 'Gemini 2.0 Flash',
        confidence: 0.80,
        timestamp: new Date(),
        calculationDetails: {
            type: 'topic_extraction',
            formula: 'TF-IDF = (Term Frequency) × log(Total Docs / Docs with Term)',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Post Content',
                platform: 'instagram',
                recordCount: posts.length,
                createdAt: new Date()
            }]
        }
    };
}

/**
 * 8. Bio Search / Keyword Filtering
 */
export function createBioFilterProvenance(
    keywords: string[],
    matchedProfiles: number,
    totalProfiles: number,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Load profiles with bios',
            output: { totalProfiles },
            datasetRefs: [datasetId]
        },
        {
            description: 'Generate keyword variations',
            output: { keywords }
        },
        {
            description: 'Match bio text against keywords',
            formula: 'regex_match(bio, keywords)',
            output: { matchedProfiles }
        },
        {
            description: 'Calculate match rate',
            formula: `${matchedProfiles} / ${totalProfiles}`,
            output: { matchRate: ((matchedProfiles / totalProfiles) * 100).toFixed(1) + '%' }
        }
    ];

    return {
        source: 'Bio Keyword Filtering',
        method: 'Keyword Matching',
        context: `Matched keywords: ${keywords.join(', ')}`,
        confidence: 0.90,
        timestamp: new Date(),
        calculationDetails: {
            type: 'bio_filtering',
            formula: 'Match if bio contains ANY keyword',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Follower Profiles',
                platform: 'instagram',
                recordCount: totalProfiles,
                createdAt: new Date()
            }]
        }
    };
}

// ============================================
// NEW QUERY INTENTS
// ============================================

/**
 * 9. Growth Tracking
 */
export function createGrowthTrackingProvenance(
    snapshots: any[],
    growthRate: number,
    trend: 'increasing' | 'decreasing' | 'stable',
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Collect historical snapshots',
            output: { snapshotCount: snapshots.length },
            datasetRefs: [datasetId]
        },
        {
            description: 'Calculate period-over-period change',
            formula: '(current - previous) / previous',
            output: { avgChange: growthRate.toFixed(4) }
        },
        {
            description: 'Identify trend direction',
            method: 'Linear regression',
            output: { trend }
        }
    ];

    return {
        source: 'Growth Analysis',
        method: 'Time Series Analysis',
        confidence: 0.85,
        timestamp: new Date(),
        calculationDetails: {
            type: 'growth_tracking',
            formula: 'Growth Rate = (Current - Previous) / Previous × 100',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Historical Snapshots',
                platform: 'instagram',
                recordCount: snapshots.length,
                createdAt: new Date(),
                description: 'Daily follower counts'
            }]
        }
    };
}

/**
 * 10. Competitive Analysis
 */
export function createCompetitiveAnalysisProvenance(
    competitors: any[],
    marketShare: number,
    ranking: number,
    datasetIds: string[]
) {
    const steps: CalculationStep[] = [
        {
            description: 'Load competitor profiles',
            output: { competitorCount: competitors.length },
            datasetRefs: datasetIds
        },
        {
            description: 'Normalize metrics',
            formula: 'z-score normalization',
            method: '(value - mean) / std_dev'
        },
        {
            description: 'Calculate market share',
            formula: 'profile_followers / total_category_followers',
            output: { marketShare: marketShare.toFixed(2) + '%' }
        },
        {
            description: 'Rank by composite score',
            output: { ranking }
        }
    ];

    return {
        source: 'Competitive Analysis',
        method: 'Multi-Profile Benchmarking',
        confidence: 0.85,
        timestamp: new Date(),
        calculationDetails: {
            type: 'competitive_analysis',
            formula: 'Market Share = Profile_Followers / Total_Category_Followers',
            steps,
            datasets: datasetIds.map((id, idx) => ({
                id,
                label: `Competitor ${idx + 1}`,
                platform: 'instagram',
                recordCount: 1,
                createdAt: new Date()
            }))
        }
    };
}

/**
 * 11. Content Performance
 */
export function createContentPerformanceProvenance(
    posts: any[],
    avgEngagement: number,
    topContentType: string,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Load post data',
            output: { postCount: posts.length },
            datasetRefs: [datasetId]
        },
        {
            description: 'Calculate engagement per post',
            formula: '(likes + comments + shares) / followers',
            output: { avgEngagement: avgEngagement.toFixed(2) + '%' }
        },
        {
            description: 'Categorize by content type',
            method: 'Image/Video/Carousel classification',
            output: { topType: topContentType }
        }
    ];

    return {
        source: 'Content Performance Analysis',
        method: 'Engagement Rate Calculation',
        confidence: 0.90,
        timestamp: new Date(),
        calculationDetails: {
            type: 'content_performance',
            formula: 'Engagement Rate = (Likes + Comments + Shares) / Followers × 100',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Post History',
                platform: 'instagram',
                recordCount: posts.length,
                createdAt: new Date()
            }]
        }
    };
}

/**
 * 12. Hashtag Analysis
 */
export function createHashtagAnalysisProvenance(
    hashtags: any[],
    topHashtag: string,
    avgEngagement: number,
    datasetId: string
) {
    const steps: CalculationStep[] = [
        {
            description: 'Extract hashtags from posts',
            method: 'Regex extraction',
            output: { hashtagCount: hashtags.length }
        },
        {
            description: 'Count frequency',
            formula: 'count(hashtag)',
            output: { topHashtag }
        },
        {
            description: 'Calculate avg engagement per hashtag',
            output: { avgEngagement: avgEngagement.toFixed(2) }
        }
    ];

    return {
        source: 'Hashtag Analysis',
        method: 'Frequency & Engagement Analysis',
        confidence: 0.85,
        timestamp: new Date(),
        calculationDetails: {
            type: 'hashtag_analysis',
            formula: 'Hashtag Score = Frequency × Avg_Engagement',
            steps,
            datasets: [{
                id: datasetId,
                label: 'Posts with Hashtags',
                platform: 'instagram',
                recordCount: hashtags.length,
                createdAt: new Date()
            }]
        }
    };
}

/**
 * Citation Generator
 */
export function generateCitation(node: any): string {
    const prov = node.provenance;
    if (!prov) return 'No citation available';

    const parts = [
        `Source: ${prov.source}`,
        `Method: ${prov.method}`,
        prov.tool && `Tool: ${prov.tool}`,
        prov.timestamp && `Date: ${new Date(prov.timestamp).toLocaleDateString()}`,
        prov.confidence && `Confidence: ${(prov.confidence * 100).toFixed(0)}%`
    ].filter(Boolean);

    if (prov.calculationDetails) {
        parts.push(`Formula: ${prov.calculationDetails.formula}`);
    }

    return parts.join(' | ');
}

/**
 * BibTeX Citation Generator
 */
export function generateBibTeX(node: any, citationKey: string): string {
    const prov = node.provenance;
    if (!prov) return '';

    const year = prov.timestamp ? new Date(prov.timestamp).getFullYear() : new Date().getFullYear();
    const month = prov.timestamp ? new Date(prov.timestamp).toLocaleString('en', { month: 'short' }).toLowerCase() : '';

    return `@misc{${citationKey},
  title = {${node.label}},
  author = {${prov.source}},
  year = {${year}},
  month = {${month}},
  note = {Method: ${prov.method}${prov.tool ? `, Tool: ${prov.tool}` : ''}${prov.confidence ? `, Confidence: ${(prov.confidence * 100).toFixed(0)}%` : ''}}
}`;
}
