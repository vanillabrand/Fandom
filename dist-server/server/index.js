import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyticsService } from './services/analyticsService.js';
import { stripeService } from './services/stripeService.js';
import proxyRoutes from './routes/proxy.js';
import aiRoutes from './routes/ai.js'; // [PERFORMANCE] AI cache routes
import { mongoService } from './services/mongoService.js';
import mongoRoutes from './routes-mongo.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { jobOrchestrator } from './services/jobOrchestrator.js';
import { marketingService } from './services/marketingService.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load environment variables
const isProd = __dirname.includes('dist-server');
const rootDir = isProd ? path.resolve(__dirname, '../../') : path.resolve(__dirname, '../');
console.log(`📂 User Data Root: ${rootDir}`);
const envLocalPath = path.resolve(rootDir, '.env.local');
const envPath = path.resolve(rootDir, '.env');
// Try loading .env.local
if (fs.existsSync(envLocalPath)) {
    console.log(`Loading env from: ${envLocalPath}`);
    const result = dotenv.config({ path: envLocalPath });
    if (result.error)
        console.error("Error loading .env.local:", result.error);
}
else {
    console.log(`No .env.local found at: ${envLocalPath}`);
}
// Fallback/Override with .env if needed (dotenv won't overwrite existing keys by default)
if (fs.existsSync(envPath)) {
    console.log(`Loading env from: ${envPath}`);
    dotenv.config({ path: envPath });
}
console.log("Environment Keys Check:");
console.log("- GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Set (OK)" : "MISSING");
console.log("- APIFY_API_TOKEN:", (process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN) ? "Set (OK)" : "MISSING");
console.log("- MONGO_DB_CONNECT:", process.env.MONGO_DB_CONNECT ? "Set (OK)" : "MISSING");
console.log("- MAILJET_APIKEY:", process.env.MAILJET_APIKEY ? "Set (OK)" : "MISSING");
console.log("- MAILJET_APISECRET:", process.env.MAILJET_APISECRET ? "Set (OK)" : "MISSING");
console.log("✅ All basic env checks passed.");
console.log('🚀 Server process starting...');
console.log(`📝 Environment PORT: ${process.env.PORT}`);
const app = express();
// Cloud Run sets process.env.PORT, default to 3001 locally
const PORT = process.env.PORT || 3001;
import { createProxyMiddleware } from 'http-proxy-middleware';
// Middleware
app.use(cors());
// Security Headers - Allow Google Auth Popups
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});
// Proxy Apify API requests - MUST be before body-parser/express.json
app.use('/apify-api', createProxyMiddleware({
    target: 'https://api.apify.com',
    changeOrigin: true,
    pathRewrite: { '^/apify-api': '' },
    onProxyReq: (proxyReq, req, res) => {
        // Add auth token if provided in client headers
        if (req.headers['authorization']) {
            proxyReq.setHeader('Authorization', req.headers['authorization']);
        }
        // IMPORTANT: If body is already parsed (shouldn't be if placed correctly), restream it
        if (req.body && Object.keys(req.body).length > 0) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
        }
    },
    onProxyRes: (proxyRes, req, res) => {
        // Log errors from Apify
        if (proxyRes.statusCode >= 400) {
            console.error(`[Apify Proxy] Error ${proxyRes.statusCode}: ${req.method} ${req.url}`);
        }
    }
}));
// Body parsing middleware (Regenerated after proxy)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
// MongoDB connection
const PRIMARY_URI = process.env.MONGO_DB_CONNECT;
const SECONDARY_URI = process.env.MONGODB_URI; // Legacy fallback or Atlas
let isDbConnected = false;
let dbConnectionError = null;
const connectWithFallback = async () => {
    if (!PRIMARY_URI && !SECONDARY_URI) {
        console.error('❌ No MongoDB connection string found in .env.local');
        dbConnectionError = "Missing Connection String";
        // process.exit(1); // [FIX] Don't crash, allow debug route
        return;
    }
    try {
        console.log(`🔌 Attempting primary MongoDB connection...`);
        await mongoService.connect(PRIMARY_URI || SECONDARY_URI);
        console.log('✅ MongoDB connected successfully');
        isDbConnected = true;
        marketingService.startCron();
    }
    catch (error) {
        console.warn('⚠️ Primary MongoDB connection failed:', error.message);
        if (PRIMARY_URI && SECONDARY_URI && PRIMARY_URI !== SECONDARY_URI) {
            try {
                console.log('🔌 Attempting fallback MongoDB connection...');
                await mongoService.connect(SECONDARY_URI);
                console.log('✅ Fallback MongoDB connected successfully');
                isDbConnected = true;
                marketingService.startCron();
            }
            catch (fallbackError) {
                console.error('❌ All MongoDB connection attempts failed:', fallbackError.message);
                dbConnectionError = fallbackError.message;
                // process.exit(1); // [FIX] Don't crash
            }
        }
        else {
            console.error('❌ MongoDB connection failed and no fallback available.');
            dbConnectionError = error.message;
            // process.exit(1); // [FIX] Don't crash
        }
    }
};
connectWithFallback();
// Routes - MongoDB only
app.use('/api', mongoRoutes);
// Mount Proxy Route (handled by proxy.ts router)
app.use('/api', proxyRoutes);
// [PERFORMANCE] Mount AI Cache Routes
app.use('/api', aiRoutes);
// Serve static files in production
const distPath = path.resolve(rootDir, 'dist');
console.log(`📂 Serving static files from: ${distPath}`);
app.use(express.static(distPath, { index: false }));
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mongodb: mongoService.isConnected(),
        timestamp: new Date().toISOString()
    });
});
// [DEBUG] Diagnostic Route for Cloud Run
app.get('/debug-env', (req, res) => {
    try {
        const indexPath = path.join(distPath, 'index.html');
        const debugInfo = {
            timestamp: new Date().toISOString(),
            __filename,
            __dirname,
            rootDir,
            distPath,
            distExists: fs.existsSync(distPath),
            indexExists: fs.existsSync(indexPath),
            distContents: fs.existsSync(distPath) ? fs.readdirSync(distPath) : 'PATH_NOT_FOUND',
            env: {
                PORT: process.env.PORT,
                NODE_ENV: process.env.NODE_ENV,
                MONGO_SET: !!process.env.MONGO_DB_CONNECT,
                DB_CONNECTED: isDbConnected,
                DB_ERROR: dbConnectionError
            }
        };
        res.json(debugInfo);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Handle SPA routing for any request that didn't match an API route
app.get(/.*/, (req, res) => {
    // Read the index.html file
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        console.error(`CRITICAL: index.html NOT FOUND at: ${indexPath}`);
        // Try to list the directory to see what IS there
        const dirContents = fs.existsSync(distPath) ? fs.readdirSync(distPath) : 'DIST_DIR_MISSING';
        return res.status(500).send(`
            <h1>500 - Application Build Missing</h1>
            <p>Could not find <code>index.html</code> at <code>${indexPath}</code></p>
            <p><strong>distPath:</strong> ${distPath}</p>
            <p><strong>Directory Contents:</strong> ${JSON.stringify(dirContents)}</p>
        `);
    }
    fs.readFile(indexPath, 'utf8', (err, htmlData) => {
        if (err) {
            console.error('Error reading index.html:', err);
            return res.status(500).send('Error loading application: ' + err.message);
        }
        // Inject environment variables at runtime
        // This allows Cloud Run env vars to be available to the client
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || '';
        const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
        // console.log('[Server] Injecting Config into HTML. Valid GEMINI_API_KEY present:', !!geminiKey);
        if (!geminiKey)
            console.warn('[Server] WARNING: GEMINI_API_KEY is missing in process.env!');
        if (!apifyToken)
            console.warn('[Server] WARNING: APIFY_API_TOKEN is missing in process.env!');
        if (!googleClientId)
            console.warn('[Server] WARNING: GOOGLE_CLIENT_ID is missing in process.env!');
        const envScript = `
            <script>
                window.__ENV__ = {
                    GEMINI_API_KEY: "${geminiKey}",
                    APIFY_API_TOKEN: "${apifyToken}",
                    VITE_GOOGLE_CLIENT_ID: "${googleClientId}",
                    VITE_CLOUDRUN_SCRAPER_URL: "${process.env.VITE_CLOUDRUN_SCRAPER_URL || ''}",
                    VITE_STRIPE_PUBLISHABLE_KEY: "${process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || ''}"
                };
            </script>
        `;
        // Inject into <head>
        const finalHtml = htmlData.replace('</head>', `${envScript}</head>`);
        res.send(finalHtml);
    });
});
// DELETE /api/jobs/:id - Handled by routes-mongo.ts
// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Backend Server running on port ${PORT}`);
    console.log(`📊 Database: MongoDB`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health\n`);
    // Start background job polling
    jobOrchestrator.startPolling();
});
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down gracefully...');
    await mongoService.disconnect();
    process.exit(0);
});
