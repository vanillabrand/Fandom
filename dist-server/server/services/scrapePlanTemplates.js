/**
 * Scrape Plan Templates
 * Provides "Golden Plans" for different query intents to ensure consistent and high-quality results.
 */
export const SCRAPE_TEMPLATES = {
    'over_indexing': {
        intent: 'over_indexing',
        reasoning: 'Calculates affinity by analyzing who the followers of a target profile disproportionately follow.',
        getSteps: (targetProfile, sampleSize) => {
            // Calculate proportional limit for secondary scrape (followings)
            // Use 5% of sample size with a minimum of 50 and maximum of 250
            const secondaryLimit = Math.min(250, Math.max(50, Math.ceil(sampleSize * 0.05)));
            return [
                {
                    id: 'step_1',
                    description: `Scrape followers of @${targetProfile}`,
                    actorId: 'thenetaji/instagram-followers-followings-scraper',
                    input: { username: [targetProfile], type: 'followers', max_count: sampleSize },
                    estimatedRecords: sampleSize,
                    estimatedCost: (sampleSize / 1000) * 5.0,
                    reasoning: 'Base audience identification',
                    status: 'pending'
                },
                {
                    id: 'step_2',
                    description: 'Analyze network to find over-indexed accounts',
                    actorId: 'thenetaji/instagram-followers-followings-scraper',
                    input: { username: ['USE_DATA_FROM_STEP_step_1'], type: 'followings', max_count: secondaryLimit },
                    // Cost is based on number of PROFILES scraped (sampleSize), not total data points
                    // Each profile from step 1 gets their followings scraped (up to secondaryLimit each)
                    estimatedRecords: Math.min(500, Math.ceil(sampleSize * 0.1)), // Estimate ~10% unique over-indexed profiles
                    dependsOnStepId: 'step_1',
                    estimatedCost: (sampleSize / 1000) * 5.0, // Cost = profiles scraped, not data collected
                    reasoning: `Discovery of affinity signal (${secondaryLimit} followings per follower)`,
                    status: 'pending'
                },
                {
                    id: 'step_3',
                    description: 'Enrich discovered creators and brands',
                    actorId: 'apify/instagram-api-scraper',
                    input: { directUrls: ['USE_DATA_FROM_STEP_step_2'], resultsType: 'details', addParentData: true, resultsLimit: 1 },
                    estimatedRecords: Math.min(200, Math.ceil(sampleSize * 0.05)), // Estimate top unique signals
                    dependsOnStepId: 'step_2',
                    estimatedCost: 0.25,
                    reasoning: 'Hydration of profile data (pics, bios, metrics)',
                    status: 'pending'
                }
            ];
        }
    },
    'influencer_identification': {
        intent: 'influencer_identification',
        reasoning: 'Discovers creators in a specific niche using Instagram search and content enrichment.',
        getSteps: (focusCategory, sampleSize) => [
            {
                id: 'step_1',
                description: `Search Instagram for ${focusCategory}`,
                actorId: 'apify/instagram-scraper',
                input: { search: focusCategory, searchType: 'user', searchLimit: Math.min(250, sampleSize), resultsType: 'details', resultsLimit: 1 },
                estimatedRecords: Math.min(250, sampleSize),
                estimatedCost: (Math.min(250, sampleSize) / 1000) * 4.7,
                reasoning: 'Profile discovery via keyword search',
                status: 'pending'
            },
            {
                id: 'step_2',
                description: 'Enrich with latest posts and media',
                actorId: 'apify/instagram-api-scraper',
                input: { directUrls: ['USE_DATA_FROM_STEP_step_1'], resultsType: 'posts', resultsLimit: 6, addParentData: true },
                estimatedRecords: Math.min(250, sampleSize) * 6,
                dependsOnStepId: 'step_1',
                estimatedCost: 1.5,
                reasoning: 'Content hydration for UI gallery',
                status: 'pending'
            }
        ]
    },
    'geo_discovery': {
        intent: 'geo_discovery',
        reasoning: 'Uses Google Search to find location-specific Instagram profiles.',
        getSteps: (location, sampleSize) => [
            {
                id: 'step_1',
                description: `Google Search for Instagram profiles in ${location}`,
                actorId: 'apify/google-search-scraper',
                input: { queries: [`instagram ${location} creators`], maxPagesPerQuery: 3, resultsPerPage: Math.min(100, sampleSize) },
                estimatedRecords: Math.min(100, sampleSize),
                estimatedCost: 0.5,
                reasoning: 'Location-based discovery via Google index',
                status: 'pending'
            },
            {
                id: 'step_2',
                description: 'Enrich discovered profiles',
                actorId: 'apify/instagram-api-scraper',
                input: { directUrls: ['USE_DATA_FROM_STEP_step_1'], resultsType: 'details', addParentData: true },
                estimatedRecords: Math.min(100, sampleSize),
                dependsOnStepId: 'step_1',
                estimatedCost: 0.5,
                reasoning: 'Profile hydration',
                status: 'pending'
            }
        ]
    }
};
export const getTemplateForIntent = (intent) => {
    return SCRAPE_TEMPLATES[intent] || null;
};
