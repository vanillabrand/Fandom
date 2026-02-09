import { BaseMiner } from './baseMiner.js';
import { jobOrchestrator } from '../../services/jobOrchestrator.js';
export const trendsMinerProcessor = async (job) => {
    const { query, jobId, userId, sampleSize } = job.attrs.data;
    console.log(`[TrendsMiner] Starting for Job ${jobId} ("${query}")...`);
    try {
        // 1. Identify Target (User or Hashtag?)
        let target = query;
        let isHashtag = false;
        if (target.startsWith('#')) {
            isHashtag = true;
            target = target.substring(1);
        }
        else if (target.startsWith('@')) {
            target = target.substring(1);
        }
        // 2. Define Actor (Media Scraper)
        // We use the "instagram-scraper" (standard) or "api-scraper" for posts.
        // Orchestrator maps 'apify/instagram-scraper' -> process.env.APIFY_INSTAGRAM_ACTOR_ID
        const ACTOR_ID = 'apify/instagram-scraper';
        // 3. Prepare Input
        const input = {
            resultsType: 'posts',
            searchLimit: Math.min(sampleSize || 50, 200), // Fewer items needed for trends
        };
        if (isHashtag) {
            input.hashtags = [target];
        }
        else {
            input.usernames = [target]; // Scrape user's posts
        }
        // 4. Run Scrape
        console.log(`[TrendsMiner] Scraping trends/media for ${target}...`);
        await BaseMiner.updateSubTaskProgress(jobId, 'trends', 10, 'Fetching Content Trends...');
        const result = await jobOrchestrator.runApifyActor(ACTOR_ID, input, jobId, {
            taskName: 'Trends Mining (Media)',
            query: query,
            sampleSize: sampleSize,
            ignoreCache: false
        });
        await BaseMiner.updateSubTaskProgress(jobId, 'trends', 80, 'Analyzing Hashtags & Topics...');
        // 5. Process Data (Extract Hashtags & Topics)
        const hashtags = {};
        const topics = {};
        result.items.forEach((item) => {
            // Collect Hashtags
            if (item.hashtags && Array.isArray(item.hashtags)) {
                item.hashtags.forEach((tag) => {
                    const t = tag.toLowerCase();
                    hashtags[t] = (hashtags[t] || 0) + 1;
                });
            }
            // Collect Caption Words (Simple Topic Extraction)
            if (item.caption) {
                // Very basic tokenizer
                const words = item.caption.split(/\s+/).filter((w) => w.length > 4 && !w.startsWith('#') && !w.startsWith('@'));
                words.forEach((w) => {
                    const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (t)
                        topics[t] = (topics[t] || 0) + 1;
                });
            }
        });
        // Top 10
        const topHashtags = Object.entries(hashtags)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));
        const topTopics = Object.entries(topics)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([topic, count]) => ({ topic, count }));
        console.log(`[TrendsMiner] Found ${topHashtags.length} top hashtags.`);
        // 6. Complete
        await BaseMiner.completeSubTask(jobId, 'trends', {
            target: target,
            hashtags: topHashtags,
            topics: topTopics,
            mediaCount: result.items.length,
            datasetId: result.datasetId
        });
        console.log(`[TrendsMiner] ✅ Finished Job ${jobId}`);
    }
    catch (e) {
        await BaseMiner.handleFailure(jobId, 'trends', e);
        throw e;
    }
};
