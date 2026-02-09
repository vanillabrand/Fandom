/**
 * Query Validation Service
 * Analyzes NLP queries and matches them to available datasets
 */
import { getDatasetSummaries, getDataset } from './datasetService.js';
import { searchDataset } from './vectorService.js';
// Query intent patterns
const INTENT_PATTERNS = {
    followers: [
        /who follows/i,
        /followers of/i,
        /follower list/i,
        /audience of/i,
        /fan base/i
    ],
    following: [
        /who does .+ follow/i,
        /following list/i,
        /accounts followed by/i,
        /what .+ follows/i
    ],
    overindexed: [
        /over.?index/i,
        /common follow/i,
        /also follow/i,
        /shared audience/i,
        /overlap/i,
        /what creators/i,
        /which brands/i,
        /popular among followers/i
    ],
    posts: [
        /content from/i,
        /posts by/i,
        /recent videos/i,
        /media from/i
    ],
    profiles: [
        /profile info/i,
        /account details/i,
        /bio of/i,
        /lookup user/i
    ],
    bio_search: [
        /find profiles who are/i,
        /find developers/i,
        /find designers/i,
        /find founders/i,
        /who are/i,
        /search bios/i,
        /profiles that have/i
    ],
    topic_analysis: [
        /what subtopics/i,
        /talking about/i,
        /discussing/i,
        /interested in/i,
        /hashtags/i,
        /common themes/i,
        /language/i,
        /lexicon/i,
        /slang/i
    ],
    comparison: [
        /compare/i,
        /difference between/i,
        /versus/i,
        /vs/i,
        /overlap between/i
    ],
    geo_discovery: [
        /where are/i,
        /location/i,
        /geography/i,
        /cities/i,
        /countries/i,
        /map of/i,
        /fan density/i
    ]
};
// Keywords indicating AI/search might be better
const AI_PREFERRED_KEYWORDS = [
    'trend',
    'subculture',
    'emerging',
    'rising',
    'sentiment',
    'aesthetic',
    'style',
    'vibe',
    'category',
    'narrative'
];
// Common abbreviations and their expansions
const QUERY_ABBREVIATIONS = {
    'ig': 'instagram',
    'insta': 'instagram',
    'tt': 'tiktok',
    'tik tok': 'tiktok',
    'ppl': 'people',
    'ppl who': 'people who',
    'whos': 'who is',
    'whats': 'what is',
    'hows': 'how is'
};
// Common typos and corrections
const COMMON_TYPOS = {
    'folows': 'follows',
    'follwers': 'followers',
    'followrs': 'followers',
    'creaters': 'creators',
    'influencers': 'influencers',
    'overindex': 'over-index'
};
/**
 * Preprocess and normalize query before analysis
 */
export const preprocessQuery = (input) => {
    if (!input)
        return "";
    let processed = input.toLowerCase().trim();
    // 1. Expand abbreviations
    Object.entries(QUERY_ABBREVIATIONS).forEach(([abbr, full]) => {
        const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
        processed = processed.replace(regex, full);
    });
    // 2. Fix common typos
    Object.entries(COMMON_TYPOS).forEach(([typo, correct]) => {
        const regex = new RegExp(`\\b${typo}\\b`, 'gi');
        processed = processed.replace(regex, correct);
    });
    // 3. Normalize handle format (ensure @ prefix)
    processed = processed.replace(/\b(instagram\.com\/|@?)([a-z0-9_.]+)\b/gi, '@$2');
    // 4. Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    return processed;
};
/**
 * Sanitize input to prevent injection and remove noise
 */
export const sanitizeInput = (input) => {
    if (!input)
        return "";
    // 1. Remove dangerous SQL/Script injection patterns
    // (Basic heuristic blocklist)
    let clean = input
        .replace(/--/g, "")
        .replace(/;/g, "")
        .replace(/\/\*/g, "")
        .replace(/\*\//g, "")
        .replace(/<script>/gi, "")
        .replace(/<\/script>/gi, "")
        .replace(/UNION SELECT/gi, "") // SQLi
        .replace(/DROP TABLE/gi, "")
        .replace(/OR 1=1/gi, "");
    // 2. Normalize Whitespace
    clean = clean.replace(/\s+/g, " ").trim();
    // 3. Truncate (prevent buffer overflow DoS)
    return clean.substring(0, 500);
};
/**
 * Analyze a natural language query to extract intent (with multi-intent support)
 */
export const analyzeQuery = (query) => {
    // First preprocess the query
    const preprocessed = preprocessQuery(query);
    const cleanQuery = sanitizeInput(preprocessed);
    const lowercaseQuery = cleanQuery.toLowerCase();
    const requiredDataTypes = [];
    const intentScores = {};
    // Check for data type requirements with scoring
    for (const [dataType, patterns] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;
        patterns.forEach(pattern => {
            if (pattern.test(cleanQuery)) {
                score++;
            }
        });
        if (score > 0) {
            requiredDataTypes.push(dataType);
            intentScores[dataType] = score;
        }
    }
    // Determine primary intent (highest score)
    let intent = 'general';
    if (Object.keys(intentScores).length > 0) {
        intent = Object.entries(intentScores)
            .sort(([, a], [, b]) => b - a)[0][0];
    }
    // Special case: comparison queries
    if (/\bcompare\b|\bvs\b|\bversus\b|\bdifference between\b/i.test(cleanQuery)) {
        intent = 'comparison';
        if (!requiredDataTypes.includes('comparison')) {
            requiredDataTypes.push('comparison');
        }
    }
    // Over-indexing analysis requires both followers and following data
    if (requiredDataTypes.includes('overindexed')) {
        if (!requiredDataTypes.includes('followers')) {
            requiredDataTypes.push('followers');
        }
        if (!requiredDataTypes.includes('following')) {
            requiredDataTypes.push('following');
        }
    }
    // Extract platform if mentioned (now handles abbreviations)
    let platform;
    if (/instagram/i.test(lowercaseQuery)) {
        platform = 'instagram';
    }
    else if (/tiktok/i.test(lowercaseQuery)) {
        platform = 'tiktok';
    }
    // Extract username if mentioned (improved pattern matching)
    let targetProfile;
    const usernameMatch = cleanQuery.match(/@([a-z0-9_.]+)/i);
    if (usernameMatch) {
        targetProfile = usernameMatch[1];
    }
    return {
        originalQuery: query,
        intent,
        requiredDataTypes: requiredDataTypes.length > 0 ? requiredDataTypes : ['followers'],
        targetProfile,
        platform
    };
};
/**
 * Find datasets that match a query's requirements
 */
export const findMatchingDatasets = async (queryAnalysis) => {
    const allDatasets = await getDatasetSummaries();
    const matches = [];
    for (const dataset of allDatasets) {
        let relevanceScore = 0;
        let coverageScore = 0;
        const reasons = [];
        // Check platform match
        if (!queryAnalysis.platform || dataset.platform === queryAnalysis.platform) {
            relevanceScore += 20;
            reasons.push('Platform matches');
        }
        // Check target profile match
        if (queryAnalysis.targetProfile) {
            if (dataset.targetProfile.toLowerCase() === queryAnalysis.targetProfile.toLowerCase()) {
                relevanceScore += 40;
                reasons.push('Target profile exact match');
            }
            else if (dataset.targetProfile.toLowerCase().includes(queryAnalysis.targetProfile.toLowerCase())) {
                relevanceScore += 20;
                reasons.push('Target profile partial match');
            }
        }
        else {
            // No specific profile mentioned, still somewhat relevant
            relevanceScore += 10;
        }
        // Check data type match
        if (queryAnalysis.requiredDataTypes.includes(dataset.dataType)) {
            relevanceScore += 30;
            coverageScore += 50;
            reasons.push(`Has ${dataset.dataType} data`);
        }
        // Check data freshness (more recent = higher score)
        const daysSinceCreation = Math.floor((Date.now() - new Date(dataset.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation <= 7) {
            relevanceScore += 10;
            coverageScore += 10;
            reasons.push('Fresh data (within 7 days)');
        }
        else if (daysSinceCreation <= 30) {
            relevanceScore += 5;
            coverageScore += 5;
            reasons.push('Recent data (within 30 days)');
        }
        // Check data volume
        if (dataset.recordCount >= 1000) {
            coverageScore += 20;
            reasons.push('Large dataset');
        }
        else if (dataset.recordCount >= 100) {
            coverageScore += 10;
            reasons.push('Medium dataset');
        }
        // Check vector search relevance for top candidates
        // Only run if basic relevance is decent to save API calls
        if (relevanceScore > 20 && dataset.id) { // We need full dataset for vector search
            try {
                // We need the full dataset object to check vector index
                // Optimization: In real app, we might have vector status in summary
                const fullDataset = await getDataset(dataset.id);
                if (fullDataset && fullDataset.vectorIndex?.enabled) {
                    reasons.push('Vector index available');
                    // Perform semantic search
                    const searchResult = await searchDataset(fullDataset, queryAnalysis.originalQuery, 1);
                    if (searchResult.matches.length > 0 && searchResult.matches[0].score > 0.6) {
                        relevanceScore += 30;
                        reasons.push(`Semantic match detected (${Math.round(searchResult.matches[0].score * 100)}%)`);
                    }
                }
            }
            catch (e) {
                // Ignore vector search errors during validation
                console.warn("Vector check failed", e);
            }
        }
        // Only include if there's some relevance
        if (relevanceScore >= 30) {
            matches.push({
                dataset,
                relevanceScore: Math.min(relevanceScore, 100),
                coverageScore: Math.min(coverageScore, 100),
                reasoning: reasons.join('; ')
            });
        }
    }
    // Sort by relevance score
    return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
};
/**
 * Calculate accuracy indicator based on query and matching datasets
 */
export const calculateAccuracy = (query, matches) => {
    const factors = [];
    let score = 0;
    // Base score from best matching dataset
    if (matches.length > 0) {
        const bestMatch = matches[0];
        score = Math.floor((bestMatch.relevanceScore + bestMatch.coverageScore) / 2);
        factors.push(`Best dataset match: ${bestMatch.dataset.name}`);
    }
    else {
        factors.push('No matching datasets found');
    }
    // Check if all required data types are covered
    const coveredTypes = new Set(matches.map(m => m.dataset.dataType));
    const missingTypes = query.requiredDataTypes.filter(dt => !coveredTypes.has(dt));
    if (missingTypes.length === 0) {
        score += 20;
        factors.push('All required data types available');
    }
    else {
        score -= 20;
        factors.push(`Missing data types: ${missingTypes.join(', ')}`);
    }
    // Check query complexity
    if (query.requiredDataTypes.includes('overindexed')) {
        // Over-indexing is complex - requires multiple datasets
        const hasFollowers = matches.some(m => m.dataset.dataType === 'followers');
        const hasFollowing = matches.some(m => m.dataset.dataType === 'following');
        if (hasFollowers && hasFollowing) {
            score += 20;
            factors.push('Has both followers and following data for over-indexing');
        }
        else {
            score -= 30;
            factors.push('Missing data for over-indexing analysis');
        }
    }
    // Determine level
    let level;
    if (score >= 70) {
        level = 'high';
    }
    else if (score >= 40) {
        level = 'medium';
    }
    else {
        level = 'low';
    }
    return {
        score: Math.max(0, Math.min(100, score)),
        level,
        factors
    };
};
/**
 * Calculate probability of success for a query
 */
export const calculateSuccessProbability = (query, matches, accuracy) => {
    let probability = accuracy.score;
    let reasoning = '';
    // Adjust based on query specificity
    if (query.targetProfile) {
        const exactMatch = matches.some(m => m.dataset.targetProfile.toLowerCase() === query.targetProfile?.toLowerCase());
        if (exactMatch) {
            probability += 15;
            reasoning = 'Exact profile match found in datasets. ';
        }
    }
    // Check if AI/search might be more appropriate
    const queryWords = query.originalQuery.toLowerCase().split(/\s+/);
    const aiKeywordCount = queryWords.filter(w => AI_PREFERRED_KEYWORDS.includes(w)).length;
    if (aiKeywordCount >= 2) {
        probability -= 10;
        reasoning += 'Query contains subjective terms better suited for AI analysis. ';
    }
    // Determine confidence
    let confidence;
    if (matches.length >= 2 && accuracy.level === 'high') {
        confidence = 'high';
        reasoning += 'Multiple relevant datasets available.';
    }
    else if (matches.length >= 1 && accuracy.level !== 'low') {
        confidence = 'medium';
        reasoning += 'Some relevant data available.';
    }
    else {
        confidence = 'low';
        reasoning += 'Limited data availability - consider creating new dataset.';
    }
    return {
        probability: Math.max(0, Math.min(100, probability)),
        confidence,
        reasoning: reasoning.trim()
    };
};
/**
 * Generate approach suggestions for handling a query
 */
export const suggestApproaches = (query, matches, accuracy) => {
    const suggestions = [];
    // Dataset approach
    if (matches.length > 0 && accuracy.score >= 40) {
        suggestions.push({
            type: 'dataset',
            weight: accuracy.score / 100,
            description: `Use pre-scraped data from ${matches.length} matching dataset(s)`
        });
    }
    // AI approach
    const queryWords = query.originalQuery.toLowerCase().split(/\s+/);
    const hasAiKeywords = queryWords.some(w => AI_PREFERRED_KEYWORDS.includes(w));
    if (hasAiKeywords || accuracy.score < 60) {
        suggestions.push({
            type: 'ai',
            weight: hasAiKeywords ? 0.6 : 0.3,
            description: 'Use AI analysis for subjective/trend-based insights'
        });
    }
    // Search approach
    if (accuracy.score < 50) {
        suggestions.push({
            type: 'search',
            weight: 0.2,
            description: 'Supplement with Google Search for broader context'
        });
    }
    // Suggest creating new dataset if needed
    if (accuracy.score < 40 && query.targetProfile) {
        const platform = query.platform || 'instagram';
        const missingTypes = query.requiredDataTypes.filter(dt => !matches.some(m => m.dataset.dataType === dt));
        if (missingTypes.length > 0) {
            suggestions.push({
                type: 'dataset',
                weight: 0.8,
                description: `Create new ${missingTypes.join(' + ')} dataset for higher accuracy`,
                requiredDataset: {
                    platform,
                    dataType: missingTypes[0],
                    targetProfile: query.targetProfile,
                    estimatedRecords: 1000
                }
            });
        }
    }
    // Sort by weight
    return suggestions.sort((a, b) => b.weight - a.weight);
};
/**
 * Main validation function - combines all analysis
 */
export const validateQuery = async (query, targetProfile, platform) => {
    // Analyze the query
    const queryAnalysis = analyzeQuery(query);
    // Override with explicit parameters if provided
    if (targetProfile) {
        queryAnalysis.targetProfile = targetProfile;
    }
    if (platform) {
        queryAnalysis.platform = platform;
    }
    // Find matching datasets
    const matchingDatasets = await findMatchingDatasets(queryAnalysis);
    // Calculate accuracy
    const accuracy = calculateAccuracy(queryAnalysis, matchingDatasets);
    // Calculate success probability
    const successProbability = calculateSuccessProbability(queryAnalysis, matchingDatasets, accuracy);
    // Generate suggestions
    const suggestedApproaches = suggestApproaches(queryAnalysis, matchingDatasets, accuracy);
    // Determine if we can proceed
    const canProceed = accuracy.score >= 30 || suggestedApproaches.some(s => s.type === 'ai');
    // Generate warnings
    const warnings = [];
    if (accuracy.level === 'low') {
        warnings.push('Low accuracy expected - consider creating new dataset');
    }
    if (!queryAnalysis.targetProfile) {
        warnings.push('No target profile specified - results may be generic');
    }
    const datasetAge = matchingDatasets.length > 0
        ? Math.floor((Date.now() - new Date(matchingDatasets[0].dataset.createdAt).getTime()) /
            (1000 * 60 * 60 * 24))
        : null;
    if (datasetAge && datasetAge > 30) {
        warnings.push('Dataset is over 30 days old - consider refreshing');
    }
    return {
        query: queryAnalysis,
        matchingDatasets,
        accuracy,
        successProbability,
        suggestedApproaches,
        canProceed,
        warnings
    };
};
/**
 * Quick check if a query can be answered with existing data
 */
export const canAnswerQuery = async (query, targetProfile, platform) => {
    const result = await validateQuery(query, targetProfile, platform);
    return result.canProceed && result.accuracy.level !== 'low';
};
/**
 * Get required dataset spec for a query that can't be answered
 */
export const getRequiredDataset = async (query, targetProfile, platform) => {
    const result = await validateQuery(query, targetProfile, platform);
    const datasetSuggestion = result.suggestedApproaches.find(s => s.requiredDataset);
    if (datasetSuggestion?.requiredDataset) {
        return {
            dataType: datasetSuggestion.requiredDataset.dataType,
            estimatedRecords: datasetSuggestion.requiredDataset.estimatedRecords,
            reasoning: datasetSuggestion.description
        };
    }
    // Default suggestion if we can't determine specifics
    if (result.accuracy.level === 'low') {
        return {
            dataType: 'followers',
            estimatedRecords: 1000,
            reasoning: 'Scrape followers data to enable accurate analysis'
        };
    }
    return null;
};
