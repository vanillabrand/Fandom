import { Dataset } from 'crawlee';

export const handleTikTok = async (context: any, input: any) => {
    const { page, request, log } = context;
    const { url } = request;
    const dataType = input.dataType;

    log.info(`[TT] Processing ${url} for ${dataType}`);

    // 1. Navigate (with fingerprint)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 2. The "Blisteringly Fast" Extraction
    const data = await page.evaluate(() => {
        // Universal parser for SIGI/NEXT data
        function getJSON(id) {
            const el = document.getElementById(id);
            return el && el.textContent ? JSON.parse(el.textContent) : null;
        }
        const sigi = getJSON('SIGI_STATE') || getJSON('__NEXT_DATA__') || getJSON('__UniversalNX__');
        return sigi;
    });

    if (data) {
        log.info(`[TT] Extracted State Data (${dataType})`);

        const userModule = data.UserModule?.users || data.UserModule;
        const statsModule = data.UserModule?.stats;
        const itemModule = data.ItemModule; // Posts are here

        // Resolve Target Profile
        let profile: any = null;
        if (userModule) {
            const keys = Object.keys(userModule);
            if (keys.length > 0) profile = userModule[keys[0]];
        }

        // PROFILE / FOLLOWERS / FOLLOWING (Lightweight Stats)
        if (profile && (dataType === 'profile' || dataType === 'followers' || dataType === 'following')) {
            const profileData: any = profile;
            await Dataset.pushData({
                type: dataType,
                platform: 'tiktok',
                username: profileData.uniqueId,
                data: {
                    user: profileData,
                    stats: statsModule ? statsModule[profileData.uniqueId] : {}
                },
                method: 'sigi_state'
            });
            // Note: Public TikTok does not easily show full follower lists without auth + sliding.
            // We return the stats object which contains the counts.
        }

        // POSTS
        if (dataType === 'posts' && itemModule) {
            const postIds = Object.keys(itemModule);
            log.info(`[TT] Found ${postIds.length} posts in state.`);

            const posts = postIds.map(id => itemModule[id]);
            await Dataset.pushData(posts.map(p => ({
                type: 'post',
                platform: 'tiktok',
                data: p,
                method: 'sigi_state_items'
            })));
        }

        if (dataType === 'posts' && !itemModule) {
            log.warning('[TT] Posts requested but ItemModule empty. Page might be private or empty.');
        }

        return; // Fast Exit
    }

    // 3. Fallback: UI Scraping
    log.info('[TT] SIGI_STATE fail. UI Fallback.');
    // ... (Use existing UI logic from previous step, but just logging warning for now as speed is priority)
    log.warning('[TT] UI Fallback skipped for speed. Ensure network integrity.');
};
