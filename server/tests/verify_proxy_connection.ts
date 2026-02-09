
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
// import settings from '../../.env.local' with { type: "json" }; // REMOVED: causing TS error and unused matches proper dotenv usage

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

async function verifyProxy() {
    console.log("-----------------------------------------");
    console.log("Testing Apify Proxy Connection...");

    // Construct Proxy URL from Env Vars (Preferred) to verify logic
    let proxyUrl = process.env.PROXYJET_PROXY_LEAD;

    if (!proxyUrl) {
        console.warn("No PROXYJET_PROXY_LEAD found in env, checking fallback...");
        proxyUrl = process.env.PROXYJET_PROXY_FALL;
    }

    if (!proxyUrl) {
        console.error("No ProxyJet proxies found in environment!");
    } else {
        if (!proxyUrl.startsWith('http')) proxyUrl = `http://${proxyUrl}`;
    }

    // Mask password for logging
    const maskedUrl = proxyUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`Proxy URL: ${maskedUrl}`);

    const agent = new HttpsProxyAgent(proxyUrl);

    try {
        console.log("Attempting to fetch httpbin.org/ip via proxy...");
        // Cast options to any to avoid TS mismatch between node-fetch and DOM types for 'timeout'
        const response = await fetch('https://httpbin.org/ip', { agent, timeout: 10000 } as any);

        if (response.ok) {
            const data: any = await response.json(); // Cast to any to access 'origin'
            console.log("✅ SUCCESS! Proxy is working.");
            console.log("Returned IP:", data.origin);
        } else {
            console.error(`❌ FAILED. Status: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Body:", text);
        }

    } catch (e: any) {
        console.error("❌ EXCEPTION during fetch:");
        console.error(e.message);
        if (e.message.includes('407')) {
            console.error("--> 407 = Invalid Proxy Credentials (Password/User wrong)");
        } else if (e.code === 'ECONNRESET' || e.message.includes('hang up')) {
            console.error("--> Connection Reset = Proxy might be down or blocking connection");
        }
    }
}

verifyProxy().catch(console.error);
