/**
 * Graph Analysis Service
 * Implements sophisticated graph algorithms to extract insights from network topology.
 */
export class GraphAnalysisService {
    /**
     * Calculate PageRank for all nodes in the graph.
     * PageRank measures the importance of a node based on the quantity and quality of incoming links.
     *
     * @param nodes Graph nodes
     * @param links Graph links
     * @param dampingFactor Probability of continuing to follow links (usually 0.85)
     * @param iterations Number of iterations to run (20 is usually sufficient for convergence)
     * @returns Map of Node ID -> PageRank Score
     */
    static calculatePageRank(nodes, links, dampingFactor = 0.85, iterations = 20) {
        console.log("[GraphAnalysis] Calculating PageRank...");
        const ranks = new Map();
        const numNodes = nodes.length;
        if (numNodes === 0)
            return ranks;
        // 1. Initialize all ranks to 1 / N
        const initialRank = 1 / numNodes;
        nodes.forEach(n => ranks.set(n.id, initialRank));
        // 2. Build Adjacency Map (Outgoing Links)
        // Map<SourceId, TargetIds[]>
        const outgoing = new Map();
        const incoming = new Map(); // Map<TargetId, SourceIds[]>
        nodes.forEach(n => {
            outgoing.set(n.id, []);
            incoming.set(n.id, []);
        });
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (outgoing.has(s))
                outgoing.get(s).push(t);
            if (incoming.has(t))
                incoming.get(t).push(s);
        });
        // 3. Iterative Calculation
        for (let i = 0; i < iterations; i++) {
            const newRanks = new Map();
            let leak = 0; // Rank lost to dangling nodes (nodes with no outgoing links)
            // Identify dangling nodes and sum their current rank
            nodes.forEach(n => {
                if ((outgoing.get(n.id) || []).length === 0) {
                    leak += ranks.get(n.id);
                }
            });
            // Calculate new rank for each node
            nodes.forEach(node => {
                let incomingSum = 0;
                const inboundNeighbors = incoming.get(node.id) || [];
                inboundNeighbors.forEach(sourceId => {
                    const sourceOutDegree = (outgoing.get(sourceId) || []).length;
                    if (sourceOutDegree > 0) {
                        incomingSum += ranks.get(sourceId) / sourceOutDegree;
                    }
                });
                // PageRank Formula:
                // PR(u) = (1 - d) / N + d * (Sum(PR(v) / Out(v)) + Leak / N)
                const pr = ((1 - dampingFactor) / numNodes) + dampingFactor * (incomingSum + (leak / numNodes));
                newRanks.set(node.id, pr);
            });
            // Update ranks for next iteration
            nodes.forEach(n => ranks.set(n.id, newRanks.get(n.id)));
        }
        // 4. Normalize Ranks (Optional, but good for relative scaling)
        // Find min/max for scaling visualization later
        let min = 1, max = 0;
        ranks.forEach(r => {
            if (r < min)
                min = r;
            if (r > max)
                max = r;
        });
        console.log(`[GraphAnalysis] PageRank Complete. Max Score: ${max.toFixed(6)}, Min Score: ${min.toFixed(6)}`);
        // Store stats on the service for retrieval if needed
        return ranks;
    }
    /**
     * Apply PageRank scores to node sizes ('val' property)
     * @param nodes Graph nodes
     * @param ranks PageRank map
     * @param baseSize Minimum node size
     * @param multiplier Scaling factor
     */
    static applyInfluenceSizing(nodes, ranks, baseSize = 5, multiplier = 1000) {
        nodes.forEach(node => {
            // Skip resizing 'MAIN' or 'Cluster' nodes if we want them to stay fixed
            // But usually, resizing them based on influence is actually good!
            // Let's protect 'MAIN' only.
            if (node.id === 'MAIN')
                return;
            const score = ranks.get(node.id) || 0;
            // Logarithmic or Linear scaling? Linear is often too extreme for power laws.
            // Let's try a reinforced linear scale with a cap.
            // Typical PR range: 0.0001 - 0.05
            // New Size = Base + (Score * Multiplier)
            let newSize = baseSize + (score * multiplier);
            // Cap extremely large nodes
            if (node.group === 'cluster')
                newSize = Math.min(newSize, 60);
            else
                newSize = Math.min(newSize, 40); // Standard nodes capped at 40
            // Apply
            if (!node.val || newSize > node.val) {
                node.val = Math.round(newSize);
            }
            // Store raw score for UI
            node.data = { ...node.data, influenceScore: score };
        });
    }
}
