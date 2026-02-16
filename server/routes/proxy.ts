
import express from 'express';
import https from 'https';
import http from 'http';
import { parse } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { mongoService } from '../services/mongoService.js';

const router = express.Router();

// PROXY CONFIGURATION
// [PRIMARY] Use the Apify proxy from environment (works for both local and cloud)
const APIFY_PROXY_URL = process.env.APIFY_PROXY_URL;

// [FALLBACK] ProxyJet proxies
const PROXY_LEAD = process.env.PROXYJET_PROXY_LEAD;
const PROXY_FALL = process.env.PROXYJET_PROXY_FALL;

// Build proxy list with Apify as primary
const PROXY_LIST = [
    APIFY_PROXY_URL,  // Primary: Apify residential proxy
    PROXY_LEAD,       // Fallback 1: ProxyJet UK
    PROXY_FALL        // Fallback 2: ProxyJet any
].filter(p => p && p.trim().length > 0).map(p => p!.startsWith('http') ? p! : `http://${p}`);

// [DEBUG] Log available proxies on startup (mask credentials)
console.log(`[Proxy] Initialized with ${PROXY_LIST.length} proxies.`);
if (APIFY_PROXY_URL) console.log(`[Proxy] Primary: ${APIFY_PROXY_URL.replace(/:[^:]*@/, ':****@')}`);
else console.warn(`[Proxy] WARNING: APIFY_PROXY_URL is missing!`);

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me';
const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Cost per image load (credits)
const IMAGE_PROXY_COST = 0.01;

// GET /api/proxy-image?url=...&token=...
router.get('/proxy-image', async (req: any, res) => {
    const urlObj = parse(req.url || '', true);
    const targetUrl = urlObj.query.url as string;
    const token = urlObj.query.token as string; // Token passed in query param for images

    if (!targetUrl) {
        return res.status(400).send('Missing url');
    }

    // [FIX] Validate URL format to prevent "Invalid URL" errors
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        console.warn('[Proxy] Invalid URL format:', targetUrl);
        return res.status(400).send('Invalid URL format - must start with http:// or https://');
    }

    // Additional validation - check if URL is parseable
    try {
        new URL(targetUrl);
    } catch (err) {
        console.warn('[Proxy] Malformed URL:', targetUrl);
        return res.status(400).send('Malformed URL');
    }


    // 1. BILLING & AUTHENTICATION
    let userId: string | null = null;

    if (token) {
        // [FIX] Support both Google ID Tokens and Custom JWTs
        try {
            // First try Google (most common for users)
            if (GOOGLE_CLIENT_ID) {
                try {
                    const ticket = await googleClient.verifyIdToken({
                        idToken: token,
                        audience: GOOGLE_CLIENT_ID,
                    });
                    const payload = ticket.getPayload();
                    userId = payload?.sub || null;
                } catch (googleErr: any) {
                    // If Google fails, fallback to local JWT check
                    try {
                        const decoded: any = jwt.verify(token, JWT_SECRET);
                        userId = decoded.sub;
                    } catch (jwtErr: any) {
                        // Both failed - only warn if it doesn't look like a temporary token mismatch
                        if (!jwtErr.message.includes('invalid algorithm')) {
                            console.warn('[Proxy] Auth verification failed:', jwtErr.message);
                        }
                    }
                }
            } else {
                // Fallback if Google Client ID not configured
                const decoded: any = jwt.verify(token, JWT_SECRET);
                userId = decoded.sub;
            }
        } catch (err: any) {
            // Catch-all for standard JWT failures (e.g. invalid secret)
            // We don't log 'invalid algorithm' anymore as it's common for Google tokens
            if (err.message && !err.message.includes('invalid algorithm')) {
                console.warn('[Proxy] Invalid token:', err.message);
            }
        }
    } else {
        // Check standard auth header just in case
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const authToken = authHeader.split(' ')[1];
            try {
                // Simplified check for header
                const decoded: any = jwt.verify(authToken, JWT_SECRET);
                userId = decoded.sub;
            } catch (err) {
                // Silent for header failures in proxy context
            }
        }
    }

    // 2. CHECK BALANCE & DEDUCT CREDITS
    if (userId) {
        try {
            // Check balance first to avoid going negative? 
            // For tiny amounts like 0.01, maybe just deduct.
            // Logic: Deduct 0.01. If fail, deny?
            // "ensure that the users prroxy usage is charged for"

            // To prevent DB spam for every single image, we could:
            // A) Batch updates (complex)
            // B) Just do it (simplest, robust)
            // C) Check a cache?

            // We'll proceed with direct deduction for reliability.
            const success = await mongoService.updateUserCredits(userId, -IMAGE_PROXY_COST);

            if (!success) {
                console.log(`[Proxy] User ${userId} insufficient credits for image`);
                return res.status(402).send('Insufficient credits');
            }

            // Optional: Log transaction? Logging 100x 0.01 might be noisy. 
            // Maybe we skip logging specific transactions for image proxy to save DB space?
            // checking mongoService.logTransaction usage... usually it's used.
            // Let's NOT log every image transaction to 'transactions' collection unless required.
            // It would flood the logs.

        } catch (err) {
            console.error('[Proxy] Billing error:', err);
            // Proceed? Or fail? Fail safe.
            return res.status(500).send('Billing system error');
        }
    }

    // 3. PROXY REQUEST (with Rotation Fallback)
    const tryProxy = async (proxyUrl: string, attempt: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const agent = new HttpsProxyAgent(proxyUrl);
            const isHttps = targetUrl.startsWith('https');
            const requestModule = isHttps ? https : http;

            // [FIX] Add Dynamic Referer headers for Social Media Scrapes
            const headers: any = {
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,image/webp,image/apng,image/*,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Sec-Fetch-Site': 'cross-site',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Dest': 'image',
                'Accept-Encoding': 'identity', // Avoid issues with brotli/gzip for now unless properly handled
                'Accept-Language': 'en-US,en;q=0.9'
            };

            if (targetUrl.includes('instagram.com')) {
                headers['Referer'] = 'https://www.instagram.com/';
                headers['Origin'] = 'https://www.instagram.com';
            } else if (targetUrl.includes('tiktok.com')) {
                headers['Referer'] = 'https://www.tiktok.com/';
            }

            // [FIX] Forward Range header for video streaming
            if (req.headers.range) {
                headers['Range'] = req.headers.range;
            }

            const proxyReq = requestModule.get(targetUrl, {
                agent,
                timeout: 10000, // Faster timeout (10s) for rotation
                headers: headers
            }, (proxyRes) => {
                const proxyUrlMasked = proxyUrl.replace(/:[^:]*@/, ':****@');
                console.log(`[Proxy] Request to ${targetUrl} via ${proxyUrlMasked} returned ${proxyRes.statusCode}`);

                if (proxyRes.statusCode && proxyRes.statusCode >= 400 && attempt < PROXY_LIST.length - 1) {
                    console.warn(`[Proxy] Attempt ${attempt + 1} failed with ${proxyRes.statusCode}. Trying next proxy...`);
                    resolve(false);
                    return;
                }

                // Forward headers
                const contentType = proxyRes.headers['content-type'];
                if (contentType) res.setHeader('Content-Type', contentType);

                // [FIX] Security Headers for WebGL/Canvas to prevent NotSameOrigin errors
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
                res.setHeader('Access-Control-Allow-Origin', '*');

                // [PERFORMANCE] Aggressive caching for media files
                const cacheControl = proxyRes.headers['cache-control'];
                if (cacheControl) {
                    res.setHeader('Cache-Control', cacheControl);
                } else {
                    // 7 days cache for images/videos (604800 seconds)
                    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
                    res.setHeader('CDN-Cache-Control', 'public, max-age=2592000'); // 30 days for CDN
                }

                res.writeHead(proxyRes.statusCode || 200);
                proxyRes.pipe(res);
                resolve(true);
            });

            proxyReq.on('timeout', () => {
                console.warn(`[Proxy] Attempt ${attempt + 1} timed out for ${targetUrl}`);
                proxyReq.destroy();
                resolve(false);
            });

            proxyReq.on('error', (err) => {
                console.warn(`[Proxy] Attempt ${attempt + 1} error: ${err.message}`);
                resolve(false);
            });
        });
    };

    // Execute rotation
    let success = false;
    for (let i = 0; i < PROXY_LIST.length; i++) {
        success = await tryProxy(PROXY_LIST[i], i);
        if (success) break;
    }

    if (!success && !res.headersSent) {
        console.error(`[Proxy] All proxies failed for: ${targetUrl} (Status code logic might have triggered fallback)`);
        res.status(502).send('Upstream proxy failure across all providers');
    }
});

export default router;
