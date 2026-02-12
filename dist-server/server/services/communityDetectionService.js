/**
 * Community Detection Service
 * Implements Label Propagation Algorithm (LPA) to identify sub-communities in the graph.
 * Assigns distinct colors to nodes based on their community structure.
 */
export class CommunityDetectionService {
    // Distinct color palette for communities (excluding reserved colors like white/pink)
    static { this.PALETTE = [
        '#3b82f6', // Blue
        '#ef4444', // Red
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#8b5cf6', // Violet
        '#ec4899', // Pink (Warning: similar to Creator)
        '#06b6d4', // Cyan
        '#84cc16', // Lime
        '#d946ef', // Fuchsia
        '#6366f1', // Indigo
        '#14b8a6', // Teal
        '#f43f5e', // Rose
    ]; }
    /**
     * Detect communities and assign colors to nodes
     * @param nodes Graph nodes
     * @param links Graph links
     */
    static detectCommunities(nodes, links) {
        console.log("[CommunityDetection] Starting Label Propagation...");
        // 1. Filter relevant nodes (Leaf nodes only)
        // We do NOT want to change the color of Clusters, Main, or Topics
        const leafNodes = nodes.filter(n => ['creator', 'brand', 'influencer', 'profile', 'user'].includes(n.group));
        if (leafNodes.length < 5) {
            console.log("[CommunityDetection] Not enough leaf nodes for detection. Skipping.");
            return;
        }
        // 2. Build Adjacency List (Optimized for fast lookup)
        const adjacency = new Map();
        const nodeMap = new Map();
        leafNodes.forEach(n => {
            adjacency.set(n.id, []);
            nodeMap.set(n.id, n);
            // Initialize Label with own ID
            n._communityLabel = n.id;
        });
        // Populate neighbors (only consider links between leaf nodes)
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (adjacency.has(s) && adjacency.has(t)) {
                adjacency.get(s).push(t);
                adjacency.get(t).push(s);
            }
        });
        // 3. Label Propagation (Sync Update for stability)
        const maxIterations = 10;
        let changed = true;
        let iter = 0;
        while (changed && iter < maxIterations) {
            changed = false;
            iter++;
            // Shuffle execution order to prevent oscillation
            const shuffled = [...leafNodes].sort(() => Math.random() - 0.5);
            for (const node of shuffled) {
                const neighbors = adjacency.get(node.id) || [];
                if (neighbors.length === 0)
                    continue;
                // Count labels in neighborhood
                const labelCounts = new Map();
                neighbors.forEach(neighId => {
                    const neighLabel = nodeMap.get(neighId)._communityLabel;
                    labelCounts.set(neighLabel, (labelCounts.get(neighLabel) || 0) + 1);
                });
                // Find max accumulated label
                let maxCount = -1;
                let bestLabels = [];
                labelCounts.forEach((count, label) => {
                    if (count > maxCount) {
                        maxCount = count;
                        bestLabels = [label];
                    }
                    else if (count === maxCount) {
                        bestLabels.push(label);
                    }
                });
                // Break ties randomly
                const chosenLabel = bestLabels[Math.floor(Math.random() * bestLabels.length)];
                if (chosenLabel !== node._communityLabel) {
                    node._communityLabel = chosenLabel;
                    changed = true;
                }
            }
        }
        // 4. Group Results
        const communities = new Map();
        leafNodes.forEach(n => {
            const label = n._communityLabel;
            if (!communities.has(label))
                communities.set(label, []);
            communities.get(label).push(n);
        });
        // Filter out tiny communities (noise) - treat as "General" (keep default color)
        const validCommunities = [...communities.entries()].filter(([_, members]) => members.length >= 3);
        console.log(`[CommunityDetection] Found ${validCommunities.length} communities in ${iter} iterations.`);
        // 5. Assign Colors
        validCommunities.forEach(([label, members], idx) => {
            const color = this.PALETTE[idx % this.PALETTE.length];
            const communityId = `comm_${label}`;
            members.forEach(node => {
                // Only override color if it wasn't already set by a stronger logic (e.g. main/cluster)
                // But we already filtered those out.
                // We MIGHT want to preserve 'brand' color vs 'creator' color if the user prefers that distinction.
                // However, "Community Detection" implies coloring by community.
                // Let's modify the node data but maybe be careful about overwriting specific visual overrides.
                node.color = color;
                node.data = { ...node.data, communityId, communityColor: color };
                // Add debug label
                // node.label = `${node.label} [C:${idx}]`;
            });
        });
        // Cleanup temp property
        leafNodes.forEach(n => delete n._communityLabel);
    }
}
