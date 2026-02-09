import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { chromium, firefox } from 'playwright';
import { ProxyManager } from './proxy-manager.js';
// We will import handlers dynamically or statically later
// import { instagramHandler } from './handlers/instagram.js';
// import { tiktokHandler } from './handlers/tiktok.js';

interface Input {
    platform: 'instagram' | 'tiktok';
    dataType: 'profile' | 'posts' | 'followers' | 'following';
    targets: string[]; // usernames or urls
    limit?: number;
    proxyConfiguration?: any;
    debug?: boolean;
}

import { handleInstagram } from './handlers/instagram.js';
import { handleTikTok } from './handlers/tiktok.js';

export async function runActor(inputOverrides?: any) {
    await Actor.init();

    // Support both Cloud Run JSON body and Apify Input
    const input = (await Actor.getInput() as Input) || inputOverrides;
    if (!input) throw new Error('Input is missing!');

    console.log(`[Scraper] Starting ${input.platform} scrape (${input.dataType}) for ${input.targets?.length} targets.`);

    const proxyConfiguration = await ProxyManager.createConfiguration(input.proxyConfiguration || {});

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        useSessionPool: true,
        persistCookiesPerSession: false, // NO COOKIES (Guest Mode)
        headless: true, // Specific handlers might override this if needed

        // Dynamic browser selection
        browserPoolOptions: {
            useFingerprints: false,
            preLaunchHooks: [(_pageId, launchContext) => {
                launchContext.launcher = (input.platform === 'tiktok') ? firefox : chromium;
            }]
        },

        requestHandler: async (context) => {
            // Pass the full input to handlers so they know what dataType to look for
            if (input.platform === 'instagram') return handleInstagram(context, input);
            if (input.platform === 'tiktok') return handleTikTok(context, input);
        },

        failedRequestHandler: async ({ request, error }) => {
            const err = error as Error;
            console.error(`[Scraper] Request ${request.url} failed: ${err.message}`);
        },
    });

    await crawler.run(input.targets);
    await Actor.exit();
}

// Auto-run if main module
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runActor();
}
