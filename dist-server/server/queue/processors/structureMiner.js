import { BaseMiner } from './baseMiner.js';
import { jobOrchestrator } from '../../services/jobOrchestrator.js';
export const structureMinerProcessor = async (job) => {
    const { query, jobId, userId, sampleSize } = job.attrs.data;
    console.log(`[StructureMiner] Starting for Job ${jobId} ("${query}")...`);
    try {
        // 1. Identify Target
        let targetHandle = query;
        if (targetHandle.startsWith('@')) {
            targetHandle = targetHandle.substring(1);
        }
        else {
            // If it's not a handle, we might need to search first? 
            // For now, assume Structure Miner expects a Handle.
            // If it's a keyword, Structure Miner might just return "N/A" or search for top influencers?
            // Let's assume the Dispatcher (CompositeMiner) handles 'Search' if needed, or we do it here.
            // SIMPLE V1: Assume query IS a handle or we skip.
            if (!query.includes(' ')) {
                // likely a handle without @
            }
            else {
                console.log(`[StructureMiner] Query "${query}" looks like a keyword. Structure mining might need refinement.`);
                // For now, we'll try to treat it as a handle effectively or fail gracefully
            }
        }
        // 2. Define Actor (Followers/Following)
        // Using "thenetaji/instagram-followers-followings-scraper" (presumed ID from context)
        // Or better, let's look at what JobOrchestrator uses. Use that ID.
        const ACTOR_ID = 'asIjo32NQuUHP4Fnc'; // [FIX] Verify this ID from Orchestrator file
        // 3. Prepare Input
        const input = {
            username: [targetHandle],
            searchType: 'followers',
            searchLimit: Math.min(sampleSize || 100, 500),
        };
        // 4. Run Scrape
        console.log(`[StructureMiner] Scraping structure for ${targetHandle}...`);
        await BaseMiner.updateSubTaskProgress(jobId, 'structure', 10, 'Starting Apify Scrape...');
        const result = await jobOrchestrator.runApifyActor(ACTOR_ID, input, jobId, {
            taskName: 'Structure Mining (Followers)',
            query: query,
            sampleSize: sampleSize,
            ignoreCache: false
        });
        await BaseMiner.updateSubTaskProgress(jobId, 'structure', 80, 'Processing Graph Data...');
        // 5. Process/Simplify Data
        // We only need the graph connections (source -> target)
        const connections = result.items.map((item) => ({
            source: targetHandle,
            target: item.username,
            type: 'follower',
            id: item.id || item.pk,
            // [FIX] Pass rich profile data for Context & Brand Mining
            targetProfile: {
                username: item.username,
                fullName: item.full_name || item.fullName,
                biography: item.biography || item.bio || '',
                followersCount: item.followersCount || item.followers_count || 0,
                profilePicUrl: item.profilePicUrl || item.profile_pic_url,
                isVerified: item.isVerified || item.is_verified,
                externalUrl: item.externalUrl || item.external_url
            }
        }));
        console.log(`[StructureMiner] Found ${connections.length} connections.`);
        // 6. Complete
        await BaseMiner.completeSubTask(jobId, 'structure', {
            target: targetHandle,
            count: connections.length,
            connections: connections,
            datasetId: result.datasetId
        });
        console.log(`[StructureMiner] ✅ Finished Job ${jobId}`);
    }
    catch (e) {
        await BaseMiner.handleFailure(jobId, 'structure', e);
        // We throw so Agenda knows to retry or fail
        throw e;
    }
};
