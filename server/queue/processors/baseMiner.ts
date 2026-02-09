import { mongoService } from '../../services/mongoService.js';
import { Job } from 'agenda';
import { analyzeFandomDeepDive } from '../../../services/geminiService.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class GeminiCache {
    private cache = new Map<string, { result: any; timestamp: number }>();
    private maxSize = 100;
    private ttl = 3600000; // 1 hour in milliseconds

    generateKey(query: string, contextSize: number, platform: string = 'instagram'): string {
        // Create hash from query, context size, and platform for better cache discrimination
        const normalized = query.toLowerCase().trim();
        return crypto.createHash('md5').update(`${normalized}_${contextSize}_${platform}`).digest('hex');
    }

    get(key: string): any | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        // [FIX] Move to end for proper LRU behavior
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.result;
    }

    set(key: string, result: any): void {
        // [FIX] Proper LRU eviction: remove least recently used (first item)
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });
    }

    clear(): void {
        this.cache.clear();
    }

    // Utility to get cache stats
    getStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

const geminiCache = new GeminiCache();

export class BaseMiner {
    private static agendaInstance: any;

    public static setAgenda(agenda: any) {
        this.agendaInstance = agenda;
    }

    /**
     * Updates the shared MongoDB Job with the partial result from this miner.
     * Checks if all parts are done, and if so, marks the job as completed.
     */
    static async completeSubTask(jobId: string, resultKey: string, data: any) {
        console.log(`[BaseMiner] Completing subtask '${resultKey}' for Job ${jobId}`);
        const db = mongoService.getDb();

        // 1. Update the specific result field
        const updateQuery: any = {};
        updateQuery[`result.${resultKey}`] = data;
        updateQuery[`result.status.${resultKey}`] = 'completed'; // Track individual status
        updateQuery['updatedAt'] = new Date();

        await db.collection('jobs').updateOne(
            { id: jobId },
            { $set: updateQuery }
        );

        // 2. Check Aggregation Status
        await this.checkAggregation(jobId);
    }

    static async updateSubTaskProgress(jobId: string, resultKey: string, percent: number, stage: string) {
        const db = mongoService.getDb();

        // 1. Update individual sub-task status
        await db.collection('jobs').updateOne(
            { id: jobId },
            {
                $set: {
                    [`result.status.${resultKey}_progress`]: percent,
                    [`result.status.${resultKey}_stage`]: stage,
                    [`result.status.${resultKey}`]: 'running'
                }
            }
        );

        // 2. Calculate and Update Overall Progress
        const job = await mongoService.getJob(jobId);
        if (job && job.result && job.result.status) {
            const status = job.result.status;
            // Assumes 3 parts: structure, creators, trends
            const p1 = status.structure_progress || 0;
            const p2 = status.creators_progress || 0;
            const p3 = status.trends_progress || 0;

            // Base progress is 10% (dispatch), max mining is 90% (leaving 10% for AI)
            const miningProgress = ((p1 + p2 + p3) / 3) * 0.8;
            const totalProgress = 10 + miningProgress;

            // Constuct a descriptive stage message
            const icons: Record<string, string> = {
                structure: '⠦', // Network/Nodes
                trends: '∿',    // Signal/Wave
                creators: '★'   // Star/Creator
            };

            const activeStages = [];
            if (status.structure === 'running') activeStages.push(`${icons.structure} Structure: ${status.structure_stage || 'Working'}`);
            if (status.trends === 'running') activeStages.push(`${icons.trends} Trends: ${status.trends_stage || 'Working'}`);
            if (status.creators === 'running') activeStages.push(`${icons.creators} Creators: ${status.creators_stage || 'Working'}`);

            const mainStage = activeStages.length > 0 ? activeStages[0] : 'Processing...';

            await mongoService.updateJob(jobId, {
                progress: Math.min(90, Math.round(totalProgress)),
                result: {
                    ...job.result,
                    stage: `Mining Data (${Math.round(totalProgress)}%): ${activeStages.join('  |  ')}`
                }
            });
        }
    }

    static async checkAggregation(jobId: string) {
        const job = await mongoService.getJob(jobId);
        if (!job) return;

        const results = job.result || {};
        const status = results.status || {};

        // Define what constitutes "Done" for a Composite Job
        const requiredParts = ['structure', 'creators', 'trends'];

        // Check if all required parts are present/completed (or failed)
        const scrapingDone = requiredParts.every(part => status[part] === 'completed' || status[part] === 'failed');

        if (scrapingDone) {
            // [VISUAL INTELLIGENCE] Trigger Visual Miner if not yet run
            // We optimize flow by running Visual Miner only after we have data to analyze
            if (!status.visual) {
                console.log(`[BaseMiner] Scraping done. Triggering Visual Intelligence for Job ${jobId}...`);

                try {
                    const agenda = this.agendaInstance;
                    if (!agenda) {
                        console.error('[BaseMiner] Agenda instance not set!');
                        return;
                    }

                    const JOB_MINER_VISUAL = 'miner-visual';

                    // Dispatch Visual Miner
                    await agenda.now(JOB_MINER_VISUAL, {
                        ...(job.metadata || {}), // [FIX] Use metadata for Mongo Job parameters
                        jobId: jobId, // Explicitly pass jobId
                        datasetId: jobId, // Use jobId as datasetId
                        userId: job.userId // [FIX] Pass userId explicitly from Mongo Job root
                    });

                    // Update status to pending so we don't trigger again
                    await mongoService.updateJob(jobId, {
                        result: {
                            ...job.result,
                            status: {
                                ...status,
                                visual: 'pending'
                            }
                        }
                    });
                    return; // Stop here, wait for visual miner to callback
                } catch (e) {
                    console.error('[BaseMiner] Failed to dispatch Visual Miner:', e);
                    // If dispatch fails, mark as failed and proceed?
                    // For now, let's just log and maybe proceed without visual
                }
            }

            // If visual is still working, update progress and wait
            if (status.visual === 'pending' || status.visual === 'running') {
                return;
            }

            console.log(`[BaseMiner] 🏁 ALL PARTS COMPLETE (including Visual) for Job ${jobId}. Aggregating & Analyzing...`);

            // 1. Prepare Aggregate Data
            const finalDataset = {
                structure: results.structure,
                creators: results.creators,
                trends: results.trends,
                visual: results.visual, // [NEW] Include Visual DNA
                aggregatedAt: new Date()
            };

            // 2. Trigger AI Analysis (Gemini)
            let analysisResult: any = null;
            let flatAnalytics: any = null;
            let finalDatasetId = jobId;


            try {
                // [OPTIMIZATION] Transform Aggregated Results into "Context Items" for Gemini
                const context: any[] = [];
                const richContextMap = new Map<string, any>(); // Master Map for Enrichment

                // [OPTIMIZATION] Efficient deduplication - direct updates instead of spread operators
                const addToMasterMap = (item: any) => {
                    if (!item) return;
                    const key = (item.username || item.ownerUsername || item.handle || '').toLowerCase();
                    if (!key) return;

                    // Get or create entry
                    if (!richContextMap.has(key)) {
                        richContextMap.set(key, {
                            _frequency: 0,
                            _provenance: [],
                            username: key
                        });
                    }

                    const entry = richContextMap.get(key)!;

                    // Update frequency
                    entry._frequency++;

                    // Update provenance (avoid duplicates)
                    if (item.source && !entry._provenance.includes(item.source)) {
                        entry._provenance.push(item.source);
                    } else if (!item.source && item.followedBy && !entry._provenance.includes(`Followed by ${item.followedBy}`)) {
                        entry._provenance.push(`Followed by ${item.followedBy}`);
                    }

                    // Merge strategies: Direct property updates (no spread)
                    if (item.biography && item.biography.length > (entry.biography?.length || 0)) {
                        entry.biography = item.biography;
                    }
                    if (item.profilePicUrl && !entry.profilePicUrl) {
                        entry.profilePicUrl = item.profilePicUrl;
                    }
                    if (item.followersCount && !entry.followersCount) {
                        entry.followersCount = item.followersCount;
                    }

                    // [FIX] Explicitly copy known safe properties instead of using for...in
                    // This prevents accidentally copying internal properties or methods
                    const safeProperties = ['handle', 'url', 'profileUrl', 'verified', 'isVerified',
                        'engagementRate', 'avgLikes', 'avgComments', 'postsCount',
                        'bio', 'fullName', 'category', 'platform'];

                    for (const prop of safeProperties) {
                        if (item[prop] !== undefined && entry[prop] === undefined) {
                            entry[prop] = item[prop];
                        }
                    }
                };

                // [OPTIMIZATION] Consolidate all array iterations into single pass
                // Build unified item list with type tags
                const allItems: Array<{ type: string; data: any }> = [];

                // Collect creators
                if (results.creators && Array.isArray(results.creators.creators)) {
                    results.creators.creators.forEach((c: any) => {
                        allItems.push({ type: 'creator', data: c });
                    });
                }

                // Collect trends topics
                if (results.trends && Array.isArray(results.trends.topics)) {
                    results.trends.topics.forEach((t: any) => {
                        allItems.push({ type: 'trend_topic', data: t });
                    });
                }

                // Collect trends hashtags
                if (results.trends && Array.isArray(results.trends.hashtags)) {
                    allItems.push({ type: 'trend_hashtags', data: results.trends.hashtags });
                }

                // [VISUAL INTELLIGENCE] Add visual context
                if (results.visual) {
                    // Add brands
                    if (results.visual.brands && results.visual.brands.length > 0) {
                        allItems.push({ type: 'visual_brands', data: results.visual.brands });
                    }
                    // Add top aesthetic tags
                    if (results.visual.aestheticTags && results.visual.aestheticTags.length > 0) {
                        allItems.push({ type: 'visual_aesthetics', data: results.visual.aestheticTags });
                    }
                    // Add vibe description
                    if (results.visual.vibeDescription) {
                        allItems.push({ type: 'visual_vibe', data: { description: results.visual.vibeDescription } });
                    }
                }

                // Collect structure connections
                if (results.structure && Array.isArray(results.structure.connections)) {
                    results.structure.connections.forEach((conn: any) => {
                        allItems.push({ type: 'structure', data: conn });
                    });
                }

                // Single pass processing
                allItems.forEach(item => {
                    switch (item.type) {
                        case 'creator':
                            addToMasterMap(item.data);
                            context.push({
                                username: item.data.username,
                                followersCount: item.data.followers,
                                biography: `(Source: ${item.data.source}) Identified as Rising Star.`,
                                profilePicUrl: item.data.profilePicUrl
                            });
                            break;

                        case 'trend_topic':
                            context.push({
                                username: 'Trend_Signal',
                                ownerUsername: 'Trend_Signal',
                                caption: `Trending Topic: ${item.data.topic} (Frequency: ${item.data.count}).`,
                                hashtags: [item.data.topic]
                            });
                            break;

                        case 'trend_hashtags':
                            const tagString = item.data.map((h: any) => `#${h.tag}`).join(' ');
                            context.push({
                                username: 'Hashtag_Aggregate',
                                caption: `Top Hashtags found in community: ${tagString}`
                            });
                            break;

                        case 'structure':
                            if (item.data.targetProfile) {
                                addToMasterMap(item.data.targetProfile);
                            }

                            const bioText = item.data.targetProfile?.biography || item.data.targetProfile?.bio;
                            if (bioText) {
                                context.push({
                                    username: item.data.target,
                                    caption: `User Bio: ${bioText}`,
                                    sourceUrl: `https://instagram.com/${item.data.target}`,
                                    role: 'community_member'
                                });
                            } else {
                                context.push({
                                    username: item.data.target,
                                    caption: `Followed by target account (Graph Node).`
                                });
                            }
                            break;
                    }
                });

                // Add structure summary
                if (results.structure) {
                    context.push({
                        username: 'Network_Topology',
                        caption: `Graph Analysis: Found ${results.structure.count} connections in the community graph.`
                    });
                }



                const query = job.metadata?.query || "Fandom Analysis";

                // Convert Master Map to Array for "Rich Context" passing (if needed) or keep as internal reference
                const richContextArray = Array.from(richContextMap.values());
                console.log(`[BaseMiner] Aggregated ${richContextArray.length} unique profiles for enrichment.`);

                // [OPTIMIZATION] Check cache before calling Gemini
                const cacheKey = geminiCache.generateKey(query, context.length, 'instagram');
                const cachedResult = geminiCache.get(cacheKey);

                if (cachedResult) {
                    console.log(`[BaseMiner] 🎯 Cache HIT for query "${query}" (${context.length} items)`);
                    analysisResult = cachedResult;
                } else {
                    console.log(`[BaseMiner] 🔍 Cache MISS - Calling Gemini for "${query}"`);
                    analysisResult = await analyzeFandomDeepDive(
                        query,
                        context,
                        'general_map', // Default intent for composite
                        'instagram',
                        '', // No single dataset URL
                        100, // Scale
                        false, // themed
                        richContextArray // [NEW] Pass the Rich Context
                    );

                    // Cache the result
                    geminiCache.set(cacheKey, analysisResult);
                    console.log(`[BaseMiner] 💾 Cached result for future queries`);
                }


                // 3. Flatten for Frontend (Legacy Panel Support)
                if (analysisResult && analysisResult.root) {
                    flatAnalytics = {
                        creators: [] as any[],
                        brands: [] as any[],
                        clusters: [] as any[],
                        topics: [] as any[],
                        visualTheme: (results.visual && results.visual.colorPalette) ? {
                            primaryColor: results.visual.colorPalette[0],
                            textureStyle: (results.visual.aesthetics && results.visual.aesthetics[0]) ? results.visual.aesthetics[0].style : 'generic'
                        } : (analysisResult.analytics?.visualTheme || null),
                        aestheticTags: analysisResult.analytics?.aestheticTags || [],
                        vibeDescription: analysisResult.analytics?.vibeDescription || ""
                    };

                    const clusters = analysisResult.root.children || [];
                    clusters.forEach((cluster: any) => {
                        flatAnalytics.clusters.push({
                            name: cluster.label,
                            value: cluster.val,
                            count: cluster.val,
                            ...cluster.data
                        });
                        if (cluster.children) {
                            cluster.children.forEach((node: any) => {
                                const item = {
                                    name: node.label,
                                    value: node.val,
                                    type: node.type,
                                    ...node.data
                                };
                                if (node.type === 'creator') flatAnalytics.creators.push(item);
                                else if (node.type === 'brand') flatAnalytics.brands.push(item);
                                else if (node.type === 'topic') flatAnalytics.topics.push(item);
                            });
                        }
                    });
                    // Assign back to result
                    analysisResult.analytics = flatAnalytics;
                }

                // 3.5 Create a Persisted Dataset (So the UI can load it)
                const newDataset: any = {
                    id: uuidv4(),
                    name: `Composite Analysis: ${query}`,
                    platform: 'instagram',
                    targetProfile: query,
                    dataType: 'composite_map',
                    recordCount: (results.structure?.count || 0) + (results.creators?.count || 0) + (results.trends?.mediaCount || 0),
                    createdAt: new Date(),
                    tags: ['composite', 'ai-analysis'],
                    userId: job.userId || 'system',
                    metadata: {
                        jobId: jobId,
                        query: query,
                        sampleSize: job.metadata?.sampleSize
                    }
                };

                // Save dataset to Mongo (datasets collection)
                const savedDatasetId = await mongoService.createDataset(newDataset);
                console.log(`[BaseMiner] Created Persistent Dataset: ${savedDatasetId} (${newDataset.id})`);
                finalDatasetId = newDataset.id; // Update our reference

                // If we had granular records, we would insert them here (optional for now)
                if (analysisResult) {
                    // [FIX] Convert Tree Structure to Nodes/Links Graph for Frontend
                    const graphData = this.convertTreeToGraph(analysisResult, results.visual);
                    console.log(`[BaseMiner] Graph Data: ${graphData.nodes.length} nodes, ${graphData.links.length} links`);


                    await mongoService.insertRecords([
                        {
                            datasetId: newDataset.id,
                            recordType: 'graph_snapshot',
                            platform: 'instagram',
                            data: graphData, // NOW IT HAS NODES & LINKS
                            createdAt: new Date()
                        },
                        {
                            datasetId: newDataset.id, // Same ID, different record type
                            recordType: 'analytics_data',
                            platform: 'instagram',
                            data: flatAnalytics, // The Panels
                            createdAt: new Date()
                        }
                    ]);
                    console.log(`[BaseMiner] Saved Graph Snapshot & Analytics to Dataset ${newDataset.id}`);
                }

            } catch (err) {
                console.error(`[BaseMiner] AI Analysis Failed:`, err);
                // Don't fail the whole job, just proceed with partials
            }

            // 4. Update Job as Complete
            await mongoService.updateJob(jobId, {
                status: 'completed',
                progress: 100,
                result: {
                    ...results,
                    datasetId: finalDatasetId, // Use the Scoped Variable
                    finalOutput: finalDataset,
                    analysis: analysisResult, // The Tree
                    analytics: flatAnalytics, // The Panel Data
                    message: 'Composite Analysis & AI Deep Dive Complete'
                }
            });

            // Trigger Notification?
            console.log(`[BaseMiner] Job ${jobId} marked as COMPLETED.`);
        } else {
            // Update Progress based on completed parts
            const progress = (Object.keys(status).filter(k => status[k] === 'completed').length / requiredParts.length) * 100;
            // Don't overwrite granular progress if it's higher (e.g. from sub-task updates)
            if (progress > (job.progress || 0)) {
                await mongoService.updateJob(jobId, { progress });
            }
        }
    }

    /**
     * [OPTIMIZATION] Helper to Flatten Tree (Root -> Cluster -> Leaf) into { nodes, links }
     * Pre-allocates arrays for better performance
     */
    private static convertTreeToGraph(treeData: any, visualData: any = null) {
        if (!treeData || !treeData.root) return { nodes: [], links: [] };

        const clusters = treeData.root.children || [];

        // [OPTIMIZATION] Pre-calculate array sizes to avoid resizing
        const totalLeaves = clusters.reduce((sum: number, cluster: any) =>
            sum + (cluster.children?.length || 0), 0
        );
        const estimatedNodes = 1 + clusters.length + totalLeaves; // root + clusters + leaves
        const estimatedLinks = clusters.length + totalLeaves; // root->clusters + clusters->leaves

        // Pre-allocate arrays
        const nodes: any[] = new Array(estimatedNodes);
        const links: any[] = new Array(estimatedLinks);

        let nodeIdx = 0;
        let linkIdx = 0;

        // 1. Root
        const rootId = 'root';
        nodes[nodeIdx++] = {
            id: rootId,
            label: treeData.root.label || 'Community',
            val: 40,
            type: 'root',
            color: '#10b981', // Emerald-500
            ...treeData.root.data
        };

        // 2. Clusters and Leaves
        clusters.forEach((cluster: any, i: number) => {
            const clusterId = `c_${i}`;

            // Add cluster node
            nodes[nodeIdx++] = {
                id: clusterId,
                label: cluster.label,
                val: 20,
                type: 'cluster',
                color: cluster.color || '#34d399', // Emerald-400
                ...cluster.data
            };

            // Add root->cluster link
            links[linkIdx++] = {
                source: rootId,
                target: clusterId,
                value: 5
            };

            // 3. Leaves (Creators/Brands)
            if (cluster.children) {
                cluster.children.forEach((leaf: any, j: number) => {
                    const leafId = `n_${i}_${j}`;

                    // Determine type color
                    let color = '#a7f3d0'; // Default light emerald
                    if (leaf.type === 'brand') color = '#fbbf24'; // Amber
                    if (leaf.type === 'creator') color = '#60a5fa'; // Blue
                    if (leaf.type === 'topic') color = '#f472b6'; // Pink

                    // Add leaf node
                    nodes[nodeIdx++] = {
                        id: leafId,
                        label: leaf.label || leaf.handle || leafId,
                        val: leaf.val || 10,
                        type: leaf.type || 'node',
                        color: color,
                        ...leaf.data
                    };

                    // Add cluster->leaf link
                    links[linkIdx++] = {
                        source: clusterId,
                        target: leafId,
                        value: 2
                    };
                });
            }
        });

        // [VISUAL INTELLIGENCE] Add Brand Nodes from Visual Analysis
        if (visualData && visualData.brands && Array.isArray(visualData.brands)) {
            visualData.brands.forEach((brand: any) => {
                const brandId = `brand_${brand.name.toLowerCase().replace(/\s+/g, '_')}`;
                // Avoid key collisions?
                // Minimal check - we assume brandId is unique enough or we overwrite safely
                nodes[nodeIdx++] = {
                    id: brandId,
                    label: brand.name,
                    val: 10 + Math.min(20, (brand.count || 1) * 2),
                    group: 'brand',
                    color: '#fbbf24', // Amber
                    data: {
                        name: brand.name,
                        count: brand.count,
                        type: 'brand',
                        evidence: `Detected visually in ${brand.count} posts`
                    }
                };
                links[linkIdx++] = {
                    source: rootId,
                    target: brandId,
                    value: Math.max(1, brand.count || 1)
                };
            });
        }

        // Trim arrays to actual size (in case estimation was off)
        nodes.length = nodeIdx;
        links.length = linkIdx;

        return { nodes, links };
    }

    static async handleFailure(jobId: string, outputKey: string, error: Error) {
        console.error(`[BaseMiner] Failed subtask '${outputKey}' for Job ${jobId}:`, error);
        // We might not want to fail the WHOLE job if one miner fails?
        // For now, let's just mark the subtask as failed
        const db = mongoService.getDb();
        const updateQuery: any = {};
        updateQuery[`result.status.${outputKey}`] = 'failed';
        updateQuery[`result.errors.${outputKey}`] = error.message;

        await db.collection('jobs').updateOne(
            { id: jobId },
            { $set: updateQuery }
        );

        // Still check aggregation (maybe we proceed with partial data?)
        this.checkAggregation(jobId);
    }
}
