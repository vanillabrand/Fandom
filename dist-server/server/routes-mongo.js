import express from 'express';
import { ObjectId } from 'mongodb';
import { mongoService } from './services/mongoService.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { jobOrchestrator } from './services/jobOrchestrator.js';
import { costCalculator } from './services/costCalculator.js';
import { invoiceService } from './services/invoiceService.js';
import { emailService } from './services/emailService.js';
import { analyticsService } from './services/analyticsService.js';
import { stripeService } from './services/stripeService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me';
// --- AUTH & USER ROUTES ---
// POST /api/auth/email/signup
router.post('/auth/email/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const promoCode = req.body.promoCode ? String(req.body.promoCode).toUpperCase() : undefined; // Ensure promoCode is uppercase string or undefined
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password required' });
        const existingUser = await mongoService.getUserByEmail(email);
        if (existingUser)
            return res.status(400).json({ error: 'User already exists' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await mongoService.createUser({
            googleId: email, // Use email as ID for email users
            email,
            name: name || email.split('@')[0],
            picture: '', // No picture for email users initially
            passwordHash
        }, promoCode);
        // Send welcome email
        try {
            const welcomeEmail = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #10b981; font-size: 32px; margin-bottom: 10px;">Welcome to Fandom Analytics! 🎉</h1>
                        <p style="color: #64748b; font-size: 16px; margin: 0;">Your account has been created successfully</p>
                    </div>
                    
                    <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                        <p style="margin: 0; color: #ffffff; font-size: 15px; line-height: 1.7;">
                            Hi <strong>${user.name}</strong>,<br><br>
                            Thank you for signing up! Your account is currently <strong style="color: #fbbf24;">pending approval</strong>.
                        </p>
                    </div>

                    <div style="background-color: #1a4d2e33; border-left: 4px solid #10b981; padding: 20px; margin-bottom: 20px;">
                        <h3 style="color: #10b981; margin: 0 0 10px 0; font-size: 16px;">✅ Available Now: Quick Map</h3>
                        <p style="margin: 0; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
                            While your account is being reviewed, you can start using the <strong>Quick Map</strong> feature to explore influencer networks and content creators.
                        </p>
                    </div>

                    <div style="background-color: #fef3c722; border-left: 4px solid #fbbf24; padding: 20px; margin-bottom: 25px;">
                        <h3 style="color: #fbbf24; margin: 0 0 10px 0; font-size: 16px;">⏳ Pending Approval: Full Access</h3>
                        <p style="margin: 0; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
                            Advanced features like Deep Search, Batch Analysis, and AI-powered insights will be available once an administrator approves your account. You'll receive an email notification when this happens.
                        </p>
                    </div>

                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                        <p style="font-size: 14px; color: #64748b; margin: 0 0 10px 0;">
                            Questions? Reply to this email or use the Support tab in your profile.
                        </p>
                        <p style="font-size: 12px; color: #475569; margin: 0;">
                            Fandom Analytics Team
                        </p>
                    </div>
                </div>
            `;
            await emailService.sendEmail(email, 'Welcome to Fandom Analytics - Account Created', welcomeEmail);
            console.log(`[Signup] Welcome email sent to ${email}`);
        }
        catch (emailError) {
            console.error('[Signup] Failed to send welcome email:', emailError);
            // Don't fail signup if email fails
        }
        // Generate Token
        const token = jwt.sign({
            sub: user.googleId,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            picture: user.picture || ''
        }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/auth/email/login
router.post('/auth/email/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password required' });
        const user = await mongoService.getUserByEmail(email);
        if (!user || !user.passwordHash)
            return res.status(401).json({ error: 'Invalid credentials' });
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid)
            return res.status(401).json({ error: 'Invalid credentials' });
        // Generate Token
        const token = jwt.sign({
            sub: user.googleId,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            picture: user.picture || ''
        }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Login / Verify Token (Google)
router.post('/auth/login', authMiddleware, async (req, res) => {
    try {
        const user = req.user;
        let dbUser = await mongoService.getUser(user.sub);
        if (!dbUser) {
            dbUser = await mongoService.createUser({
                googleId: user.sub,
                email: user.email,
                name: user.name,
                picture: user.picture
            });
        }
        // [FIX] Auto-promote hardcoded admins if they exist but don't have the role
        if (dbUser.email && mongoService.isAdmin(dbUser.email) && dbUser.role !== 'admin') {
            await mongoService.makeAdmin(dbUser.googleId);
            dbUser.role = 'admin';
            dbUser.status = 'active';
        }
        // [NEW] Enforce Status Check
        if (dbUser.role !== 'admin' && dbUser.status === 'blocked') {
            return res.status(403).json({ error: 'Account blocked. Contact support.' });
        }
        // Return status so frontend knows to show "Pending" screen
        // ideally 403, but 200 with status allows frontend to render "Waiting" UI gracefully
        res.json({ status: 'ok', user: dbUser });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/balance
router.get('/user/balance', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const balance = await mongoService.getUserBalance(userId);
        res.json({ balance });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/usage - Monthly usage stats
router.get('/user/usage', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const month = req.query.month; // Optional YYYY-MM
        const logs = await mongoService.getUserMonthlyUsage(userId, month);
        // Calculate total
        const total = logs.reduce((sum, log) => sum + (log.chargedAmount || 0), 0);
        res.json({ logs, total });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/transactions
router.get('/user/transactions', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const transactions = await mongoService.getDb().collection('transactions')
            .find({ userId })
            .sort({ date: -1 })
            .limit(50)
            .toArray();
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// [NEW] GET /api/user/usage-history (Detailed usage logs)
router.get('/user/usage-history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(0); // Default to all time
        const logs = await mongoService.getUserUsageLogs(userId, startDate);
        res.json(logs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/auth/me (Refresh Profile)
router.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await mongoService.getUser(req.user.sub);
        if (user) {
            res.json(user);
        }
        else {
            res.status(404).json({ error: 'User not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- FINGERPRINT ROUTES ---
router.get('/fingerprints/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const db = mongoService.getDb();
        const result = await db.collection('scrape_fingerprints').findOne({ fingerprint });
        if (result) {
            res.json(result);
        }
        else {
            res.status(404).json({ error: 'Fingerprint not found' });
        }
    }
    catch (error) {
        console.error('Error checking fingerprint:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- DATASET ROUTES ---
// GET /api/datasets
router.get('/datasets', authMiddleware, async (req, res) => {
    try {
        const { limit, skip, platform, search, tags } = req.query;
        const options = {
            userId: req.user.sub, // Enforce ownership or sharing
            limit: parseInt(limit) || 50,
            skip: parseInt(skip) || 0,
            platform: platform,
            search: search,
            tags: tags ? tags.split(',') : undefined
        };
        const datasets = await mongoService.getDatasets(options);
        res.json(datasets);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/marketing-questions
router.get('/marketing-questions', async (req, res) => {
    try {
        const result = await mongoService.getLatestMarketingQuestions();
        if (result && result.questions) {
            res.json(result.questions);
        }
        else {
            // Fallback questions if none generated yet
            res.json([
                "What are the emerging subcultures in sustainable fashion?",
                "Which gaming influencers overlap with luxury brands?",
                "Map the fandom of @nike vs @adidas on TikTok."
            ]);
        }
    }
    catch (error) {
        console.error("Failed to fetch marketing questions:", error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/datasets/:id
router.get('/datasets/:id', authMiddleware, async (req, res) => {
    try {
        const dataset = await mongoService.getDatasetById(req.params.id);
        if (!dataset)
            return res.status(404).json({ error: 'Dataset not found' });
        // [NEW] RUNTIME GAP FILLING: Trigger background enrichment if gaps detected
        if (dataset && dataset.data) {
            const graphSnapshot = dataset.data.find((r) => r.recordType === 'graph_snapshot');
            if (graphSnapshot && graphSnapshot.data) {
                const gapHandles = jobOrchestrator.identifyEnrichmentGaps(graphSnapshot.data);
                if (gapHandles.length > 0) {
                    // Try to find an associated job
                    const associatedJobs = await mongoService.getJobsByDatasetId(dataset.id);
                    let isEnriching = associatedJobs.some((j) => j.metadata?.isEnriching === true) || dataset.isEnriching;
                    if (!isEnriching) {
                        let mainJob = associatedJobs.find((j) => j.type === 'map_generation' || j.type === 'enrichment' || j.type === 'orchestration');
                        // If no job found (e.g. for older datasets), create a placeholder enrichment job
                        if (!mainJob) {
                            console.log(`[DatasetLoadFill] No job found for dataset ${dataset.id}. Creating placeholder...`);
                            const jobId = new ObjectId().toHexString();
                            await mongoService.createJob({
                                id: jobId,
                                userId: dataset.userId || 'system',
                                type: 'enrichment',
                                status: 'running',
                                progress: 0,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                result: { datasetId: dataset.id, stage: 'Background Hydration' },
                                metadata: { isEnriching: true, datasetId: dataset.id }
                            });
                            mainJob = { id: jobId };
                        }
                        if (mainJob) {
                            console.log(`[DatasetLoadFill] ⚠️ Dataset ${dataset.id} has gaps. Triggering background enrichment...`);
                            const profileMap = new Map();
                            jobOrchestrator.performDeepEnrichment(graphSnapshot.data, dataset.id, mainJob.id, profileMap).catch((err) => {
                                console.error(`[DatasetLoadFill] ❌ Failed to enrich dataset ${dataset.id}:`, err);
                            });
                            dataset.isEnriching = true; // Set optimistically
                        }
                    }
                    else {
                        dataset.isEnriching = true;
                    }
                }
            }
        }
        res.json(dataset);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/datasets (Save Map)
router.post('/datasets', authMiddleware, async (req, res) => {
    try {
        const payload = req.body;
        const { data, ...datasetBase } = payload;
        datasetBase.userId = req.user.sub;
        datasetBase.createdAt = new Date();
        datasetBase.updatedAt = new Date();
        // 1. Create dataset
        const result = await mongoService.createDataset(datasetBase);
        // 2. Insert records if present
        if (data && Array.isArray(data)) {
            const records = data.map((r) => ({
                ...r,
                datasetId: datasetBase.id || result, // ID from payload or auto-gen
                createdAt: new Date()
            }));
            await mongoService.insertRecords(records);
        }
        res.status(201).json({ id: datasetBase.id || result });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/datasets/:id (Update Map/Link Share)
router.patch('/datasets/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const result = await mongoService.updateDataset(id, updates);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/datasets/:id
router.delete('/datasets/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // 1. Delete associated jobs (Activity Record)
        await mongoService.deleteJobsByDatasetId(id);
        // 2. Delete associated records (Actual data)
        await mongoService.deleteRecordsByDatasetId(id);
        // 3. Delete dataset metadata
        await mongoService.deleteDataset(id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- JOB ROUTES (Async Background Tasks) ---
// GET /api/jobs/:id/proxy-dataset - Proxy to Apify Dataset for Progress Map
router.get('/jobs/:id/proxy-dataset', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const job = await mongoService.getJob(req.params.id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        if (job.userId !== userId)
            return res.status(403).json({ error: 'Access denied' });
        const datasetIds = job.metadata?.datasetIds || (job.metadata?.datasetId ? [job.metadata.datasetId] : []);
        if (datasetIds.length === 0) {
            return res.json([]);
        }
        const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
        // Fetch all datasets in parallel
        const fetchPromises = datasetIds.map(async (dsId) => {
            const resp = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${apifyToken}&limit=5000&clean=true`);
            if (!resp.ok)
                return []; // Ignore failed/missing datasets for now
            return resp.json();
        });
        const results = await Promise.all(fetchPromises);
        // Flatten and Deduplicate
        const allItems = results.flat();
        const seen = new Set();
        const uniqueItems = [];
        for (const item of allItems) {
            const username = item.username || item.ownerUsername;
            if (username && !seen.has(username)) {
                seen.add(username);
                uniqueItems.push(item);
            }
        }
        res.json(uniqueItems);
    }
    catch (error) {
        console.error("Proxy dataset error:", error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/jobs - Start a new job
router.post('/jobs', authMiddleware, async (req, res) => {
    try {
        const { type, input } = req.body;
        const userId = req.user.sub;
        if (!type || !input) {
            return res.status(400).json({ error: 'Missing type or input' });
        }
        // [FINANCE] Pre-flight Balance Check
        // We only ESTIMATE here to prevent users with 0 credits from spamming jobs.
        // Admin users bypass balance checks.
        // Actual deduction happens in JobOrchestrator upon completion.
        let estimatedCost = 0;
        try {
            const isAdmin = req.user?.role === 'admin';
            if (!isAdmin) {
                // Determine 'count' from various possible input fields
                const limit = input.limit || input.sampleSize || input.max_count || input.count || input.resultsLimit || 20;
                if (type === 'map_generation' || type === 'discovery') {
                    const quote = await costCalculator.calculateQuickMapCost(limit);
                    estimatedCost = quote.chargedAmount;
                }
                else if (type === 'enrichment' || type === 'deep_dive') {
                    const quote = await costCalculator.calculateDeepSearchCost(limit);
                    estimatedCost = quote.chargedAmount;
                }
                else if (type === 'orchestration' || type === 'query_builder') {
                    const actorId = input.actorId || 'apify/instagram-scraper';
                    const quote = await costCalculator.calculateQueryBuilderCost(limit, actorId);
                    estimatedCost = quote.chargedAmount;
                }
                else if (type === 'ai_analysis') {
                    const quote = await costCalculator.calculateAiAnalysisCost(limit);
                    estimatedCost = quote.chargedAmount;
                }
                if (estimatedCost > 0) {
                    const balance = await mongoService.getUserBalance(userId);
                    if (balance < estimatedCost) {
                        return res.status(402).json({
                            error: 'Insufficient credits',
                            message: `Estimated cost: £${estimatedCost.toFixed(2)}, Available: £${balance.toFixed(2)}. Please top up to proceed.`
                        });
                    }
                }
            }
        }
        catch (err) {
            console.warn(`[Finance] Pre-flight check warning (user: ${userId}): ${err}`);
        }
        // Enqueue via orchestrator
        const jobId = await jobOrchestrator.enqueueJob(userId, type, input);
        // Ensure polling is active
        jobOrchestrator.startPolling();
        res.status(201).json({
            jobId,
            status: 'queued',
            message: 'Job started successfully'
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/jobs - List user jobs
router.get('/jobs', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const limit = parseInt(req.query.limit) || 20;
        const jobs = await mongoService.getUserJobs(userId, limit);
        res.json(jobs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/jobs/:id - Get specific job status
router.get('/jobs/:id', authMiddleware, async (req, res) => {
    try {
        const job = await mongoService.getJob(req.params.id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        if (job.userId !== req.user.sub) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // [NEW] RUNTIME GAP FILLING: Check for missing profile data in completed jobs
        const anyJob = job;
        if (anyJob.status === 'completed' && anyJob.result?.analysisResult) {
            const gapHandles = jobOrchestrator.identifyEnrichmentGaps(anyJob.result.analysisResult);
            if (gapHandles.length > 0) {
                console.log(`[RuntimeFill] ⚠️ Job ${anyJob.id} has ${gapHandles.length} profiles needing enrichment. Triggering background task...`);
                const profileMap = new Map();
                const datasetId = anyJob.result?.datasetId || anyJob.metadata?.datasetId;
                jobOrchestrator.performDeepEnrichment(anyJob.result.analysisResult, datasetId, anyJob.id, profileMap).catch((err) => {
                    console.error(`[RuntimeFill] ❌ Background enrichment failed for job ${anyJob.id}:`, err);
                });
                if (!anyJob.metadata)
                    anyJob.metadata = {};
                anyJob.metadata.isEnriching = true;
            }
        }
        res.json(job);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/jobs/:id - Cancel/Delete job
router.delete('/jobs/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const job = await mongoService.getJob(id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        if (job.userId !== req.user.sub)
            return res.status(403).json({ error: 'Access denied' });
        // Notify orchestrator to stop (if possible)
        await jobOrchestrator.cancelJob(id);
        // [FIX] Actually delete the job from DB so it disappears from UI
        await mongoService.deleteJob(id);
        res.json({ success: true, message: 'Job deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- CREDIT & SUPPORT ROUTES ---
// POST /api/credits/deduct
router.post('/credits/deduct', authMiddleware, async (req, res) => {
    try {
        const { amount, description, type, metadata } = req.body;
        const cost = Math.abs(amount); // Ensure positive cost value for deduction check
        // Super Admin Bypass
        const user = await mongoService.getUser(req.user.sub);
        if (user && user.email && mongoService.isAdmin(user.email)) {
            // Admin bypass: Just log 0 cost transaction
            await mongoService.logTransaction({
                userId: req.user.sub,
                cost: 0,
                description: `[Admin Bypass] ${description}`,
                type: type || 'Usage',
                metadata
            });
            return res.json({ success: true, remaining: user.balance });
        }
        const success = await mongoService.updateUserCredits(req.user.sub, -cost);
        if (!success) {
            return res.status(402).json({ error: 'Insufficient credits' });
        }
        const updatedUser = await mongoService.getUser(req.user.sub);
        await mongoService.logTransaction({
            userId: req.user.sub,
            cost: -cost,
            description,
            type: type || 'Usage',
            metadata,
            balance: updatedUser.balance // Log the new balance
        });
        res.json({ success: true, remaining: updatedUser.balance });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/support
router.post('/support', authMiddleware, async (req, res) => {
    try {
        const { subject, message, type } = req.body;
        const userEmail = req.user.email;
        const userName = req.user.name || userEmail;
        const userId = req.user.sub;
        // Generate unique ticket ID
        const ticketId = `TICKET-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${userId.substring(0, 8).toUpperCase()}`;
        // Create support ticket
        const ticket = {
            ticketId,
            userId,
            userEmail,
            userName,
            subject,
            status: 'open',
            priority: 'medium',
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: [{
                    id: `msg-${Date.now()}`,
                    sender: 'user',
                    senderName: userName,
                    senderEmail: userEmail,
                    message,
                    timestamp: new Date()
                }]
        };
        await mongoService.createSupportTicket(ticket);
        // Send confirmation email to user
        const userConfirmationEmail = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #10b981; font-size: 28px; margin-bottom: 10px;">Support Request Received ✅</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Ticket #${ticketId}</p>
                </div>
                
                <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #ffffff; font-size: 15px; line-height: 1.7;">
                        Hi <strong>${userName}</strong>,<br><br>
                        Thank you for contacting Fandom Analytics support. We have received your request and our team will respond <strong style="color: #10b981;">within 24 hours</strong>.
                    </p>
                </div>

                <div style="background-color: #1a4d2e33; border-left: 4px solid #10b981; padding: 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">YOUR MESSAGE</p>
                    <h3 style="margin: 0 0 10px 0; color: #ffffff; font-size: 16px;">${subject}</h3>
                    <p style="margin: 0; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                </div>

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                    <p style="font-size: 12px; color: #475569;">
                        You can view this ticket and add follow-up messages in your Profile → Support tab
                    </p>
                </div>
            </div>
        `;
        await emailService.sendEmail(userEmail, `Support Ticket ${ticketId} - We'll respond within 24 hours`, userConfirmationEmail);
        // Send notification to admin
        const adminNotificationEmail = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #fbbf24; font-size: 28px; margin-bottom: 5px;">🎫 New Support Ticket</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Ticket #${ticketId}</p>
                </div>
                
                <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">FROM</p>
                    <h2 style="margin: 0; color: #ffffff; font-size: 18px;">${userName}</h2>
                    <p style="margin: 5px 0 0 0; color: #10b981; font-size: 14px;">${userEmail}</p>
                </div>

                <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">SUBJECT</p>
                    <h3 style="margin: 0; color: #ffffff; font-size: 16px;">${subject}</h3>
                </div>

                <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">MESSAGE</p>
                    <p style="margin: 0; color: #ffffff; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                </div>

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                    <p style="font-size: 12px; color: #475569;">
                        Reply to this ticket in the Admin Panel → Support Requests
                    </p>
                </div>
            </div>
        `;
        await emailService.sendEmail('vanillabrand@googlemail.com', `[New Ticket] ${ticketId}: ${subject}`, adminNotificationEmail);
        console.log(`[Support] Ticket ${ticketId} created for ${userEmail}`);
        res.json({ status: 'sent', ticketId });
    }
    catch (error) {
        console.error('[Support] Failed to create ticket:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/user/redeem
router.post('/user/redeem', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Promo code required' });
        }
        const result = await mongoService.redeemPromoCode(code, req.user.sub);
        if (result.success) {
            return res.json({ amount: result.value });
        }
        else {
            return res.status(400).json({ error: result.error });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/config/scraper-details - Get dynamic scraper pricing
router.get('/config/scraper-details', async (req, res) => {
    try {
        // Try standard locations
        const possiblePaths = [
            path.resolve(__dirname, '../../scraper_detail.json'),
            path.resolve(__dirname, '../scraper_detail.json'),
            path.resolve(process.cwd(), 'scraper_detail.json')
        ];
        const finalPath = possiblePaths.find(p => fs.existsSync(p));
        if (finalPath) {
            const data = fs.readFileSync(finalPath, 'utf8');
            const scrapers = JSON.parse(data);
            res.json(scrapers);
        }
        else {
            console.error('scraper_detail.json not found in paths:', possiblePaths);
            res.status(404).json({ error: 'Scraper details not found' });
        }
    }
    catch (error) {
        console.error('Error serving scraper details:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- ADMIN ROUTES ---
// Middleware for Admin Check
const adminMiddleware = async (req, res, next) => {
    try {
        const user = await mongoService.getUser(req.user.sub);
        if (user && user.role === 'admin') {
            next();
        }
        else {
            res.status(403).json({ error: 'Admin access required' });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Auth check failed' });
    }
};
// --- MARKETING QUESTIONS ADMIN ---
// GET /api/admin/marketing/status - Check last generation
router.get('/admin/marketing/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await mongoService.getLatestMarketingQuestions();
        res.json({
            exists: !!result,
            lastGeneratedAt: result ? result.generatedAt : null,
            count: result ? result.questions.length : 0,
            questions: result ? result.questions : []
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/marketing/refresh - Force regeneration
router.post('/admin/marketing/refresh', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { marketingService } = await import('./services/marketingService.js');
        await marketingService.forceGenerate();
        const result = await mongoService.getLatestMarketingQuestions();
        res.json({
            status: 'refreshed',
            generatedAt: result?.generatedAt,
            questions: result?.questions
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Middleware for User Approval Check (Query Builder Protection)
const approvalMiddleware = async (req, res, next) => {
    try {
        const user = await mongoService.getUser(req.user.sub);
        // Admins bypass approval requirement
        if (user && user.role === 'admin') {
            return next();
        }
        // Regular users must be approved
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        if (user.status === 'blocked') {
            return res.status(403).json({
                error: 'Account blocked',
                message: 'Your account has been blocked. Please contact support.'
            });
        }
        if (user.status === 'pending') {
            return res.status(403).json({
                error: 'Approval pending',
                message: 'Your account is pending approval. Please wait for an administrator to approve your access.'
            });
        }
        if (user.status === 'active') {
            return next();
        }
        // Default: deny access
        res.status(403).json({ error: 'Access denied' });
    }
    catch (error) {
        res.status(500).json({ error: 'Approval check failed' });
    }
};
// GET /api/admin/users
router.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await mongoService.getAllUsers();
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/users/:id/status (Approve/Block)
router.post('/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params; // googleId
        const { status } = req.body; // 'active' | 'blocked' | 'pending'
        if (!['active', 'blocked', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        await mongoService.updateUserStatus(id, status);
        // Send approval email if status is now 'active'
        if (status === 'active') {
            try {
                const user = await mongoService.getUser(id);
                if (user && user.email) {
                    const approvalEmail = `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h1 style="color: #10b981; font-size: 32px; margin-bottom: 10px;">🎉 Account Approved!</h1>
                                <p style="color: #64748b; font-size: 16px; margin: 0;">You now have full access to Fandom Analytics</p>
                            </div>
                            
                            <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                                <p style="margin: 0; color: #ffffff; font-size: 15px; line-height: 1.7;">
                                    Hi <strong>${user.name}</strong>,<br><br>
                                    Great news! Your account has been <strong style="color: #10b981;">approved</strong> by our administrator team.
                                </p>
                            </div>

                            <div style="background-color: #10b98122; border-left: 4px solid #10b981; padding: 20px; margin-bottom: 20px;">
                                <h3 style="color: #10b981; margin: 0 0 15px 0; font-size: 18px;">✨ Full Access Unlocked</h3>
                                <p style="margin: 0 0 15px 0; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
                                    You can now enjoy all premium features:
                                </p>
                                <ul style="margin: 0; padding-left: 20px; color: #e2e8f0; font-size: 14px; line-height: 1.8;">
                                    <li><strong>Deep Search</strong> - Advanced semantic analysis</li>
                                    <li><strong>Batch Analysis</strong> - Process multiple profiles at once</li>
                                    <li><strong>AI-Powered Insights</strong> - Gemini-powered recommendations</li>
                                    <li><strong>Query Builder</strong> - Custom influencer discovery</li>
                                    <li><strong>Quick Map</strong> - Instant network visualization</li>
                                </ul>
                            </div>

                            <div style="text-align: center; background-color: #1a4d2e; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
                                <p style="color: #e2e8f0; font-size: 14px; margin: 0 0 15px 0;">Ready to get started?</p>
                                <a href="https://your-app-url.com" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Launch Dashboard</a>
                            </div>

                            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                                <p style="font-size: 14px; color: #64748b; margin: 0 0 10px 0;">
                                    Need help? Check out our documentation or contact support.
                                </p>
                                <p style="font-size: 12px; color: #475569; margin: 0;">
                                    Fandom Analytics Team
                                </p>
                            </div>
                        </div>
                    `;
                    await emailService.sendEmail(user.email, '✅ Your Fandom Analytics Account is Approved!', approvalEmail);
                    console.log(`[Admin] Approval email sent to ${user.email}`);
                }
            }
            catch (emailError) {
                console.error('[Admin] Failed to send approval email:', emailError);
                // Don't fail the status update if email fails
            }
        }
        res.json({ status: 'updated', newStatus: status });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/users/:id/balance - Amend user balance
router.patch('/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params; // googleId
        const { amount, reason } = req.body;
        if (typeof amount !== 'number') {
            return res.status(400).json({ error: 'Invalid amount' });
        }
        const newBalance = await mongoService.addToBalance(id, amount);
        // Log transaction
        await mongoService.logTransaction({
            userId: id,
            cost: -amount, // Negative cost = added balance
            description: `[Admin Adjustment] ${reason || 'Manual update'}`,
            type: 'Adjustment',
            metadata: { adminId: req.user.sub }
        });
        res.json({ status: 'updated', newBalance });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/jobs - Get all jobs (Global History)
router.get('/admin/jobs', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const skip = parseInt(req.query.skip) || 0;
        const jobs = await mongoService.getAllJobs(limit, skip);
        res.json(jobs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/users/:userId/jobs - Get specific user's job history
router.get('/admin/users/:userId/jobs', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const jobs = await mongoService.getUserJobs(userId, limit);
        res.json(jobs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/users/:id/close - Close user account
router.post('/admin/users/:id/close', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params; // googleId
        const success = await mongoService.closeUserAccount(id);
        if (success) {
            res.json({ status: 'closed', message: 'User account has been closed' });
        }
        else {
            res.status(404).json({ error: 'User not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/users/:id/transactions - View user transactions
router.get('/admin/users/:id/transactions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params; // googleId
        const limit = parseInt(req.query.limit) || 50;
        const transactions = await mongoService.getUserTransactions(id, limit);
        res.json(transactions);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// [NEW] GET /api/admin/transactions/all - Master usage log
router.get('/api/admin/transactions/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const skip = parseInt(req.query.skip) || 0;
        const logs = await mongoService.getAllUsageLogs(limit, skip);
        res.json(logs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// [NEW] DELETE /api/admin/maintenance/clear - Super Admin Only Cleanup
router.delete('/admin/maintenance/clear', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await mongoService.getUser(req.user.sub);
        if (!user || !mongoService.isAdmin(user.email)) {
            return res.status(403).json({ error: 'Super Admin access required for maintenance' });
        }
        const { target } = req.query;
        console.log(`[Admin] 🧹 Maintenance Cleanup Request: ${target} by ${user.email}`);
        switch (target) {
            case 'datasets':
                await mongoService.clearAllDatasets();
                break;
            case 'queries':
                await mongoService.clearAllQueries();
                break;
            case 'profiles':
                await mongoService.clearAllProfiles();
                break;
            case 'all':
                await mongoService.clearAllDatasets();
                await mongoService.clearAllQueries();
                await mongoService.clearAllProfiles();
                break;
            default:
                return res.status(400).json({ error: 'Invalid cleanup target' });
        }
        res.json({ success: true, message: `Successfully cleared ${target}` });
    }
    catch (error) {
        console.error('[Admin] Maintenance error:', error);
        res.status(500).json({ error: error.message });
    }
});
// --- PROMO CODE ADMIN ROUTES ---
// POST /api/admin/promo-codes - Create new promo code
router.post('/admin/promo-codes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { code, value, maxUses, expiresAt } = req.body;
        if (!code || !value) {
            return res.status(400).json({ error: 'Code and value are required' });
        }
        const promoCode = {
            code: code.toUpperCase().trim(),
            value: parseFloat(value),
            maxUses: parseInt(maxUses) || 0,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            isActive: true,
            createdAt: new Date(),
            createdBy: req.user.sub,
            currentUses: 0
        };
        const id = await mongoService.createPromoCode(promoCode);
        res.status(201).json({ id, code: promoCode.code });
    }
    catch (error) {
        if (error.message?.includes('duplicate')) {
            res.status(400).json({ error: 'Promo code already exists' });
        }
        else {
            res.status(500).json({ error: error.message });
        }
    }
});
// GET /api/admin/promo-codes - List all promo codes
router.get('/admin/promo-codes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const promoCodes = await mongoService.getAllPromoCodes();
        res.json(promoCodes);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/promo-codes/:code - Update promo code
router.patch('/admin/promo-codes/:code', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { code } = req.params;
        const { isActive, expiresAt, maxUses } = req.body;
        const updates = {};
        if (typeof isActive === 'boolean')
            updates.isActive = isActive;
        if (expiresAt)
            updates.expiresAt = new Date(expiresAt);
        if (typeof maxUses === 'number')
            updates.maxUses = maxUses;
        const success = await mongoService.updatePromoCode(code, updates);
        if (success) {
            res.json({ status: 'updated' });
        }
        else {
            res.status(404).json({ error: 'Promo code not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/admin/promo-codes/:code - Delete promo code
router.delete('/admin/promo-codes/:code', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { code } = req.params;
        const success = await mongoService.deletePromoCode(code);
        if (success) {
            res.json({ status: 'deleted' });
        }
        else {
            res.status(404).json({ error: 'Promo code not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/promo-codes/:code/usage - Get redemption history
router.get('/admin/promo-codes/:code/usage', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { code } = req.params;
        const usage = await mongoService.getPromoCodeUsage(code);
        res.json(usage);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- INVOICE ADMIN ROUTES ---
// POST /api/admin/invoices - Create new invoice
router.post('/admin/invoices', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId, amount, description, dueDate, items, month, status } = req.body;
        if (!userId || !amount || !description || !month) {
            return res.status(400).json({
                error: 'userId, amount, description, and month are required'
            });
        }
        // ✅ FIX #5: Create invoice with all required fields
        const invoiceId = `INV-MANUAL-${Date.now()}-${userId.substring(0, 8)}`;
        const invoice = {
            invoiceId: invoiceId, // ✅ ADDED
            id: invoiceId,
            userId,
            month: month, // ✅ REQUIRED
            amount: parseFloat(amount),
            totalCost: parseFloat(amount), // ✅ ADDED
            totalQueries: 0, // Manual invoice
            description,
            status: status || 'draft',
            generatedAt: new Date(), // ✅ ADDED
            createdAt: new Date(),
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            items: items || []
        };
        await mongoService.createInvoice(invoice);
        res.status(201).json({ id: invoice.invoiceId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/invoices/:userId - Get user invoices
router.get('/admin/invoices/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const invoices = await mongoService.getUserInvoices(userId);
        res.json(invoices);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/invoices/recent - Get all recent invoices
router.get('/admin/invoices', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const status = req.query.status;
        const limit = parseInt(req.query.limit) || 100;
        const invoices = await mongoService.getAllInvoices({ status, limit });
        // Populate user data for each invoice
        const invoicesWithUsers = await Promise.all(invoices.map(async (invoice) => {
            const user = await mongoService.getUser(invoice.userId);
            return {
                ...invoice,
                user: user ? {
                    name: user.name,
                    email: user.email,
                    picture: user.picture
                } : null
            };
        }));
        res.json(invoicesWithUsers);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/invoices/:id/status - Update invoice status
router.patch('/admin/invoices/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['draft', 'sent', 'paid'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const success = await mongoService.updateInvoiceStatus(id, status);
        if (success) {
            res.json({ status: 'updated' });
        }
        else {
            res.status(404).json({ error: 'Invoice not found' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/invoices/generate - Generate monthly invoices for all users
router.post('/admin/invoices/generate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { month } = req.body; // Format: "2026-01"
        if (!month) {
            return res.status(400).json({ error: 'Month parameter required (format: YYYY-MM)' });
        }
        console.log(`[API] Generating invoices for ${month}...`);
        const result = await invoiceService.generateAllMonthlyInvoices(month);
        console.log(`[API] Invoice generation complete: ${result.success} success, ${result.failed} failed`);
        res.json({
            success: true,
            generated: result.success,
            failed: result.failed,
            results: result.results
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/invoices/:id/send - Send invoice email
router.post('/admin/invoices/:id/send', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        const sent = await invoiceService.sendInvoiceEmail(userId, id);
        if (sent) {
            res.json({ success: true, message: 'Invoice email sent' });
        }
        else {
            res.status(500).json({ error: 'Failed to send invoice email' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/invoices/:id/resend - Resend invoice email (chase up)
router.post('/admin/invoices/:id/resend', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // Get invoice to find userId
        const invoices = await mongoService.getAllInvoices({ limit: 10000 });
        const invoice = invoices.find(inv => inv.invoiceId === id || inv.id === id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        // Resend email
        const success = await invoiceService.sendInvoiceEmail(invoice.userId, invoice.invoiceId || invoice.id);
        if (success) {
            // Update last sent timestamp
            await mongoService.updateInvoice(invoice.invoiceId || invoice.id, {
                lastSentAt: new Date()
            });
            res.json({
                success: true,
                message: `Invoice ${invoice.invoiceId || invoice.id} resent to user ${invoice.userId}`,
                sentAt: new Date()
            });
        }
        else {
            res.status(500).json({ error: 'Failed to resend invoice email' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/invoices/:id/status - Update invoice payment status
router.patch('/admin/invoices/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paidAmount } = req.body;
        // Validate status
        const validStatuses = ['draft', 'pending', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        // Get invoice
        const invoices = await mongoService.getAllInvoices({ limit: 10000 });
        const invoice = invoices.find(inv => inv.invoiceId === id || inv.id === id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        // Prepare update
        const update = {
            status,
            updatedAt: new Date(),
            updatedBy: req.user.sub
        };
        // Add timestamps based on status
        if (status === 'paid') {
            update.paidAt = new Date();
            update.paidAmount = paidAmount || invoice.totalCost || invoice.amount;
        }
        else if (status === 'partial') {
            if (!paidAmount) {
                return res.status(400).json({ error: 'paidAmount required for partial status' });
            }
            update.paidAmount = parseFloat(paidAmount);
            update.partiallyPaidAt = new Date();
        }
        else if (status === 'unpaid') {
            update.paidAt = null;
            update.paidAmount = 0;
        }
        // Update invoice
        await mongoService.updateInvoice(invoice.invoiceId || invoice.id, update);
        res.json({
            success: true,
            invoiceId: invoice.invoiceId || invoice.id,
            status,
            paidAmount: update.paidAmount,
            message: `Invoice status updated to ${status}`
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- PRICING CONFIGURATION ROUTES ---
// GET /api/admin/pricing-config - Get current pricing configuration
router.get('/admin/pricing-config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = await mongoService.getPricingConfig();
        if (!config) {
            return res.status(404).json({ error: 'Pricing config not found' });
        }
        res.json(config);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/pricing-config - Update pricing configuration
router.post('/admin/pricing-config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { margin, baseSubscription, costs, features } = req.body;
        if (!margin || !baseSubscription || !costs) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const config = {
            version: '1.0',
            currency: 'GBP',
            margin,
            baseSubscription,
            costs,
            features
        };
        await mongoService.updatePricingConfig(config, req.user.sub);
        res.json({ status: 'updated', config });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/balance - Get current user's balance
router.get('/user/balance', authMiddleware, async (req, res) => {
    try {
        const balance = await mongoService.getUserBalance(req.user.sub);
        res.json({ balance, currency: 'GBP' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/usage - Get current user's monthly usage
router.get('/user/usage', authMiddleware, async (req, res) => {
    try {
        const month = req.query.month;
        const usage = await mongoService.getUserMonthlyUsage(req.user.sub, month);
        // Calculate totals
        const total = usage.reduce((sum, log) => sum + log.chargedAmount, 0);
        res.json({ logs: usage, total });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- ADMIN SUPPORT TICKET ROUTES ---
// GET /api/admin/support - Get all support tickets (filtered, sorted, paginated)
router.get('/admin/support', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, sortBy, sortOrder, page, limit } = req.query;
        const result = await mongoService.getSupportTickets({
            status: status,
            sortBy: sortBy,
            sortOrder: sortOrder,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 20
        });
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/support/:ticketId - Get specific ticket
router.get('/admin/support/:ticketId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticket = await mongoService.getSupportTicket(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        res.json(ticket);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/admin/support/:ticketId/reply - Admin reply to ticket
router.post('/admin/support/:ticketId/reply', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }
        const ticket = await mongoService.getSupportTicket(ticketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        // Add admin message
        await mongoService.addTicketMessage(ticketId, {
            sender: 'admin',
            senderName: 'Support Team',
            senderEmail: 'vanillabrand@googlemail.com',
            message
        });
        // Send email notification to user
        const replyEmail = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #10b981; font-size: 28px; margin-bottom: 10px;">New Reply to Your Support Ticket 💬</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Ticket #${ticketId}</p>
                </div>
                
                <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">SUBJECT</p>
                    <h3 style="margin: 0; color: #ffffff; font-size: 16px;">${ticket.subject}</h3>
                </div>

                <div style="background-color: #10b98122; border-left: 4px solid #10b981; padding: 20px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #10b981; font-weight: bold;">SUPPORT TEAM REPLY</p>
                    <p style="margin: 0; color: #ffffff; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                </div>

                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                    <p style="font-size: 12px; color: #64748b; margin: 0 0 10px 0;">
                        View full conversation and reply in your Profile → Support tab
                    </p>
                </div>
            </div>
        `;
        await emailService.sendEmail(ticket.userEmail, `[Reply] Support Ticket ${ticketId}`, replyEmail);
        res.json({ status: 'replied', ticketId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/support/:ticketId/status - Close/reopen ticket
router.patch('/admin/support/:ticketId/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status } = req.body;
        if (!['open', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        await mongoService.updateTicketStatus(ticketId, status, req.user.sub);
        // If closing, send notification
        if (status === 'closed') {
            const ticket = await mongoService.getSupportTicket(ticketId);
            if (ticket) {
                const closureEmail = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #e2e8f0; background-color: #051810; padding: 40px; border-radius: 12px; border: 1px solid #10b98133; max-width: 600px; margin: 0 auto;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #64748b; font-size: 28px; margin-bottom: 10px;">Support Ticket Closed ✓</h1>
                            <p style="color: #64748b; font-size: 14px; margin: 0;">Ticket #${ticketId}</p>
                        </div>
                        
                        <div style="background-color: #1a4d2e33; border: 1px solid #10b98122; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #ffffff; font-size: 15px; line-height: 1.7;">
                                Your support ticket "<strong>${ticket.subject}</strong>" has been marked as resolved and closed.
                            </p>
                        </div>

                        <div style="background-color: #1a4d2e33; border-left: 4px solid #10b981; padding: 20px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #e2e8f0; font-size: 14px; line-height: 1.6;">
                                If you need further assistance, please feel free to submit a new support request or reply to this ticket to reopen it.
                            </p>
                        </div>

                        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #10b98122;">
                            <p style="font-size: 12px; color: #475569;">
                                Thank you for using Fandom Analytics
                            </p>
                        </div>
                    </div>
                `;
                await emailService.sendEmail(ticket.userEmail, `Support Ticket ${ticketId} Closed`, closureEmail);
            }
        }
        res.json({ status: 'updated', newStatus: status });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PATCH /api/admin/support/:ticketId/priority - Change priority
router.patch('/admin/support/:ticketId/priority', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { priority } = req.body;
        if (!['low', 'medium', 'high'].includes(priority)) {
            return res.status(400).json({ error: 'Invalid priority' });
        }
        await mongoService.updateTicketPriority(ticketId, priority);
        res.json({ status: 'updated', priority });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/analytics - Get usage analytics for all users
router.get('/admin/analytics', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { month } = req.query;
        const targetMonth = month || new Date().toISOString().slice(0, 7);
        const users = await mongoService.getAllUsers();
        const pricing = await mongoService.getPricingConfig();
        if (!pricing) {
            return res.status(404).json({ error: 'Pricing config not found' });
        }
        const userAnalytics = await Promise.all(users.map(async (user) => {
            const usage = await mongoService.getUserMonthlyUsage(user.googleId, targetMonth);
            const balance = await mongoService.getUserBalance(user.googleId);
            const totalUsage = usage.reduce((sum, log) => sum + log.chargedAmount, 0);
            const totalCost = usage.reduce((sum, log) => sum + log.totalCost, 0);
            const breakdown = {};
            usage.forEach(log => {
                if (!breakdown[log.action]) {
                    breakdown[log.action] = { count: 0, revenue: 0, cost: 0 };
                }
                breakdown[log.action].count++;
                breakdown[log.action].revenue += log.chargedAmount;
                breakdown[log.action].cost += log.totalCost;
            });
            return {
                userId: user.googleId,
                email: user.email,
                name: user.name,
                status: user.status,
                balance,
                revenue: totalUsage,
                cost: totalCost,
                profit: totalUsage - totalCost,
                queryCount: usage.length,
                breakdown
            };
        }));
        const totals = {
            revenue: userAnalytics.reduce((sum, u) => sum + u.revenue, 0),
            costs: userAnalytics.reduce((sum, u) => sum + u.cost, 0),
            profit: 0,
            queries: userAnalytics.reduce((sum, u) => sum + u.queryCount, 0),
            activeUsers: userAnalytics.filter(u => u.status === 'active').length,
            baseSubscriptionRevenue: pricing.baseSubscription * userAnalytics.filter(u => u.status === 'active').length
        };
        totals.revenue += totals.baseSubscriptionRevenue;
        totals.profit = totals.revenue - totals.costs;
        res.json({ month: targetMonth, totals, users: userAnalytics, pricing });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/admin/accuracy-metrics - Get query accuracy metrics over time
router.get('/admin/accuracy-metrics', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { timeRange = '30' } = req.query; // days
        const days = parseInt(timeRange);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        // Import accuracy service
        const { getAccuracyMetrics } = await import('../services/queryAccuracyService.js');
        // Get overall accuracy metrics
        const metrics = await getAccuracyMetrics({
            start: startDate,
            end: new Date()
        });
        // Get daily breakdown from jobs collection
        const db = mongoService.getDb();
        const jobs = await db.collection('jobs')
            .find({
            status: 'completed',
            createdAt: { $gte: startDate },
            qualityScore: { $exists: true }
        })
            .sort({ createdAt: 1 })
            .toArray();
        // Group by day
        const dailyMetrics = {};
        jobs.forEach(job => {
            const dateKey = job.createdAt.toISOString().split('T')[0];
            if (!dailyMetrics[dateKey]) {
                dailyMetrics[dateKey] = {
                    date: dateKey,
                    avgQuality: 0,
                    avgConfidence: 0,
                    totalQueries: 0,
                    qualityScores: [],
                    confidenceScores: []
                };
            }
            dailyMetrics[dateKey].totalQueries++;
            if (job.qualityScore !== undefined) {
                dailyMetrics[dateKey].qualityScores.push(job.qualityScore);
            }
            if (job.confidenceScore !== undefined) {
                dailyMetrics[dateKey].confidenceScores.push(job.confidenceScore);
            }
        });
        // Calculate averages
        const dailyData = Object.values(dailyMetrics).map(day => ({
            date: day.date,
            avgQuality: day.qualityScores.length > 0
                ? Math.round(day.qualityScores.reduce((a, b) => a + b, 0) / day.qualityScores.length)
                : 0,
            avgConfidence: day.confidenceScores.length > 0
                ? Math.round(day.confidenceScores.reduce((a, b) => a + b, 0) / day.confidenceScores.length)
                : 0,
            totalQueries: day.totalQueries
        }));
        // Get quality distribution
        const allQualityScores = jobs
            .filter(j => j.qualityScore !== undefined)
            .map(j => j.qualityScore);
        const qualityDistribution = {
            high: allQualityScores.filter(s => s >= 80).length,
            good: allQualityScores.filter(s => s >= 60 && s < 80).length,
            low: allQualityScores.filter(s => s < 60).length
        };
        // Get common issues from feedback
        const feedbackDocs = await db.collection('query_feedback')
            .find({
            timestamp: { $gte: startDate }
        })
            .toArray();
        const issueMap = new Map();
        feedbackDocs.forEach(f => {
            f.feedback.categories?.forEach((category) => {
                issueMap.set(category, (issueMap.get(category) || 0) + 1);
            });
        });
        const topIssues = Array.from(issueMap.entries())
            .map(([issue, count]) => ({ issue, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        res.json({
            timeRange: days,
            overall: metrics,
            daily: dailyData,
            qualityDistribution,
            topIssues
        });
    }
    catch (error) {
        console.error('[API] Accuracy metrics error:', error);
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/analytics/trends - Get usage trends
router.get('/user/analytics/trends', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const months = parseInt(req.query.months) || 3;
        const trends = await analyticsService.getUserUsageTrends(userId, months);
        res.json({ trends });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/analytics/insights - Get AI-powered insights
router.get('/user/analytics/insights', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const insights = await analyticsService.generateInsights(userId);
        res.json({ insights });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/analytics/benchmark - Get user benchmark
router.get('/user/analytics/benchmark', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const benchmark = await analyticsService.getUserBenchmark(userId);
        res.json(benchmark);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/user/analytics/roi - Calculate ROI
router.post('/user/analytics/roi', authMiddleware, async (req, res) => {
    try {
        const { monthlySubscription = 149, monthlyUsage, queriesPerMonth, hoursPerQuery = 2, hourlyRate = 50, leadsGenerated } = req.body;
        if (!queriesPerMonth) {
            return res.status(400).json({ error: 'queriesPerMonth required' });
        }
        const roi = analyticsService.calculateROI({
            monthlySubscription,
            monthlyUsage: monthlyUsage || 0,
            queriesPerMonth,
            hoursPerQuery,
            hourlyRate,
            leadsGenerated
        });
        res.json(roi);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/payments/create-intent - Create Stripe payment intent
router.post('/payments/create-intent', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const userEmail = req.user.email;
        // Validate and sanitize amount
        const rawAmount = req.body.amount;
        const amount = parseFloat(rawAmount);
        if (isNaN(amount) || !Number.isFinite(amount)) {
            return res.status(400).json({ error: 'Invalid amount format' });
        }
        // Round to 2 decimal places to avoid precision issues
        const amountGBP = Math.round(amount * 100) / 100;
        if (amountGBP < 10 || amountGBP > 1000) {
            return res.status(400).json({ error: 'Amount must be between £10 and £1000' });
        }
        const { invoiceId } = req.body; // Optional: for invoice payments
        // Create Stripe payment intent
        const { clientSecret, paymentIntentId } = await stripeService.createPaymentIntent(userId, amountGBP, userEmail);
        // Log payment as pending
        await mongoService.logPayment({
            userId,
            stripePaymentIntentId: paymentIntentId,
            amount: amountGBP,
            amountPence: Math.round(amountGBP * 100),
            status: 'pending',
            metadata: {
                userEmail,
                purpose: invoiceId ? 'invoice_payment' : 'balance_topup',
                invoiceId: invoiceId || null
            }
        });
        res.json({ clientSecret, paymentIntentId });
    }
    catch (error) {
        console.error('Payment intent creation failed:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/payments/confirm - Confirm payment and update balance
router.post('/payments/confirm', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const { paymentIntentId } = req.body;
        if (!paymentIntentId) {
            return res.status(400).json({ error: 'Payment intent ID required' });
        }
        // Verify payment with Stripe
        const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({
                error: 'Payment not completed',
                status: paymentIntent.status
            });
        }
        // Extract payment details
        const details = stripeService.extractPaymentDetails(paymentIntent);
        // Verify user owns this payment
        if (details.userId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        // Process payment with idempotency (prevents double-crediting)
        const result = await mongoService.processPaymentBalance(paymentIntentId, userId, details.amountGBP);
        // If this was an invoice payment, mark invoice as paid WITH SECURITY CHECKS
        const paymentRecord = await mongoService.getPaymentRecord(paymentIntentId);
        if (paymentRecord?.metadata?.invoiceId) {
            const invoice = await mongoService.getInvoiceById(paymentRecord.metadata.invoiceId);
            if (!invoice) {
                console.error(`Invoice ${paymentRecord.metadata.invoiceId} not found`);
            }
            else if (invoice.userId !== userId) {
                console.error(`User ${userId} doesn't own invoice ${invoice.invoiceId}`);
            }
            else if (Math.abs(invoice.totalCost - details.amountGBP) > 0.01) {
                console.error(`Amount mismatch: Invoice £${invoice.totalCost} vs Paid £${details.amountGBP}`);
            }
            else {
                await mongoService.markInvoiceAsPaid(paymentRecord.metadata.invoiceId, paymentIntentId);
            }
        }
        res.json({
            success: true,
            newBalance: result.newBalance,
            amount: details.amountGBP,
            alreadyProcessed: !result.updated
        });
    }
    catch (error) {
        console.error('Payment confirmation failed:', error);
        res.status(500).json({ error: error.message });
    }
});
// POST /api/webhooks/stripe - Stripe webhook handler
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).send('No signature');
        }
        // Verify webhook signature
        const event = stripeService.verifyWebhookSignature(req.body.toString(), signature);
        // Handle event types
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const details = stripeService.extractPaymentDetails(paymentIntent);
            // Process payment with idempotency (prevents double-crediting if confirm already ran)
            const result = await mongoService.processPaymentBalance(paymentIntent.id, details.userId, details.amountGBP);
            if (result.updated) {
                console.log(`✅ Webhook processed payment: ${paymentIntent.id} - £${details.amountGBP}`);
                // Mark invoice as paid if this was invoice payment
                const paymentRecord = await mongoService.getPaymentRecord(paymentIntent.id);
                if (paymentRecord?.metadata?.invoiceId) {
                    const invoice = await mongoService.getInvoiceById(paymentRecord.metadata.invoiceId);
                    if (invoice && invoice.userId === details.userId && Math.abs(invoice.totalCost - details.amountGBP) < 0.01) {
                        await mongoService.markInvoiceAsPaid(paymentRecord.metadata.invoiceId, paymentIntent.id);
                    }
                }
            }
            else {
                console.log(`ℹ️  Webhook skipped (already processed): ${paymentIntent.id}`);
            }
        }
        else if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object;
            await mongoService.updatePaymentStatus(paymentIntent.id, 'failed', paymentIntent.last_payment_error?.message);
            console.log(`❌ Payment failed: ${paymentIntent.id}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook processing error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});
// GET /api/payments/history - Get user's payment history
router.get('/payments/history', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const history = await mongoService.getPaymentHistory(userId);
        res.json({ payments: history });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/user/invoices - Get user's invoices
router.get('/user/invoices', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.sub;
        const invoices = await mongoService.getUserInvoices(userId);
        res.json({ invoices });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/public-maps - Share a map publicly
router.post('/public-maps', authMiddleware, async (req, res) => {
    try {
        const { data, datasetId, id } = req.body;
        const userId = req.user.sub;
        // Resolve ID from various inputs
        const targetId = datasetId || id || (data && data.id);
        if (!targetId) {
            return res.status(400).json({ error: 'Invalid request: Dataset ID required' });
        }
        // Check ownership/existence BEFORE deducting credits
        const dataset = await mongoService.getDatasetById(targetId);
        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found. Please save the map first.' });
        }
        // Check if already public to avoid double-charging
        if (dataset.isPublic && dataset.publicId) {
            const publicUrl = `${req.protocol}://${req.get('host')}/public/${dataset.publicId}`;
            return res.json({
                success: true,
                publicId: dataset.publicId,
                publicUrl,
                message: 'Map is already public'
            });
        }
        // Check if user has enough credits (10 credits for sharing)
        const user = await mongoService.getUser(userId);
        if (!user || (user.credits || 0) < 10) {
            return res.status(402).json({ error: 'Insufficient credits. Sharing requires 10 credits.' });
        }
        // Deduct credits
        await mongoService.updateUserCredits(userId, -10);
        // Generate unique public ID
        const publicId = `pub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        // Update the dataset to mark it as public
        await mongoService.updateDataset(targetId, {
            isPublic: true,
            publicId: publicId
        });
        const publicUrl = `${req.protocol}://${req.get('host')}/public/${publicId}`;
        res.json({
            success: true,
            publicId,
            publicUrl
        });
    }
    catch (error) {
        console.error('[API] Share map error:', error);
        res.status(500).json({ error: error.message || 'Failed to share map' });
    }
});
// GET /api/public-maps/:publicId - Get Shared Map
// Public route - No auth required
router.get('/public-maps/:publicId', async (req, res) => {
    try {
        const { publicId } = req.params;
        if (!publicId) {
            return res.status(400).json({ error: 'Public ID is required' });
        }
        const db = mongoService.getDb();
        const dataset = await db.collection('datasets').findOne({ publicId });
        if (!dataset) {
            return res.status(404).json({ error: 'Map not found' });
        }
        // Use the robust getDatasetById to hydrate the data (records, decompression, etc.)
        const fullDataset = await mongoService.getDatasetById(dataset.id);
        // [NEW] RUNTIME GAP FILLING (Public Maps): Trigger background enrichment if gaps detected
        const associatedJobs = await mongoService.getJobsByDatasetId(dataset.id);
        if (fullDataset && fullDataset.data) {
            // Find records that represent the analysis graph
            const graphSnapshot = fullDataset.data.find((r) => r.recordType === 'graph_snapshot');
            if (graphSnapshot && graphSnapshot.data) {
                const gapHandles = jobOrchestrator.identifyEnrichmentGaps(graphSnapshot.data);
                if (gapHandles.length > 0) {
                    const isEnriching = associatedJobs.some((j) => j.metadata?.isEnriching === true);
                    if (!isEnriching) {
                        console.log(`[PublicRuntimeFill] ⚠️ Public Map ${publicId} has gaps. Triggering background task...`);
                        const mainJob = associatedJobs.find((j) => j.type === 'map_generation' || j.type === 'enrichment');
                        if (mainJob) {
                            const profileMap = new Map();
                            jobOrchestrator.performDeepEnrichment(graphSnapshot.data, dataset.id, mainJob.id, profileMap).catch((err) => {
                                console.error(`[PublicRuntimeFill] ❌ Failed to enrich public map ${publicId}:`, err);
                            });
                            // Mark optimistically for the response below
                            mainJob.metadata = { ...mainJob.metadata, isEnriching: true };
                        }
                    }
                }
            }
        }
        // Efficiently determine if enriching: Use previously fetched associatedJobs
        const hasEnrichingJob = associatedJobs.some((j) => j.metadata?.isEnriching === true);
        fullDataset.isEnriching = hasEnrichingJob;
        res.json({ success: true, data: fullDataset, isEnriching: fullDataset.isEnriching });
    }
    catch (error) {
        console.error('[API] Get public map error:', error);
        res.status(500).json({ error: 'Failed to retrieve map' });
    }
});
// POST /api/plan-query - Generate Query Plan (Server-Side)
router.post('/plan-query', authMiddleware, approvalMiddleware, async (req, res) => {
    try {
        const { query, sampleSize = 100, postLimit = 2, ignoreCache = false, useDeepAnalysis = false } = req.body;
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        console.log(`[API] Plan generation request from user ${userId}: "${query}"`);
        // Get existing datasets for reuse detection
        const db = mongoService.getDb();
        const datasets = await db.collection('datasets')
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();
        const existingDatasets = datasets.map(d => ({
            id: d.id,
            name: d.name,
            platform: d.platform,
            targetProfile: d.targetProfile,
            dataType: d.dataType,
            recordCount: d.recordCount,
            tags: d.tags,
            createdAt: d.createdAt
        }));
        // Generate plan via server-side AI
        const plan = await jobOrchestrator.analyzeMapRequirements(query, sampleSize, existingDatasets, ignoreCache, useDeepAnalysis, "", // No seed context
        postLimit);
        console.log(`[API] Plan generated:`, {
            intent: plan.intent,
            steps: plan.steps?.length || 0,
            reusedDatasets: plan.existingDatasetIds?.length || 0
        });
        res.json({ success: true, plan });
    }
    catch (error) {
        console.error('[API] Plan generation error:', error);
        console.error('[API] Error stack:', error.stack);
        console.error('[API] Error detail:', {
            message: error.message,
            name: error.name,
            cause: error.cause
        });
        res.status(500).json({ error: error.message || 'Failed to generate plan' });
    }
});
// POST /api/orchestration - Query Builder (Server-Side)
router.post('/orchestration', authMiddleware, approvalMiddleware, async (req, res) => {
    try {
        const { query, sampleSize = 100, postLimit = 2, ignoreCache = false, plan = null, useThemedNodes = false } = req.body;
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required' });
        }
        console.log(`[API] Orchestration request from user ${userId}: "${query}"`);
        // === COST TRACKING: Calculate estimated cost ===
        const estimatedProfiles = sampleSize;
        const cost = await costCalculator.calculateQueryBuilderCost(estimatedProfiles);
        // Check balance
        // [FIX] Admin Bypass - Use central isAdmin check
        const user = await mongoService.getUser(userId);
        // Skip balance check for super admins
        if (user && user.email && mongoService.isAdmin(user.email)) {
            console.log(`[API] Admin bypass for orchestration cost: £${cost.chargedAmount.toFixed(2)}`);
        }
        else {
            const currentBalance = await mongoService.getUserBalance(userId);
            if (currentBalance < cost.chargedAmount) {
                console.log(`[API] Insufficient balance for user ${userId}: £${currentBalance.toFixed(2)} < £${cost.chargedAmount.toFixed(2)}`);
                return res.status(402).json({
                    error: 'Insufficient balance',
                    required: cost.chargedAmount,
                    available: currentBalance,
                    message: `This query requires £${cost.chargedAmount.toFixed(2)}. Your balance: £${currentBalance.toFixed(2)}. Please top up to continue.`
                });
            }
        }
        // Create job
        const jobId = uuidv4();
        await mongoService.createJob({
            id: jobId,
            userId,
            type: 'orchestration',
            status: 'queued',
            progress: 0,
            metadata: {
                query,
                sampleSize,
                postLimit, // [FIX] Persist postLimit for dataset reuse logic
                estimatedCost: cost.chargedAmount,
                plan: plan, // [NEW] Save plan to metadata to prevent re-generation
                ignoreCache, // [FIX] Persist ignoreCache flag to bypass cached datasets
                useThemedNodes // [NEW] Persist theme preference
            },
            result: { stage: 'Job queued...' },
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log(`[API] Job created: ${jobId}, Estimated cost: £${cost.chargedAmount.toFixed(2)}`);
        // Return immediately
        res.json({
            success: true,
            jobId: jobId,
            message: 'Job queued for processing',
            estimatedCost: cost.chargedAmount
        });
    }
    catch (error) {
        console.error('[API] Orchestration error:', error);
        res.status(500).json({ error: error.message || 'Failed to start job' });
    }
});
export default router;
