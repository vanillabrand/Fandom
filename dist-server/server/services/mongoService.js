import { MongoClient, ObjectId } from 'mongodb';
import zlib from 'zlib'; // [NEW] Compression support
import { v4 as uuidv4 } from 'uuid';
class MongoService {
    constructor() {
        this.client = null;
        this.db = null;
        this.connected = false;
        this.SUPER_ADMINS = ['vanillabrand@googlemail.com', 'vanillabrand@gmail.com'];
    }
    async connect(uri) {
        try {
            this.client = await MongoClient.connect(uri);
            this.db = this.client.db('fandom_analytics');
            this.connected = true;
            console.log('[MongoService] Connected to MongoDB');
            // Create indexes
            await this.createIndexes();
            // Initialize default pricing if not exists
            await this.initializeDefaultPricing();
        }
        catch (error) {
            console.error('[MongoService] Connection failed:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            console.log('[MongoService] Disconnected from MongoDB');
        }
    }
    async createIndexes() {
        if (!this.db)
            throw new Error('Database not connected');
        // Datasets indexes
        await this.db.collection('datasets').createIndex({ createdAt: -1 }); // Standalone index for efficient sorting
        await this.db.collection('datasets').createIndex({ platform: 1, createdAt: -1 });
        await this.db.collection('datasets').createIndex({ tags: 1 });
        await this.db.collection('datasets').createIndex({ id: 1 }, { unique: true });
        // Records indexes
        await this.db.collection('records').createIndex({ datasetId: 1 });
        await this.db.collection('records').createIndex({ platform: 1, username: 1 });
        await this.db.collection('records').createIndex({ recordType: 1 });
        await this.db.collection('records').createIndex({ createdAt: -1 });
        // Analytics indexes
        await this.db.collection('analytics').createIndex({ datasetId: 1, analysisType: 1 });
        // Profile cache indexes
        await this.db.collection('profile_cache').createIndex({ username: 1, platform: 1 }, { unique: true });
        await this.db.collection('profile_cache').createIndex({ cachedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7 days TTL
        // Scrape fingerprints indexes
        await this.db.collection('scrape_fingerprints').createIndex({ fingerprint: 1 }, { unique: true });
        await this.db.collection('scrape_fingerprints').createIndex({ actorName: 1, 'metadata.platform': 1 });
        await this.db.collection('scrape_fingerprints').createIndex({ 'metadata.targetProfile': 1 });
        await this.db.collection('scrape_fingerprints').createIndex({ executedAt: -1 });
        await this.db.collection('scrape_fingerprints').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
        // Promo codes indexes
        await this.db.collection('promo_codes').createIndex({ code: 1 }, { unique: true });
        await this.db.collection('promo_codes').createIndex({ isActive: 1 });
        await this.db.collection('promo_codes').createIndex({ expiresAt: 1 });
        await this.db.collection('promo_codes').createIndex({ createdAt: -1 });
        // Promo redemptions indexes
        await this.db.collection('promo_redemptions').createIndex({ userId: 1 });
        await this.db.collection('promo_redemptions').createIndex({ code: 1 });
        await this.db.collection('promo_redemptions').createIndex({ redeemedAt: -1 });
        // Invoices indexes
        await this.db.collection('invoices').createIndex({ id: 1 }, { unique: true });
        await this.db.collection('invoices').createIndex({ userId: 1 });
        await this.db.collection('invoices').createIndex({ status: 1 });
        await this.db.collection('invoices').createIndex({ createdAt: -1 });
        // Users indexes
        await this.db.collection('users').createIndex({ googleId: 1 }, { unique: true });
        await this.db.collection('users').createIndex({ email: 1 });
        await this.db.collection('users').createIndex({ status: 1 });
        await this.db.collection('users').createIndex({ role: 1 });
        await this.db.collection('users').createIndex({ createdAt: -1 });
        // Pricing config indexes
        await this.db.collection('pricing_config').createIndex({ version: 1 });
        await this.db.collection('pricing_config').createIndex({ updatedAt: -1 });
        // Support tickets indexes
        await this.db.collection('support_tickets').createIndex({ ticketId: 1 }, { unique: true });
        await this.db.collection('support_tickets').createIndex({ userId: 1, status: 1 });
        await this.db.collection('support_tickets').createIndex({ status: 1, createdAt: -1 });
        await this.db.collection('support_tickets').createIndex({ createdAt: -1 });
        await this.db.collection('support_tickets').createIndex({ updatedAt: -1 });
        console.log('[MongoService] All indexes created successfully');
        // Usage logs indexes  
        await this.db.collection('usage_logs').createIndex({ userId: 1, timestamp: -1 });
        await this.db.collection('usage_logs').createIndex({ userId: 1, month: 1 });
        await this.db.collection('usage_logs').createIndex({ action: 1 });
        await this.db.collection('usage_logs').createIndex({ timestamp: -1 });
        // Apify Executions indexes (Caching)
        await this.db.collection('apify_executions').createIndex({ fingerprint: 1 }, { unique: true });
        await this.db.collection('apify_executions').createIndex({ 'metadata.query': 1 }); // For debugging/manual lookup
        // TTL Index: expire after 30 days
        await this.db.collection('apify_executions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
        console.log('[MongoService] Indexes created');
    }
    // Get database instance
    getDb() {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db;
    }
    // --- APIFY CACHING OPERATIONS ---
    async getApifyExecution(fingerprint) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('apify_executions').findOne({ fingerprint });
    }
    async saveApifyExecution(execution) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('apify_executions').updateOne({ fingerprint: execution.fingerprint }, { $set: execution }, { upsert: true });
    }
    // Dataset operations
    async getDatasets(options = {}) {
        if (!this.db)
            throw new Error('Database not connected');
        const matchStage = {};
        if (options.platform)
            matchStage.platform = options.platform;
        if (options.tags?.length)
            matchStage.tags = { $in: options.tags };
        if (options.userId)
            matchStage.userId = options.userId;
        // Add $match stage if there are filters
        const pipeline = [];
        if (options.search) {
            const searchRegex = new RegExp(options.search, 'i');
            matchStage.$or = [
                { name: searchRegex },
                { targetProfile: searchRegex },
                { 'config.profile': searchRegex } // Legacy support if needed
            ];
        }
        if (options.tags?.length) {
            matchStage.tags = { $in: options.tags };
        }
        if (options.excludeTags?.length) {
            // If tags match already exists (e.g. $in), we need to handle $nin smartly.
            // MongoDB allows combined operators.
            matchStage.tags = { ...matchStage.tags, $nin: options.excludeTags };
        }
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }
        // Add sort, skip, and limit
        pipeline.push({ $sort: { createdAt: -1 } });
        if (options.skip)
            pipeline.push({ $skip: options.skip });
        pipeline.push({ $limit: options.limit || 50 });
        if (options.includeData) {
            // [FIX] Join with 'records' collection to bypass BSON 16MB limit on single document
            pipeline.push({
                $lookup: {
                    from: 'records',
                    localField: 'id',
                    foreignField: 'datasetId',
                    as: 'records_doc'
                }
            });
            // Extract the 'data' field from each record document and flatten
            pipeline.push({
                $addFields: {
                    data: {
                        $map: { input: "$records_doc", as: "r", in: "$$r.data" }
                    }
                }
            });
            pipeline.push({ $project: { records_doc: 0 } });
        }
        else {
            pipeline.push({
                $project: {
                    data: 0,
                    vectorIndex: 0
                }
            });
        }
        return this.db.collection('datasets')
            .aggregate(pipeline, { allowDiskUse: true })
            .toArray();
    }
    async createDataset(dataset) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('datasets').insertOne(dataset);
        return result.insertedId.toString();
    }
    async updateDataset(id, updates) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('datasets').updateOne({ id }, { $set: updates });
        return result.modifiedCount > 0;
    }
    async getDatasetById(id) {
        if (!this.db)
            throw new Error('Database not connected');
        const dataset = await this.db.collection('datasets').findOne({ id });
        if (!dataset)
            return null;
        // [Fix] Hydrate data if stored in 'records' collection (Large Datasets)
        if (!dataset.data || dataset.data.length === 0) {
            // Fetch records
            try {
                const records = await this.getRecords(dataset.id, { limit: 50000 }); // Reasonable limit for visualization
                if (records.length > 0) {
                    dataset.data = records.map(r => r.data).filter(d => d);
                }
            }
            catch (e) {
                console.warn(`[MongoService] Failed to hydrate dataset ${id}`, e);
            }
        }
        return dataset;
    }
    async deleteDataset(id) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('datasets').deleteOne({ id });
        return result.deletedCount > 0;
    }
    async getDatasetCount(options = {}) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = {};
        if (options.platform)
            query.platform = options.platform;
        if (options.tags?.length)
            query.tags = { $in: options.tags };
        return this.db.collection('datasets').countDocuments(query);
    }
    // Record operations
    async getRecords(datasetId, options = {}) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = { datasetId };
        // Exclude chunk parts from normal listing, only show full records or headers
        if (options.recordType) {
            query.recordType = options.recordType;
        }
        else {
            // By default hide chunks unless asked? 
            // Actually, logical records should be returned. Chunks are internal.
            query.recordType = { $ne: 'large_record_chunk' };
        }
        const results = await this.db.collection('records')
            .find(query)
            // .limit(options.limit || 100) // Limit might be tricky with async hydration...
            .skip(options.skip || 0)
            .toArray();
        // [NEW] Transparent Decompression via Helper (Async)
        const hydrated = await Promise.all(results.map(async (r) => {
            const copy = { ...r };
            copy.data = await this.unwrapRecordData(r);
            if (copy.compression)
                delete copy.compression;
            return copy;
        }));
        return hydrated.filter(h => h.data !== null);
    }
    // [NEW] Helper for robust decompression & Chunk Reassembly
    async unwrapRecordData(r) {
        // 1. Handle Chunked Records
        if (r.chunkGroupId && r.chunkTotal) {
            // This is a header record. Fetch all chunks.
            if (!this.db)
                throw new Error('Database not connected');
            const chunks = await this.db.collection('records')
                .find({ chunkGroupId: r.chunkGroupId, recordType: 'large_record_chunk' })
                .sort({ chunkIndex: 1 })
                .toArray();
            if (chunks.length !== r.chunkTotal) {
                console.warn(`[MongoService] Missing chunks for group ${r.chunkGroupId}. Expected ${r.chunkTotal}, found ${chunks.length}`);
                return null; // Partial data corruption
            }
            // Reassemble Buffer
            const buffers = chunks.map(c => c.data.buffer || c.data); // Handle Binary or raw Buffer
            const fullBuffer = Buffer.concat(buffers);
            // Decompress the full buffer
            try {
                const decompressed = zlib.gunzipSync(fullBuffer);
                return JSON.parse(decompressed.toString());
            }
            catch (e) {
                console.error('[MongoService] Chunk decompression failed:', e);
                return null;
            }
        }
        let shouldDecompress = r.compression === 'gzip';
        let rawData = r.data;
        // Handle MongoDB Binary type (or serialized Buffers)
        if (rawData && rawData._bsontype === 'Binary') {
            rawData = rawData.buffer;
        }
        else if (rawData && rawData.type === 'Buffer') {
            rawData = Buffer.from(rawData.data);
        }
        // Auto-detect Gzip header (1F 8B)
        if (!shouldDecompress && Buffer.isBuffer(rawData) && rawData.length > 2 && rawData[0] === 0x1f && rawData[1] === 0x8b) {
            shouldDecompress = true;
        }
        if (shouldDecompress && rawData) {
            try {
                const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData.toString('binary'), 'binary');
                const decompressed = zlib.gunzipSync(buffer);
                return JSON.parse(decompressed.toString());
            }
            catch (e) {
                console.error('[MongoService] Decompression failed:', e);
                // If base64 string, try decoding that? 
                if (typeof rawData === 'string' && rawData.startsWith('H4s')) {
                    try {
                        const b64 = Buffer.from(rawData, 'base64');
                        const d2 = zlib.gunzipSync(b64);
                        return JSON.parse(d2.toString());
                    }
                    catch (e2) { /* ignore */ }
                }
                return r.data; // Return raw as fallback
            }
        }
        return r.data;
    }
    async insertRecords(records) {
        if (!this.db)
            throw new Error('Database not connected');
        if (records.length === 0)
            return 0;
        const recordsToInsert = [];
        // [NEW] Transparent Compression & Chunking
        for (const r of records) {
            const copy = { ...r };
            // 1. Check if data needs compression
            if (copy.data && !copy.compression && !Buffer.isBuffer(copy.data)) {
                try {
                    const jsonStr = JSON.stringify(copy.data);
                    // Threshold: 1KB
                    if (jsonStr.length > 1024) {
                        const compressed = zlib.gzipSync(jsonStr);
                        copy.data = compressed;
                        copy.compression = 'gzip';
                    }
                }
                catch (e) {
                    console.warn('[MongoService] Compression failed for record, saving raw:', e);
                }
            }
            // 2. Check if Compressed Data exceeds 14MB Limit (BSON Limit is 16MB)
            const MAX_CHUNK_SIZE = 14 * 1024 * 1024; // 14MB
            let dataBuffer = null;
            if (Buffer.isBuffer(copy.data))
                dataBuffer = copy.data;
            else if (copy.data && copy.data._bsontype === 'Binary')
                dataBuffer = copy.data.buffer;
            if (dataBuffer && dataBuffer.length > MAX_CHUNK_SIZE) {
                console.log(`[MongoService] 🚨 Record exceeds 14MB (${(dataBuffer.length / 1024 / 1024).toFixed(2)}MB). Chunking...`);
                const chunkGroupId = uuidv4();
                const totalLength = dataBuffer.length;
                const chunkTotal = Math.ceil(totalLength / MAX_CHUNK_SIZE);
                // Create Header Record
                const headerRecord = {
                    ...copy,
                    data: null, // No data in header
                    recordType: copy.recordType,
                    chunkGroupId,
                    chunkTotal,
                    chunkIndex: -1 // Indicator for header
                };
                recordsToInsert.push(headerRecord);
                // Create Chunk Records
                for (let i = 0; i < chunkTotal; i++) {
                    const start = i * MAX_CHUNK_SIZE;
                    const end = Math.min(start + MAX_CHUNK_SIZE, totalLength);
                    const chunkData = dataBuffer.subarray(start, end);
                    recordsToInsert.push({
                        datasetId: copy.datasetId,
                        recordType: 'large_record_chunk',
                        platform: copy.platform,
                        createdAt: new Date(),
                        chunkGroupId,
                        chunkIndex: i,
                        chunkTotal,
                        data: chunkData,
                        compression: 'gzip' // Chunks are slices of the gzip buffer
                    });
                }
                console.log(`[MongoService] Split into ${chunkTotal} chunks.`);
            }
            else {
                // Normal insert
                recordsToInsert.push(copy);
            }
        }
        const result = await this.db.collection('records').insertMany(recordsToInsert);
        return result.insertedCount;
    }
    /**
     * [NEW] Update Graph Snapshot with Enrichment Data
     * Supports transparent compression
     */
    async updateGraphSnapshot(datasetId, analyticsData) {
        if (!this.db)
            throw new Error('Database not connected');
        let data = analyticsData;
        let compression;
        // Apply compression logic if needed
        try {
            const jsonStr = JSON.stringify(data);
            if (jsonStr.length > 1024) {
                data = zlib.gzipSync(jsonStr);
                compression = 'gzip';
            }
        }
        catch (e) {
            console.warn('[MongoService] Compression failed for graph snapshot update:', e);
        }
        const result = await this.db.collection('records').updateOne({ datasetId, recordType: 'graph_snapshot' }, {
            $set: {
                data,
                compression,
                // We'll set an updatedAt for DB tracking even if not in interface
                updatedAt: new Date()
            }
        });
        return result.modifiedCount > 0;
    }
    async getRecordCount(datasetId, recordType) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = { datasetId };
        if (recordType)
            query.recordType = recordType;
        return this.db.collection('records').countDocuments(query);
    }
    async deleteRecordsByDatasetId(datasetId) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('records').deleteMany({ datasetId });
        return result.deletedCount;
    }
    // Analytics operations
    async saveAnalytics(datasetId, analysisType, results) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('analytics').insertOne({
            datasetId,
            analysisType,
            results,
            createdAt: new Date()
        });
        return result.insertedId.toString();
    }
    async getAnalytics(datasetId, analysisType) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = { datasetId };
        if (analysisType)
            query.analysisType = analysisType;
        return this.db.collection('analytics')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();
    }
    // Health check
    isConnected() {
        return this.connected;
    }
    // Profile Cache operations (7-day retention)
    async getProfileCache(username, platform) {
        if (!this.db)
            throw new Error('Database not connected');
        const cache = await this.db.collection('profile_cache').findOne({
            username: username.toLowerCase(),
            platform
        });
        if (!cache)
            return null;
        // Check if cache is still valid (7 days)
        const cacheAge = Date.now() - new Date(cache.cachedAt).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (cacheAge > sevenDays) {
            // Cache expired, delete it
            await this.db.collection('profile_cache').deleteOne({ _id: cache._id });
            return null;
        }
        return {
            followers: cache.followers,
            cachedAt: new Date(cache.cachedAt)
        };
    }
    async setProfileCache(username, platform, followers) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('profile_cache').updateOne({ username: username.toLowerCase(), platform }, {
            $set: {
                username: username.toLowerCase(),
                platform,
                followers,
                cachedAt: new Date()
            }
        }, { upsert: true });
    }
    async clearExpiredProfileCache() {
        if (!this.db)
            throw new Error('Database not connected');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const result = await this.db.collection('profile_cache').deleteMany({
            cachedAt: { $lt: sevenDaysAgo }
        });
        return result.deletedCount;
    }
    // Scrape Fingerprint operations (deduplication)
    async getScrapeFingerprint(fingerprint) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('scrape_fingerprints').findOne({ fingerprint });
        return result;
    }
    async saveScrapeFingerprint(data) {
        if (!this.db)
            throw new Error('Database not connected');
        const executedAt = new Date();
        const expiresAt = data.ttlHours
            ? new Date(Date.now() + data.ttlHours * 60 * 60 * 1000)
            : undefined;
        await this.db.collection('scrape_fingerprints').updateOne({ fingerprint: data.fingerprint }, {
            $set: {
                ...data,
                executedAt,
                expiresAt,
                updatedAt: new Date()
            }
        }, { upsert: true });
    }
    async findSimilarScrapes(actorName, targetProfile, limit = 10) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('scrape_fingerprints')
            .find({
            actorName,
            'metadata.targetProfile': targetProfile
        })
            .sort({ executedAt: -1 })
            .limit(limit)
            .toArray();
    }
    // [NEW] Global Profile Lookup (Ghost Node Hydration)
    async findGlobalProfile(username) {
        if (!this.db)
            throw new Error('Database not connected');
        const target = username.toLowerCase().replace('@', '').trim();
        // 1. Check Profile Cache First (Fastest)
        const cache = await this.db.collection('profile_cache').findOne({ username: target });
        if (cache && cache.data) {
            return cache.data;
        }
        // 2. Scan Records for 'profile' type (Most reliable source)
        const profileRecord = await this.db.collection('records').findOne({
            $or: [
                { "data.username": target },
                { "data.ownerUsername": target }
            ],
            // Prefer detailed profile records over post/comment authors
            // recordType: 'profile' // Not always reliable if stored as generic 'details'
        }, { sort: { createdAt: -1 } });
        if (profileRecord) {
            // Cache for future
            await this.upsertProfileCache(target, 'instagram', profileRecord.data);
            return profileRecord.data;
        }
        // 3. Fallback: Scan Datasets (Legacy)
        const datasetMatch = await this.db.collection('datasets').aggregate([
            { $match: { $or: [{ "data.username": target }, { "data.ownerUsername": target }] } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $unwind: "$data" },
            { $match: { $or: [{ "data.username": target }, { "data.ownerUsername": target }] } },
            { $replaceRoot: { newRoot: "$data" } }
        ]).next();
        if (datasetMatch) {
            await this.upsertProfileCache(target, 'instagram', datasetMatch);
            return datasetMatch;
        }
        return null;
    }
    async upsertProfileCache(username, platform, data) {
        if (!this.db)
            throw new Error('Database not connected');
        if (!data || !username)
            return;
        await this.db.collection('profile_cache').updateOne({ username: username.toLowerCase(), platform }, {
            $set: {
                username: username.toLowerCase(),
                platform,
                followers: data.followersCount || data.followers || 0,
                data: data, // Store full profile object
                cachedAt: new Date()
            }
        }, { upsert: true });
    }
    async findProfilesBatch(usernames) {
        if (!this.db)
            throw new Error('Database not connected');
        if (!usernames || usernames.length === 0)
            return [];
        const targets = usernames.map(u => u.toLowerCase().replace('@', '').trim());
        // Aggregation Pipeline to find records within nested 'data' arrays
        // Priority: Newest datasets first
        const pipeline = [
            // 1. Match datasets that MIGHT contain our targets
            // (Scan datasets)
            {
                $match: {
                    $or: [
                        { "data.username": { $in: targets } },
                        { "data.ownerUsername": { $in: targets } }
                    ]
                }
            },
            // 2. Sort by newest first
            { $sort: { createdAt: -1 } },
            // 3. Limit datasets to scan (Optimization)
            { $limit: 50 },
            // 4. Unwind to work with records
            { $unwind: "$data" },
            // 5. Filter for exact matches
            {
                $match: {
                    $or: [
                        { "data.username": { $in: targets } },
                        { "data.ownerUsername": { $in: targets } }
                    ]
                }
            },
            // 6. Group by username to deduplicate (take first/newest)
            {
                $group: {
                    _id: { $toLower: { $ifNull: ["$data.username", "$data.ownerUsername"] } },
                    record: { $first: "$data" }
                }
            },
            // 7. Format output
            { $replaceRoot: { newRoot: "$record" } }
        ];
        return this.db.collection('datasets').aggregate(pipeline).toArray();
    }
    async getScrapeStats() {
        if (!this.db)
            throw new Error('Database not connected');
        const total = await this.db.collection('scrape_fingerprints').countDocuments();
        const byPlatform = await this.db.collection('scrape_fingerprints').aggregate([
            { $group: { _id: '$metadata.platform', count: { $sum: 1 } } }
        ]).toArray();
        return { total, byPlatform };
    }
    // --- USERS & AUTH ---
    async getUser(googleId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('users').findOne({ googleId });
    }
    isAdmin(email) {
        return email && this.SUPER_ADMINS.includes(email.toLowerCase());
    }
    async createUser(user, promoCode) {
        if (!this.db)
            throw new Error('Database not connected');
        let initialBalance = 0; // Default 0 for new users
        let promoValid = false;
        // Validate Promo Code if provided
        if (promoCode) {
            const codeDoc = await this.db.collection('promo_codes').findOne({ code: promoCode, isActive: true });
            if (codeDoc) {
                // Check expiry
                if (codeDoc.expiresAt && new Date() > codeDoc.expiresAt) {
                    console.warn(`[Signup] Expired promo code: ${promoCode}`);
                }
                else if (codeDoc.maxUses > 0 && codeDoc.currentUses >= codeDoc.maxUses) {
                    console.warn(`[Signup] Max uses reached for code: ${promoCode}`);
                }
                else {
                    // Valid!
                    initialBalance = codeDoc.value;
                    promoValid = true;
                    // Increment use count
                    await this.db.collection('promo_codes').updateOne({ _id: codeDoc._id }, { $inc: { currentUses: 1 } });
                    console.log(`[Signup] Promo code applied: ${promoCode} (+${codeDoc.value})`);
                }
            }
        }
        // Default 'Free Tier' balance if no promo? 
        // If not promo, maybe give small starter amount?
        if (!promoValid) {
            initialBalance = 5; // £5.00 starter credit
        }
        const isAdmin = this.isAdmin(user.email);
        const newUser = {
            ...user,
            balance: initialBalance,
            credits: initialBalance, // Legacy support
            createdAt: new Date(),
            lastActive: new Date(),
            promoCodeUsed: promoValid ? promoCode : null,
            role: isAdmin ? 'admin' : 'user',
            status: isAdmin ? 'active' : 'pending' // Still pending approval
        };
        await this.db.collection('users').updateOne({ googleId: user.googleId }, { $setOnInsert: newUser }, { upsert: true });
        return newUser;
    }
    // [NEW] Get user by email (for password login)
    async getUserByEmail(email) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('users').findOne({ email });
    }
    // [NEW] Admin: Get all users with stats
    async getAllUsers() {
        if (!this.db)
            throw new Error('Database not connected');
        // Join with transactions to calculate current month usage
        const users = await this.db.collection('users').aggregate([
            {
                $lookup: {
                    from: "transactions",
                    let: { userId: "$googleId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$userId", "$$userId"] },
                                // Optional: Filter for current month only if needed
                            }
                        },
                        { $group: { _id: null, totalCost: { $sum: "$cost" } } }
                    ],
                    as: "usage_stats"
                }
            },
            {
                $addFields: {
                    monthlyUsage: { $ifNull: [{ $arrayElemAt: ["$usage_stats.totalCost", 0] }, 0] }
                }
            },
            { $project: { usage_stats: 0 } }, // clean up
            { $sort: { createdAt: -1 } }
        ]).toArray();
        return users;
    }
    // [NEW] Admin: Update user status
    async updateUserStatus(googleId, status) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('users').updateOne({ googleId }, { $set: { status } });
        return result.modifiedCount > 0;
    }
    async updateUserCredits(googleId, amount) {
        if (!this.db)
            throw new Error('Database not connected');
        // Use findOneAndUpdate for atomicity and to prevent negative balance
        // We prioritize 'balance' for the validation but update BOTH to stay in sync
        const result = await this.db.collection('users').findOneAndUpdate({
            googleId,
            // Check if THE NEW FIELD 'balance' is sufficient if amount is negative
            $or: [
                { balance: { $gte: amount < 0 ? Math.abs(amount) : -Infinity } },
                // Fallback for users where migration hasn't run yet
                { $and: [{ balance: { $exists: false } }, { credits: { $gte: amount < 0 ? Math.abs(amount) : -Infinity } }] }
            ]
        }, { $inc: { balance: amount, credits: amount } }, { returnDocument: 'after' });
        return !!result;
    }
    // [NEW] Helper to force admin role
    async makeAdmin(googleId) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('users').updateOne({ googleId }, { $set: { role: 'admin', status: 'active' } });
        return result.modifiedCount > 0;
    }
    // --- JOBS (Background Tasks) ---
    async createJob(job) {
        if (!this.db)
            throw new Error('Database not connected');
        // Ensure ID is set
        if (!job.id)
            job.id = new ObjectId().toHexString();
        const result = await this.db.collection('jobs').insertOne(job);
        return job.id;
    }
    async getJob(id) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('jobs').findOne({ id });
    }
    async getUserJobs(userId, limit = 20) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('jobs')
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
    }
    async updateJob(id, updates) {
        if (!this.db)
            throw new Error('Database not connected');
        const updateData = { ...updates, updatedAt: new Date() };
        const result = await this.db.collection('jobs').updateOne({ id }, { $set: updateData });
        return result.modifiedCount > 0;
    }
    async getJobsByDatasetId(datasetId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('jobs')
            .find({ "result.datasetId": datasetId })
            .toArray();
    }
    async deleteJobsByDatasetId(datasetId) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('jobs').deleteMany({ "result.datasetId": datasetId });
        return result.deletedCount;
    }
    async deleteJob(id) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('jobs').deleteOne({ id });
        return result.deletedCount > 0;
    }
    // --- PUBLIC MAPS ---
    async createPublicMap(mapData, userId) {
        if (!this.db)
            throw new Error('Database not connected');
        // Create a snapshot
        const publicMap = {
            id: new ObjectId().toHexString(), // Use MongoDB ID logic or UUID
            userId,
            data: mapData,
            createdAt: new Date(),
            views: 0
        };
        await this.db.collection('public_maps').insertOne(publicMap);
        return publicMap.id;
    }
    async getPublicMap(id) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('public_maps').findOne({ id });
    }
    // --- TRANSACTIONS (Override/Extend) ---
    // Note: We are keeping the existing method signature but adding a new one for user-linked transactions
    async logTransaction(transaction) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('transactions').insertOne({
            ...transaction,
            date: new Date(),
            createdAt: new Date()
        });
    }
    // --- PROMO CODE MANAGEMENT ---
    async createPromoCode(promo) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('promo_codes').insertOne({
            ...promo,
            code: promo.code.toUpperCase(),
            currentUses: 0
        });
        return result.insertedId.toString();
    }
    async getPromoCode(code) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('promo_codes').findOne({ code: code.toUpperCase() });
    }
    async getAllPromoCodes() {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('promo_codes')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
    }
    async updatePromoCode(code, updates) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('promo_codes').updateOne({ code: code.toUpperCase() }, { $set: updates });
        return result.modifiedCount > 0;
    }
    async deletePromoCode(code) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('promo_codes').deleteOne({
            code: code.toUpperCase()
        });
        return result.deletedCount > 0;
    }
    async redeemPromoCode(code, userId) {
        if (!this.db)
            throw new Error('Database not connected');
        const promo = await this.getPromoCode(code);
        if (!promo) {
            return { success: false, error: 'Invalid promo code' };
        }
        if (!promo.isActive) {
            return { success: false, error: 'Promo code is inactive' };
        }
        if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) {
            return { success: false, error: 'Promo code has expired' };
        }
        if (promo.maxUses > 0 && promo.currentUses >= promo.maxUses) {
            return { success: false, error: 'Promo code has reached maximum uses' };
        }
        // Check if user already redeemed this code
        const existingRedemption = await this.db.collection('promo_redemptions').findOne({
            code: code.toUpperCase(),
            userId
        });
        if (existingRedemption) {
            return { success: false, error: 'You have already redeemed this promo code' };
        }
        // Record redemption
        await this.db.collection('promo_redemptions').insertOne({
            code: code.toUpperCase(),
            userId,
            redeemedAt: new Date(),
            creditValue: promo.value
        });
        // Increment usage count
        await this.db.collection('promo_codes').updateOne({ code: code.toUpperCase() }, { $inc: { currentUses: 1 } });
        // Add credits to user
        await this.updateUserCredits(userId, promo.value);
        // Log transaction
        await this.logTransaction({
            userId,
            cost: promo.value,
            description: `Promo Code: ${code.toUpperCase()}`,
            type: 'TopUp'
        });
        return { success: true, value: promo.value };
    }
    async getPromoCodeUsage(code) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('promo_redemptions')
            .find({ code: code.toUpperCase() })
            .sort({ redeemedAt: -1 })
            .toArray();
    }
    // --- INVOICE MANAGEMENT ---
    async createInvoice(invoice) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('invoices').insertOne(invoice);
        return result.insertedId.toString();
    }
    async getAllInvoices(filters) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = {};
        if (filters?.status) {
            query.status = filters.status;
        }
        return this.db.collection('invoices')
            .find(query)
            .sort({ createdAt: -1 })
            .limit(filters?.limit || 100)
            .toArray();
    }
    async updateInvoiceStatus(id, status) {
        if (!this.db)
            throw new Error('Database not connected');
        const updates = { status };
        if (status === 'sent')
            updates.sentAt = new Date();
        if (status === 'paid')
            updates.paidAt = new Date();
        const result = await this.db.collection('invoices').updateOne({ id }, { $set: updates });
        return result.modifiedCount > 0;
    }
    async updateInvoice(invoiceId, updates) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('invoices').updateOne({ $or: [{ invoiceId }, { id: invoiceId }] }, { $set: updates });
        return result.modifiedCount > 0;
    }
    async getInvoiceByUserAndMonth(userId, month) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('invoices').findOne({
            userId,
            month
        });
    }
    // --- SUPPORT TICKET MANAGEMENT ---
    async createSupportTicket(ticket) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('support_tickets').insertOne(ticket);
        return result.insertedId.toString();
    }
    async getSupportTickets(filters) {
        if (!this.db)
            throw new Error('Database not connected');
        const query = {};
        if (filters.status)
            query.status = filters.status;
        if (filters.userId)
            query.userId = filters.userId;
        const sortField = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;
        const [tickets, total] = await Promise.all([
            this.db.collection('support_tickets')
                .find(query)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .toArray(),
            this.db.collection('support_tickets').countDocuments(query)
        ]);
        return {
            tickets,
            total,
            pages: Math.ceil(total / limit)
        };
    }
    async getSupportTicket(ticketId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('support_tickets').findOne({ ticketId });
    }
    async addTicketMessage(ticketId, message) {
        if (!this.db)
            throw new Error('Database not connected');
        const newMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...message,
            timestamp: new Date()
        };
        await this.db.collection('support_tickets').updateOne({ ticketId }, {
            $push: { messages: newMessage },
            $set: { updatedAt: new Date() }
        });
    }
    async updateTicketStatus(ticketId, status, closedBy) {
        if (!this.db)
            throw new Error('Database not connected');
        const update = {
            status,
            updatedAt: new Date()
        };
        if (status === 'closed') {
            update.closedAt = new Date();
            if (closedBy)
                update.closedBy = closedBy;
        }
        else {
            update.closedAt = null;
            update.closedBy = null;
        }
        await this.db.collection('support_tickets').updateOne({ ticketId }, { $set: update });
    }
    async updateTicketPriority(ticketId, priority) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('support_tickets').updateOne({ ticketId }, { $set: { priority, updatedAt: new Date() } });
    }
    // --- ENHANCED USER MANAGEMENT ---
    async updateUserBalance(googleId, newBalance) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('users').updateOne({ googleId }, { $set: { balance: Math.max(0, newBalance), credits: Math.max(0, newBalance) } });
        return result.modifiedCount > 0;
    }
    async getUserTransactions(googleId, limit = 50) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('transactions')
            .find({ userId: googleId })
            .sort({ date: -1 })
            .limit(limit)
            .toArray();
    }
    // [NEW] Get All Jobs (Admin View)
    async getAllJobs(limit = 100, skip = 0) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('jobs')
            .find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
    }
    async closeUserAccount(googleId) {
        if (!this.db)
            throw new Error('Database not connected');
        // Soft delete: Set status to blocked and add closedAt timestamp
        const result = await this.db.collection('users').updateOne({ googleId }, {
            $set: {
                status: 'blocked',
                closedAt: new Date()
            }
        });
        return result.modifiedCount > 0;
    }
    // ====== PRICING & USAGE TRACKING METHODS ======
    async getPricingConfig() {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('pricing_config')
            .findOne({}, { sort: { updatedAt: -1 } });
    }
    async updatePricingConfig(config, adminId) {
        if (!this.db)
            throw new Error('Database not connected');
        const update = {
            ...config,
            updatedAt: new Date(),
            updatedBy: adminId
        };
        // Use updateOne with upsert to avoid duplicates
        // Keep only one active pricing config (latest)
        await this.db.collection('pricing_config').updateOne({}, // Match any document (there should only be one)
        { $set: update }, { upsert: true } // Create if doesn't exist
        );
        console.log(`[MongoService] Pricing config updated by admin ${adminId}`);
    }
    async initializeDefaultPricing() {
        if (!this.db)
            throw new Error('Database not connected');
        // Check if pricing already exists
        const existing = await this.getPricingConfig();
        if (existing)
            return;
        // Create default pricing based on your costs
        const defaultPricing = {
            version: '1.0',
            currency: 'GBP',
            margin: 2.5, // 150% profit
            baseSubscription: 149.00,
            costs: {
                geminiPerToken: 0.000008, // $2 per 250k tokens = £0.008 per 1k
                apifyComputeUnit: 0.79, // $1 = £0.79
                apifyProxyPerGB: 7.87, // $10 = £7.87
                scrapingPer1000: 6.30, // $8 = £6.30
                forumScoutPerRecord: 0.08, // $0.10 = £0.08
                mongodbPerHour: 0.20 // $0.25 = £0.20
            },
            features: {
                queryBuilder: { basePrice: 8.25, perProfile: 0.05 },
                quickMap: { basePrice: 3.75, perProfile: 0.02 },
                deepSearch: { basePrice: 5.00 },
                batchAnalysis: { basePrice: 13.75, per100: 1.50 }
            },
            updatedAt: new Date(),
            updatedBy: 'system'
        };
        await this.db.collection('pricing_config').insertOne(defaultPricing);
        console.log('[MongoService] Default pricing configuration initialized');
    }
    async logUsage(log) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('usage_logs').insertOne(log);
    }
    async getUserMonthlyUsage(userId, month) {
        if (!this.db)
            throw new Error('Database not connected');
        const targetMonth = month || new Date().toISOString().slice(0, 7); // "2026-01"
        return this.db.collection('usage_logs')
            .find({ userId, month: targetMonth })
            .sort({ timestamp: -1 })
            .toArray();
    }
    async getUserUsageLogs(userId, startDate) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('usage_logs')
            .find({ userId, timestamp: { $gte: startDate } })
            .sort({ timestamp: -1 })
            .toArray();
    }
    // [NEW] Admin: Get Master Log of all transactions
    async getAllUsageLogs(limit = 100, skip = 0) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('usage_logs')
            .find({})
            .sort({ timestamp: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .toArray();
    }
    async getUserBalance(userId) {
        if (!this.db)
            throw new Error('Database not connected');
        const user = await this.db.collection('users').findOne({ googleId: userId });
        // Correctly prioritize 'balance' but fall back to 'credits' if balance is missing
        return typeof user?.balance === 'number' ? user.balance : (user?.credits || 0);
    }
    async deductBalance(userId, amount) {
        if (!this.db)
            throw new Error('Database not connected');
        // Atomic update for both fields to ensure synchronization during migration
        const result = await this.db.collection('users').findOneAndUpdate({ googleId: userId, $or: [{ balance: { $gte: amount } }, { credits: { $gte: amount } }] }, { $inc: { balance: -amount, credits: -amount } }, { returnDocument: 'after' });
        if (!result)
            throw new Error("Insufficient balance");
        return result.balance;
    }
    async addToBalance(userId, amount) {
        if (!this.db)
            throw new Error('Database not connected');
        const result = await this.db.collection('users').findOneAndUpdate({ googleId: userId }, { $inc: { balance: amount, credits: amount } }, { returnDocument: 'after', upsert: false });
        return result?.balance || 0;
    }
    async logPayment(payment) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('payments').insertOne({
            ...payment,
            currency: 'gbp',
            createdAt: new Date(),
            completedAt: payment.status === 'succeeded' ? new Date() : null
        });
    }
    async updatePaymentStatus(stripePaymentIntentId, status, failureReason) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('payments').updateOne({ stripePaymentIntentId }, {
            $set: {
                status,
                completedAt: new Date(),
                ...(failureReason && { failureReason })
            }
        });
    }
    async getPaymentHistory(userId, limit = 20) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('payments')
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
    }
    /**
     * Process payment balance update with idempotency
     * Prevents double-crediting from both confirm route and webhook
     */
    async processPaymentBalance(paymentIntentId, userId, amount) {
        if (!this.db)
            throw new Error('Database not connected');
        // Atomically update payment status from pending to succeeded
        // This ensures only one process (confirm OR webhook) can credit balance
        const paymentResult = await this.db.collection('payments').findOneAndUpdate({
            stripePaymentIntentId: paymentIntentId,
            status: 'pending' // Only update if still pending
        }, {
            $set: {
                status: 'succeeded',
                completedAt: new Date(),
                balanceProcessed: true
            }
        }, { returnDocument: 'after' });
        // If payment was already processed (not pending), skip balance update
        if (!paymentResult || paymentResult.status !== 'succeeded') {
            console.log(`⚠️  Payment ${paymentIntentId} already processed, skipping balance update`);
            const balance = await this.getUserBalance(userId);
            return { updated: false, newBalance: balance };
        }
        // Credit balance - this only happens once due to atomic payment update above
        const newBalance = await this.addToBalance(userId, amount);
        console.log(`✅ Payment ${paymentIntentId} processed: +£${amount}, new balance: £${newBalance}`);
        // [NEW] Log Transaction for User History
        await this.logTransaction({
            userId,
            cost: amount,
            description: `Balance Top-up (Stripe: ${paymentIntentId})`,
            type: 'TopUp',
            metadata: { stripePaymentIntentId: paymentIntentId }
        });
        return { updated: true, newBalance };
    }
    async markInvoiceAsPaid(invoiceId, stripePaymentIntentId) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.db.collection('invoices').updateOne({ invoiceId }, { $set: { status: 'paid', paidAt: new Date(), stripePaymentIntentId } });
        console.log(`✅ Invoice ${invoiceId} marked as paid`);
    }
    async getUserInvoices(userId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('invoices').find({ userId }).sort({ generatedAt: -1 }).toArray();
    }
    async getPaymentRecord(paymentIntentId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('payments').findOne({ stripePaymentIntentId: paymentIntentId });
    }
    async getInvoiceById(invoiceId) {
        if (!this.db)
            throw new Error('Database not connected');
        return this.db.collection('invoices').findOne({ invoiceId });
    }
    // --- MARKETING QUESTIONS ---
    async saveMarketingQuestions(questions) {
        if (!this.db)
            throw new Error('Database not connected');
        // Upsert a single document or store daily docs? Storing daily is better for history.
        // But for serving, we just want the latest.
        await this.db.collection('daily_questions').insertOne({
            questions,
            generatedAt: new Date(),
            dateStr: new Date().toISOString().split('T')[0] // YYYY-MM-DD
        });
    }
    async getLatestMarketingQuestions() {
        if (!this.db)
            throw new Error('Database not connected');
        const results = await this.db.collection('daily_questions')
            .find({})
            .sort({ generatedAt: -1 })
            .limit(1)
            .toArray();
        return (results.length > 0 ? results[0] : null);
    }
    // [VISUAL INTELLIGENCE] Fetch images from dataset records
    async getDatasetImages(datasetId, limit = 50) {
        if (!this.db)
            throw new Error('Database not connected');
        // [FALLBACK] Use find() and JS filtering to avoid complex aggregation type errors
        // [OPTIMIZATION] Use projection to fetch ONLY image fields, reducing data transfer
        const records = await this.db.collection('records')
            .find({ datasetId: datasetId })
            .project({
            'data.displayUrl': 1, 'data.display_url': 1,
            'data.thumbnailUrl': 1, 'data.thumbnail_src': 1,
            'data.imageUrl': 1, 'data.image_url': 1,
            'data.profilePicUrl': 1, 'data.profile_pic_url': 1,
            'data.images': 1, 'data.image_versions2': 1,
            '_id': 1
        })
            .sort({ createdAt: -1 }) // Get recent ones
            .limit(limit * 5) // Fetch more to filter
            .toArray();
        const images = [];
        for (const r of records) {
            const d = r.data || {};
            // Check common fields
            const url = d.displayUrl ||
                d.display_url ||
                d.thumbnailUrl ||
                d.thumbnail_src ||
                d.imageUrl ||
                d.image_url ||
                d.profilePicUrl ||
                d.profile_pic_url ||
                (d.images && d.images[0]) ||
                (d.image_versions2 && d.image_versions2.candidates && d.image_versions2.candidates[0] && d.image_versions2.candidates[0].url);
            if (url && typeof url === 'string' && url.startsWith('http')) {
                images.push({
                    imageUrl: url,
                    recordId: r._id ? r._id.toString() : 'unknown'
                });
            }
            if (images.length >= limit)
                break;
        }
        return images;
    }
    // --- ADMIN MAINTENANCE ---
    async clearAllDatasets() {
        if (!this.db)
            throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing all datasets, records, and analytics...');
        await Promise.all([
            this.db.collection('datasets').deleteMany({}),
            this.db.collection('records').deleteMany({}),
            this.db.collection('analytics').deleteMany({})
        ]);
    }
    async clearAllQueries() {
        if (!this.db)
            throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing all jobs, executions, and fingerprints...');
        await Promise.all([
            this.db.collection('jobs').deleteMany({}),
            this.db.collection('apify_executions').deleteMany({}),
            this.db.collection('scrape_fingerprints').deleteMany({})
        ]);
    }
    async clearAllProfiles() {
        if (!this.db)
            throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing profile cache and cached records...');
        await Promise.all([
            this.db.collection('profile_cache').deleteMany({}),
            this.db.collection('records').deleteMany({ recordType: 'profile' })
        ]);
    }
}
// Singleton instance
export const mongoService = new MongoService();
