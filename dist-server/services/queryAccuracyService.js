/**
 * Query Accuracy Service
 * Centralized service for tracking and improving query accuracy
 */
import { mongoService } from '../server/services/mongoService.js';
/**
 * Calculate overall quality score for a query result
 */
export const scoreQueryResult = (query, result, metadata) => {
    const scores = {
        overall: 0,
        completeness: 0,
        relevance: 0,
        freshness: 0,
        provenance: 0
    };
    // 1. Completeness Score (0-100)
    // Check if result has expected structure
    let expectedFields = 0;
    let presentFields = 0;
    if (result.analytics) {
        expectedFields += 5; // clusters, creators, brands, topics, root
        if (result.analytics.clusters)
            presentFields++;
        if (result.analytics.creators)
            presentFields++;
        if (result.analytics.brands)
            presentFields++;
        if (result.analytics.topics)
            presentFields++;
        if (result.root)
            presentFields++;
    }
    scores.completeness = expectedFields > 0 ? (presentFields / expectedFields) * 100 : 0;
    // 2. Relevance Score (0-100)
    // Check if miner audit passed
    if (metadata?.minerAudit) {
        scores.relevance = metadata.minerAudit.passed ? 90 : 50;
        // Adjust based on number of issues
        const issueCount = metadata.minerAudit.issues?.length || 0;
        scores.relevance -= Math.min(issueCount * 10, 40);
    }
    else {
        scores.relevance = 70; // Default if no audit
    }
    // 3. Freshness Score (0-100)
    // Check data recency
    if (metadata?.createdAt) {
        const ageInDays = Math.floor((Date.now() - new Date(metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (ageInDays <= 1)
            scores.freshness = 100;
        else if (ageInDays <= 7)
            scores.freshness = 90;
        else if (ageInDays <= 30)
            scores.freshness = 70;
        else if (ageInDays <= 90)
            scores.freshness = 50;
        else
            scores.freshness = 30;
    }
    else {
        scores.freshness = 100; // Assume fresh if just created
    }
    // 4. Provenance Score (0-100)
    // Check how many nodes have source attribution
    let totalNodes = 0;
    let nodesWithProvenance = 0;
    const checkProvenance = (obj) => {
        if (!obj || typeof obj !== 'object')
            return;
        if (obj.type === 'creator' || obj.type === 'brand' || obj.type === 'topic') {
            totalNodes++;
            if (obj.data?.evidence || obj.data?.citation || obj.data?.provenance) {
                nodesWithProvenance++;
            }
        }
        // Recurse
        if (Array.isArray(obj)) {
            obj.forEach(item => checkProvenance(item));
        }
        else {
            Object.values(obj).forEach(v => checkProvenance(v));
        }
    };
    if (result.analytics) {
        checkProvenance(result.analytics);
    }
    if (result.root) {
        checkProvenance(result.root);
    }
    scores.provenance = totalNodes > 0 ? (nodesWithProvenance / totalNodes) * 100 : 0;
    // 5. Overall Score (weighted average)
    scores.overall = Math.round(scores.completeness * 0.25 +
        scores.relevance * 0.35 +
        scores.freshness * 0.15 +
        scores.provenance * 0.25);
    return scores;
};
/**
 * Calculate confidence score for a query result
 */
export const calculateConfidence = (query, result, metadata) => {
    const confidence = {
        score: 0,
        factors: [],
        lowConfidenceAreas: []
    };
    let baseScore = 70; // Start with moderate confidence
    // Factor 1: Data volume
    const nodeCount = countNodes(result);
    if (nodeCount >= 50) {
        baseScore += 15;
        confidence.factors.push('Rich dataset with 50+ nodes');
    }
    else if (nodeCount >= 20) {
        baseScore += 5;
        confidence.factors.push('Moderate dataset with 20+ nodes');
    }
    else {
        baseScore -= 10;
        confidence.factors.push('Limited dataset (<20 nodes)');
        confidence.lowConfidenceAreas.push('Low node count');
    }
    // Factor 2: Miner audit
    if (metadata?.minerAudit?.passed) {
        baseScore += 10;
        confidence.factors.push('Passed quality audit');
    }
    else if (metadata?.minerAudit?.passed === false) {
        baseScore -= 15;
        confidence.factors.push('Failed quality audit');
        confidence.lowConfidenceAreas.push('Quality audit failed');
    }
    // Factor 3: Provenance completeness
    const qualityScore = scoreQueryResult(query, result, metadata);
    if (qualityScore.provenance >= 80) {
        baseScore += 10;
        confidence.factors.push('Strong provenance (80%+)');
    }
    else if (qualityScore.provenance < 50) {
        baseScore -= 10;
        confidence.factors.push('Weak provenance (<50%)');
        confidence.lowConfidenceAreas.push('Missing source attribution');
    }
    // Factor 4: Query complexity
    const isComplexQuery = query.split(' ').length > 5 || query.includes('compare') || query.includes('overlap');
    if (isComplexQuery) {
        baseScore -= 5;
        confidence.factors.push('Complex query - results may vary');
    }
    confidence.score = Math.max(0, Math.min(100, baseScore));
    return confidence;
};
/**
 * Track user feedback for a query
 */
export const trackQueryFeedback = async (jobId, userId, query, feedback) => {
    try {
        if (!mongoService.isConnected()) {
            console.warn('[QueryAccuracy] MongoDB not connected, skipping feedback tracking');
            return;
        }
        const db = mongoService.getDb();
        // Store in query_feedback collection
        await db.collection('query_feedback').insertOne({
            jobId,
            userId,
            query,
            feedback,
            timestamp: new Date()
        });
        // Update job with feedback
        await mongoService.updateJob(jobId, {
            metadata: { userFeedback: feedback }
        });
        console.log(`[QueryAccuracy] Feedback tracked for job ${jobId}`);
    }
    catch (error) {
        console.error('[QueryAccuracy] Failed to track feedback:', error);
    }
};
/**
 * Generate query refinement suggestions
 */
export const getQuerySuggestions = (query, result, qualityScore) => {
    const suggestions = [];
    // Suggestion 1: If completeness is low, suggest being more specific
    if (qualityScore.completeness < 60) {
        suggestions.push({
            type: 'refinement',
            suggestion: 'Add specific Instagram handles or hashtags to your query',
            reasoning: 'More specific queries yield more complete results',
            expectedImprovement: 25
        });
    }
    // Suggestion 2: If freshness is low, suggest fresh scrape
    if (qualityScore.freshness < 50) {
        suggestions.push({
            type: 'refinement',
            suggestion: 'Enable "Fresh scrape" to get the latest data',
            reasoning: 'Current results are based on older cached data',
            expectedImprovement: 30
        });
    }
    // Suggestion 3: If provenance is low, suggest different query type
    if (qualityScore.provenance < 50) {
        suggestions.push({
            type: 'alternative',
            suggestion: 'Try a more specific query like "who follows @username"',
            reasoning: 'Direct queries provide better source attribution',
            expectedImprovement: 20
        });
    }
    // Suggestion 4: Expansion suggestions based on query type
    if (query.toLowerCase().includes('follow')) {
        suggestions.push({
            type: 'expansion',
            suggestion: 'Also explore "what brands do these followers like"',
            reasoning: 'Discover brand affinities in the audience',
            expectedImprovement: 15
        });
    }
    // Sort by expected improvement
    return suggestions.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
};
/**
 * Get accuracy metrics for a time range
 */
export const getAccuracyMetrics = async (timeRange) => {
    try {
        if (!mongoService.isConnected()) {
            throw new Error('MongoDB not connected');
        }
        const db = mongoService.getDb();
        // Get all feedback in time range
        const feedbackDocs = await db.collection('query_feedback')
            .find({
            timestamp: { $gte: timeRange.start, $lte: timeRange.end }
        })
            .toArray();
        // Get all jobs in time range
        const jobs = await db.collection('jobs')
            .find({
            createdAt: { $gte: timeRange.start, $lte: timeRange.end },
            status: 'completed'
        })
            .toArray();
        // Calculate metrics
        const totalQueries = jobs.length;
        const helpfulCount = feedbackDocs.filter(f => f.feedback.helpful === true).length;
        const helpfulPercentage = feedbackDocs.length > 0
            ? (helpfulCount / feedbackDocs.length) * 100
            : 0;
        // Average quality and confidence from jobs
        let totalQuality = 0;
        let totalConfidence = 0;
        let jobsWithScores = 0;
        jobs.forEach(job => {
            if (job.qualityScore !== undefined) {
                totalQuality += job.qualityScore;
                jobsWithScores++;
            }
            if (job.confidenceScore !== undefined) {
                totalConfidence += job.confidenceScore;
            }
        });
        const averageQuality = jobsWithScores > 0 ? totalQuality / jobsWithScores : 0;
        const averageConfidence = jobsWithScores > 0 ? totalConfidence / jobsWithScores : 0;
        // Common issues
        const issueMap = new Map();
        feedbackDocs.forEach(f => {
            f.feedback.categories?.forEach((category) => {
                issueMap.set(category, (issueMap.get(category) || 0) + 1);
            });
        });
        const commonIssues = Array.from(issueMap.entries())
            .map(([issue, count]) => ({ issue, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        return {
            averageQuality: Math.round(averageQuality),
            averageConfidence: Math.round(averageConfidence),
            totalQueries,
            helpfulPercentage: Math.round(helpfulPercentage),
            commonIssues
        };
    }
    catch (error) {
        console.error('[QueryAccuracy] Failed to get metrics:', error);
        return {
            averageQuality: 0,
            averageConfidence: 0,
            totalQueries: 0,
            helpfulPercentage: 0,
            commonIssues: []
        };
    }
};
/**
 * Identify low confidence areas in a result
 */
export const identifyLowConfidenceAreas = (result) => {
    const issues = [];
    // Check for missing profile pictures
    let nodesWithoutPics = 0;
    let totalProfileNodes = 0;
    const checkNode = (obj) => {
        if (!obj || typeof obj !== 'object')
            return;
        if (obj.type === 'creator' || obj.type === 'brand') {
            totalProfileNodes++;
            if (!obj.data?.profilePicUrl) {
                nodesWithoutPics++;
            }
        }
        // Recurse
        if (Array.isArray(obj)) {
            obj.forEach(item => checkNode(item));
        }
        else {
            Object.values(obj).forEach(v => checkNode(v));
        }
    };
    checkNode(result);
    if (totalProfileNodes > 0 && nodesWithoutPics / totalProfileNodes > 0.3) {
        issues.push(`${Math.round((nodesWithoutPics / totalProfileNodes) * 100)}% of profiles missing pictures`);
    }
    // Check for generic/placeholder names
    const genericNames = ['Unknown', 'User', 'Profile', 'Account'];
    let genericCount = 0;
    const checkGeneric = (obj) => {
        if (!obj || typeof obj !== 'object')
            return;
        if (obj.label && genericNames.some(g => obj.label.includes(g))) {
            genericCount++;
        }
        if (Array.isArray(obj)) {
            obj.forEach(item => checkGeneric(item));
        }
        else {
            Object.values(obj).forEach(v => checkGeneric(v));
        }
    };
    checkGeneric(result);
    if (genericCount > 5) {
        issues.push(`${genericCount} nodes with generic/placeholder names`);
    }
    // Check for missing handles
    let nodesWithoutHandles = 0;
    const checkHandles = (obj) => {
        if (!obj || typeof obj !== 'object')
            return;
        if ((obj.type === 'creator' || obj.type === 'brand') && !obj.handle && !obj.data?.handle) {
            nodesWithoutHandles++;
        }
        if (Array.isArray(obj)) {
            obj.forEach(item => checkHandles(item));
        }
        else {
            Object.values(obj).forEach(v => checkHandles(v));
        }
    };
    checkHandles(result);
    if (nodesWithoutHandles > 0) {
        issues.push(`${nodesWithoutHandles} nodes missing Instagram handles`);
    }
    return issues;
};
/**
 * Helper: Count total nodes in result
 */
const countNodes = (obj) => {
    if (!obj || typeof obj !== 'object')
        return 0;
    let count = 0;
    if (obj.type && (obj.type === 'creator' || obj.type === 'brand' || obj.type === 'topic' || obj.type === 'cluster')) {
        count = 1;
    }
    if (Array.isArray(obj)) {
        obj.forEach(item => {
            count += countNodes(item);
        });
    }
    else {
        Object.values(obj).forEach(v => {
            count += countNodes(v);
        });
    }
    return count;
};
