import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
// User-provided Apify Residential Proxy URL
const PROXY_URL = 'http://groups-RESIDENTIAL:qX2XBppx8uXfaLYWdpiQSLTz8@proxy.apify.com:8000';
/**
 * Fetch media (images/videos) via Apify Residential Proxy
 * NOTE: This function is for Node.js environment only (Scripts/Server)
 */
export const fetchMediaViaProxy = async (url, outputPath) => {
    try {
        console.log(`[ProxyService] Fetching ${url} via Apify Proxy...`);
        const agent = new HttpsProxyAgent(PROXY_URL);
        const response = await fetch(url, {
            // @ts-ignore - 'agent' is not in standard Fetch API but supported by node-fetch (if polyfilled) 
            // or we use a custom http/https request for strict compat.
            // For modern Node (v18+), native fetch might not support 'agent' directly without 'dispatcher' from undici.
            // Let's use standard http/https for max compatibility or check if 'agent' works.
            // Actually, for Node 18+ native fetch, we need 'undici' dispatcher.
            // But let's assume standard usage or fallback to axios/node-fetch if installed?
            // "https-proxy-agent" works with 'http.request'.
            // Simpler approach: Use the agent in the options if using node-fetch
            agent: agent
        });
        if (!response.ok) {
            console.error(`[ProxyService] Failed to fetch: ${response.status} ${response.statusText}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (outputPath) {
            fs.writeFileSync(outputPath, buffer);
            console.log(`[ProxyService] Saved to ${outputPath}`);
        }
        return buffer;
    }
    catch (error) {
        console.error("[ProxyService] Error fetching media:", error);
        return null;
    }
};
/**
 * Batch download media for a list of URLs
 */
export const batchDownloadMedia = async (items, outputDir) => {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log(`[ProxyService] Starting batch download for ${items.length} items...`);
    for (const item of items) {
        const ext = item.url.split('.').pop()?.split('?')[0] || 'jpg';
        const filename = `${item.id}.${ext}`;
        const filePath = path.join(outputDir, filename);
        if (fs.existsSync(filePath)) {
            console.log(`[ProxyService] Skipping ${filename} (Exists)`);
            continue;
        }
        await fetchMediaViaProxy(item.url, filePath);
        // Small delay to be polite
        await new Promise(r => setTimeout(r, 500));
    }
    console.log("[ProxyService] Batch download complete.");
};
