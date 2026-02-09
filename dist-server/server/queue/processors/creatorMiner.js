import { BaseMiner } from './baseMiner.js';
import { jobOrchestrator } from '../../services/jobOrchestrator.js';
export const creatorMinerProcessor = async (job) => {
    const { query, jobId, userId, sampleSize } = job.attrs.data;
    console.log(`[CreatorMiner] Starting for Job ${jobId} ("${query}")...`);
    try {
        let items = [];
        let source = '';
        // 1. Determine Strategy based on input
        if (query.startsWith('@')) {
            // Strategy A: Who does this user follow? (Endorsements)
            // This complements structureMiner which (likely) scrapes followers.
            const targetHandle = query.substring(1);
            source = `following of ${targetHandle}`;
            console.log(`[CreatorMiner] Scraping 'Following' of ${targetHandle} to find creators...`);
            await BaseMiner.updateSubTaskProgress(jobId, 'creators', 10, 'Scanning Network...');
            const ACTOR_ID = 'asIjo32NQuUHP4Fnc'; // Followers/Following Scraper
            const result = await jobOrchestrator.runApifyActor(ACTOR_ID, {
                usernames: targetHandle ? [targetHandle] : [], // Safely handle array
                searchType: 'following',
                searchLimit: Math.min(sampleSize || 100, 500)
            }, jobId, {
                taskName: 'Creator Mining (Following)',
                query: query,
                sampleSize: sampleSize,
                ignoreCache: false
            });
            items = result.items;
        }
        else {
            // Strategy B: Topic Search -> Authors
            // If it's a keyword, we look for people posting about it.
            // This might overlap with TrendsMiner, but we focus on the AUTHOR metrics here.
            console.log(`[CreatorMiner] Keyword query. finding authors for "${query}"...`);
            await BaseMiner.updateSubTaskProgress(jobId, 'creators', 10, 'Searching Authors...');
            const ACTOR_ID = 'apify/instagram-scraper';
            const result = await jobOrchestrator.runApifyActor(ACTOR_ID, {
                search: query,
                resultsType: 'posts',
                searchLimit: Math.min(sampleSize || 50, 100)
            }, jobId, {
                taskName: 'Creator Mining (Topic Authors)',
                query: query,
                sampleSize: sampleSize,
                ignoreCache: false
            });
            // Extract owners from posts
            items = result.items.map((post) => post.owner || post.author).filter((x) => x);
        }
        await BaseMiner.updateSubTaskProgress(jobId, 'creators', 70, 'Identifying Rising Stars...');
        // 2. Filter & Rank (Simple Heuristics)
        // We look for "Rising Stars" (e.g. > 10k followers but < 1M? Or just top N)
        // Note: 'following' scraper might give sparse data, 'posts' scraper gives owner object.
        const creators = items.map((user) => ({
            username: user.username,
            fullName: user.full_name || user.fullName,
            followers: user.followersCount || user.followers_count || 0,
            isVerified: user.isVerified || user.is_verified || false,
            profilePicUrl: user.profilePicUrl || user.profile_pic_url,
            source: source || 'search'
        }))
            // Filter empty or private
            .filter((u) => u.username && !u.isPrivate)
            // Sort by followers (High to Low for now)
            .sort((a, b) => b.followers - a.followers)
            .slice(0, 50); // Top 50
        console.log(`[CreatorMiner] Identified ${creators.length} potential creators.`);
        // 3. Complete
        await BaseMiner.completeSubTask(jobId, 'creators', {
            strategy: query.startsWith('@') ? 'following' : 'topic_authors',
            count: creators.length,
            creators: creators
        });
        console.log(`[CreatorMiner] ✅ Finished Job ${jobId}`);
    }
    catch (e) {
        await BaseMiner.handleFailure(jobId, 'creators', e);
        throw e;
    }
};
