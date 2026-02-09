import { Dataset } from 'crawlee';

export const handleInstagram = async (context: any, input: any) => {
    const { page, request, log } = context;
    const { url } = request;
    const dataType = input.dataType;

    log.info(`[IG] Processing ${url} for ${dataType}`);

    let dataFound = false;

    // 1. Setup Network Interceptor (The "Blisteringly Fast" part)
    page.on('response', async (response: any) => {
        if (dataFound) return;
        const responseUrl = response.url();

        // Match specific GraphQL endpoints based on dataType
        if (responseUrl.includes('graphql/query')) {
            try {
                const json = await response.json();

                // PROFILE Scrape
                if (dataType === 'profile' && json.data?.user) {
                    log.info('[IG] Intercepted Profile Data');
                    await Dataset.pushData({ type: 'profile', platform: 'instagram', username: json.data.user.username, data: json.data.user });
                    dataFound = true;
                }

                // POSTS Scrape
                // specific query hash for timeline or 'edge_owner_to_timeline_media'
                if (dataType === 'posts' && json.data?.user?.edge_owner_to_timeline_media) {
                    log.info('[IG] Intercepted Posts Data');
                    const posts = json.data.user.edge_owner_to_timeline_media.edges.map((e: any) => e.node);
                    await Dataset.pushData(posts.map((p: any) => ({ type: 'post', platform: 'instagram', data: p })));
                    dataFound = true;
                }

                // FOLLOWERS Scrape (requires Auth usually, but we try public first)
                if (dataType === 'followers' && json.data?.user?.edge_followed_by) {
                    log.info('[IG] Intercepted Followers Data');
                    const followers = json.data.user.edge_followed_by.edges.map((e: any) => e.node);
                    await Dataset.pushData(followers.map((f: any) => ({ type: 'follower', platform: 'instagram', data: f })));
                    dataFound = true;
                }
            } catch (e) { }
        }
    });

    // 2. Navigate (with strict timeout)
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // If we need specific tabs (e.g. followers), we might need to click or navigate further
        // BUT public view blocks followers usually, so we rely on initial data bundle

        if (dataType === 'posts') {
            // Sometimes scrolling triggers the XHR we want
            await page.mouse.wheel(0, 1000);
        }

    } catch (e) {
        log.warning(`[IG] Nav timeout or abort: ${e}`);
    }

    // 3. Post-Load Fallback (if Interceptor missed)
    if (!dataFound) {
        log.info('[IG] Interceptor missed, trying _sharedData dump...');
        const sharedData = await page.evaluate(() => {
            // @ts-ignore
            return window._sharedData?.entry_data?.ProfilePage?.[0]?.graphql?.user || (window as any).__additionalData?.[location.pathname]?.data?.graphql?.user;
        });

        if (sharedData) {
            if (dataType === 'profile') {
                await Dataset.pushData({ type: 'profile', platform: 'instagram', username: sharedData.username, data: sharedData, method: 'sharedData_fallback' });
            } else if (dataType === 'posts') {
                const posts = sharedData.edge_owner_to_timeline_media?.edges?.map((e: any) => e.node) || [];
                await Dataset.pushData(posts.map((p: any) => ({ type: 'post', platform: 'instagram', data: p, method: 'sharedData_fallback' })));
            } else if (dataType === 'followers') {
                // Public sharedData usually has counts but not full list. 
                // We push what we have or log warning.
                log.warning('[IG] Public sharedData does not contain full follower list. Returning auth-wall warning.');
            }
            dataFound = true;
        }
    }
};
