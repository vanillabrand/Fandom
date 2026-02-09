/**
 * Transforms a generic dataset into a Subject Matter Graph.
 *
 * Logic:
 * 1. If the dataset already contains 'semantic_matches' (from Deep Search), use those directly.
 * 2. If not, we must infer topics from the content (Simple Keyword Extraction as fallback,
 *    or rely on the fact that 'analyzeBatch' might have run).
 *
 * For this implementation, we assume the Orchestrator has ALREADY enriched the dataset
 * with an 'analytics' object containing 'topics' or 'matches'.
 *
 * IF NOT, we perform a lightweight client-side extraction (Fallback).
 */
export const transformToSubjectGraph = (dataset) => {
    // 1. Check for Pre-computed Analytics (Preferred)
    const analytics = dataset.analytics || {};
    const aiMatches = analytics.visualAnalysis?.matches || analytics.matches || [];
    // If we have AI matches, building the graph is easy
    if (aiMatches.length > 0) {
        return buildGraphFromAiMatches(dataset, aiMatches);
    }
    // 2. Fallback: Heuristic Extraction from Posts/Comments
    console.log("Subject Matter Graph: No AI matches found. Using Heuristic Extraction.");
    return buildGraphHeuristically(dataset);
};
const buildGraphFromAiMatches = (dataset, matches) => {
    const nodes = [];
    const links = [];
    const addedNodeIds = new Set();
    // 1. Main Node (The Search Root)
    const rootId = 'MAIN';
    nodes.push({
        id: rootId,
        label: dataset.targetProfile || 'Query',
        group: 'main',
        val: 50,
        level: 0,
        // [FIX] Inject Profile Image for Texture Rendering
        profilePic: (dataset.metadata && dataset.metadata.targetProfilePic) ? dataset.metadata.targetProfilePic : undefined,
        data: {
            profilePicUrl: (dataset.metadata && dataset.metadata.targetProfilePic) ? dataset.metadata.targetProfilePic : undefined
        }
    });
    addedNodeIds.add(rootId);
    // 2. Extract Unique Topics
    const uniqueTopics = new Map();
    matches.forEach(m => {
        const topic = m.matchedContent || m.topic;
        const category = m.category || 'General';
        const sentiment = typeof m.sentiment === 'number' ? m.sentiment : 0;
        if (!topic)
            return;
        const key = topic.toLowerCase();
        if (!uniqueTopics.has(key)) {
            uniqueTopics.set(key, { category, sentimentSum: 0, count: 0, originalLabel: topic });
        }
        const entry = uniqueTopics.get(key);
        entry.sentimentSum += sentiment;
        entry.count++;
    });
    // 3. Create Topic Nodes
    uniqueTopics.forEach((data, key) => {
        const nodeId = `topic_${key.replace(/[^a-z0-9]/g, '')}`;
        const avgSentiment = data.count > 0 ? data.sentimentSum / data.count : 0;
        if (!addedNodeIds.has(nodeId)) {
            nodes.push({
                id: nodeId,
                label: data.originalLabel, // Use preserved original casing
                group: 'overindexed', // Reuse 'overindexed' styling for now (Orange/Distinct)
                val: 20 + (data.count * 2), // Size based on frequency
                level: 1,
                isInsight: true,
                value: data.count, // [FIX] Store raw occurrence count for Inspector
                sentiment: avgSentiment,
                color: getSentimentColor(avgSentiment)
            });
            addedNodeIds.add(nodeId);
            // Link to Main
            links.push({
                source: rootId,
                target: nodeId,
                value: 5 + data.count
            });
        }
    });
    // 4. (Optional) Add User Nodes that are linked to these topics
    // If the matches contain 'username', we can link User -> Topic
    matches.forEach(m => {
        if (m.username) {
            const topicKey = (m.matchedContent || m.topic || '').toLowerCase();
            const topicNodeId = `topic_${topicKey.replace(/[^a-z0-9]/g, '')}`;
            const userId = `user_${m.username}`;
            // Only add user if the Topic Exists
            if (addedNodeIds.has(topicNodeId)) {
                // Check if user node exists, if not create
                if (!addedNodeIds.has(userId)) {
                    // [FIX] Enrich User Node with Real Stats from Dataset
                    const userRecord = dataset.data.find((r) => (r.username === m.username || r.ownerUsername === m.username));
                    nodes.push({
                        id: userId,
                        label: userRecord?.fullName || `@${m.username}`, // [FIX] Use Full Name
                        group: 'creator', // Use creator style for users in this view
                        val: 5,
                        level: 2,
                        // [FIX] Inject User Stats
                        followersCount: userRecord?.followersCount || userRecord?.followers || 0,
                        followsCount: userRecord?.followsCount || userRecord?.followingCount || 0,
                        profilePic: userRecord?.profilePicUrl || userRecord?.profile_pic_url,
                        isVerified: userRecord?.isVerified,
                        // [FIX] Explicitly attach raw data for Entity Inspector
                        data: {
                            ...userRecord,
                            // Normalize fields for the inspector
                            followersCount: userRecord?.followersCount || userRecord?.followers || 0,
                            followingCount: userRecord?.followsCount || userRecord?.followingCount || 0,
                            fullName: userRecord?.fullName,
                            label: userRecord?.fullName || `@${m.username}`
                        }
                    });
                    addedNodeIds.add(userId);
                }
                // Link User -> Topic
                links.push({
                    source: userId,
                    target: topicNodeId,
                    value: 2
                });
            }
        }
    });
    return { nodes, links };
};
const buildGraphHeuristically = (dataset) => {
    const nodes = [];
    const links = [];
    // 1. Main Node
    nodes.push({
        id: 'MAIN',
        label: dataset.targetProfile || 'Analysis',
        group: 'main',
        val: 50,
        level: 0,
        // [FIX] Inject Profile Image for Texture Rendering
        profilePic: (dataset.metadata && dataset.metadata.targetProfilePic) ? dataset.metadata.targetProfilePic : undefined,
        data: {
            profilePicUrl: (dataset.metadata && dataset.metadata.targetProfilePic) ? dataset.metadata.targetProfilePic : undefined
        }
    });
    // 2. Extract Hashtags/Key terms from Content
    const data = dataset.data || [];
    const termFreq = new Map();
    data.forEach(item => {
        const text = item.caption || item.text || item.description || '';
        if (!text)
            return;
        // Extract Hashtags
        const hashtags = text.match(/#[a-zA-Z0-9_]+/g) || [];
        hashtags.forEach((t) => {
            const tag = t.toLowerCase();
            termFreq.set(tag, (termFreq.get(tag) || 0) + 1);
        });
    });
    // Filter Top Terms
    const topTerms = [...termFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15); // Top 15
    topTerms.forEach(([term, count]) => {
        const nodeId = `term_${term}`;
        nodes.push({
            id: nodeId,
            label: term,
            group: 'cluster', // Use cluster styling
            val: 10 + (count),
            level: 1
        });
        links.push({
            source: 'MAIN',
            target: nodeId,
            value: count
        });
    });
    return { nodes, links };
};
// Helper
const getSentimentColor = (score) => {
    if (score >= 0.3)
        return '#22c55e'; // Green
    if (score <= -0.3)
        return '#ef4444'; // Red
    return '#facc15'; // Yellow/Neutral for Topics
};
