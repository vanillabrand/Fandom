import { analyzeVisualContent } from '../../services/geminiService.js';
import { proxyMediaUrl } from '../utils/mediaProxyUtil.js';
export class VisualDNAService {
    /**
     * Enrich Cluster Nodes with Visual DNA Analysis
     * @param nodes Graph Nodes
     * @param links Graph Links
     * @param batchSize Number of images to analyze per cluster (default 10)
     */
    /**
     * Enrich Cluster Nodes AND Main Node with Visual DNA Analysis
     * @param nodes Graph Nodes
     * @param links Graph Links
     * @param batchSize Number of images to analyze per cluster (default 10)
     */
    static async enrichClustersWithVisuals(nodes, links, batchSize = 10) {
        const clusters = nodes.filter(n => n.group === 'cluster');
        const mainNode = nodes.find(n => n.id === 'MAIN');
        const allCreators = nodes.filter(n => n.group === 'creator');
        console.log(`[VisualDNA] Starting Visual Enrichment for ${clusters.length} clusters & Main Node...`);
        // --- 1. Enrich MAIN Node (Global Vibe) ---
        if (mainNode) {
            console.log(`[VisualDNA] Analyzing Global Vibe (MAIN Node) with sample of ${allCreators.length} creators...`);
            // Collect all candidate images from graph
            let allImages = [];
            allCreators.forEach(c => {
                const d = c.data || {};
                if (d.profilePicUrl && !d.profilePicUrl.includes('default')) {
                    // [FIX] Proxy media URLs for Visual DNA to ensure access
                    allImages.push(proxyMediaUrl(d.profilePicUrl));
                }
            });
            // Random sample for global vibe (larger batch for global?)
            // Keep it 10-15 to stay within Gemini limits per request
            const globalSample = allImages.sort(() => 0.5 - Math.random()).slice(0, 12);
            if (globalSample.length >= 3) {
                try {
                    const visualIdentity = await analyzeVisualContent(globalSample, 'vibe');
                    if (!mainNode.data)
                        mainNode.data = {};
                    // [FIX] Add null-safety checks for visualIdentity properties
                    if (visualIdentity && typeof visualIdentity === 'object') {
                        // FLATTEN data for Frontend (VisualDNAWidget expects these directly on data)
                        Object.assign(mainNode.data, {
                            aestheticTags: visualIdentity.aestheticTags || [],
                            vibeDescription: visualIdentity.vibeDescription || '',
                            colorPalette: visualIdentity.colorPalette || [],
                            analyzedImageCount: globalSample.length,
                            visualIdentity: visualIdentity // Keep nested copy just in case
                        });
                        console.log(`[VisualDNA] ✅ Enriched MAIN node with global vibe.`);
                    }
                    else {
                        console.warn(`[VisualDNA] Invalid visualIdentity response for MAIN node`);
                    }
                }
                catch (e) {
                    console.error(`[VisualDNA] Failed to analyze MAIN node:`, e);
                }
            }
        }
        // --- 2. Enrich Cluster Nodes ---
        // Build Adjacency Map for quick lookup (Cluster -> Creators)
        const clusterToCreators = new Map();
        links.forEach(link => {
            const sourceId = (link.source && typeof link.source === 'object') ? link.source.id : link.source;
            const targetId = (link.target && typeof link.target === 'object') ? link.target.id : link.target;
            // Check if link is between Cluster and Creator
            const sourceNode = nodes.find(n => n.id === sourceId);
            const targetNode = nodes.find(n => n.id === targetId);
            if (sourceNode?.group === 'cluster' && targetNode?.group === 'creator') {
                if (!clusterToCreators.has(sourceId))
                    clusterToCreators.set(sourceId, []);
                clusterToCreators.get(sourceId).push(targetNode);
            }
            else if (targetNode?.group === 'cluster' && sourceNode?.group === 'creator') {
                if (!clusterToCreators.has(targetId))
                    clusterToCreators.set(targetId, []);
                clusterToCreators.get(targetId).push(sourceNode);
            }
        });
        // Process Each Cluster
        for (const cluster of clusters) {
            const creators = clusterToCreators.get(cluster.id) || [];
            if (creators.length === 0) {
                continue;
            }
            // Collect Candidate Images
            let candidateImages = [];
            creators.forEach(creator => {
                const d = creator.data || {};
                if (d.profilePicUrl && !d.profilePicUrl.includes('default')) {
                    // [FIX] Proxy media URLs for Visual DNA to ensure access
                    candidateImages.push(proxyMediaUrl(d.profilePicUrl));
                }
            });
            // Shuffle and limit
            candidateImages = candidateImages.sort(() => 0.5 - Math.random()).slice(0, batchSize);
            if (candidateImages.length < 3) {
                console.log(`[VisualDNA] Not enough images for Cluster ${cluster.label} (${candidateImages.length}). Skipping.`);
                continue;
            }
            // Call Gemini Vision
            try {
                const visualIdentity = await analyzeVisualContent(candidateImages, 'vibe');
                // [FIX] Add null-safety checks for visualIdentity properties
                if (visualIdentity && typeof visualIdentity === 'object') {
                    // Enrich Cluster Node - FLATTENED
                    if (!cluster.data)
                        cluster.data = {};
                    Object.assign(cluster.data, {
                        aestheticTags: visualIdentity.aestheticTags || [],
                        vibeDescription: visualIdentity.vibeDescription || '',
                        colorPalette: visualIdentity.colorPalette || [],
                        analyzedImageCount: candidateImages.length,
                        visualIdentity: visualIdentity
                    });
                    // Apply color
                    if (visualIdentity.colorPalette && visualIdentity.colorPalette.length > 0) {
                        cluster.color = visualIdentity.colorPalette[0]; // Primary vibe color
                    }
                    const tags = visualIdentity.aestheticTags || [];
                    console.log(`[VisualDNA] ✅ Enriched Cluster "${cluster.label}" with vibe: ${tags.join(', ')}`);
                }
                else {
                    console.warn(`[VisualDNA] Invalid visualIdentity response for cluster ${cluster.label}`);
                }
            }
            catch (error) {
                console.error(`[VisualDNA] Failed to analyze cluster ${cluster.label}:`, error);
            }
        }
        console.log(`[VisualDNA] Completed.`);
    }
}
