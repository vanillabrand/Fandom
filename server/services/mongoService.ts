import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import zlib from 'zlib'; // [NEW] Compression support
import { v4 as uuidv4 } from 'uuid';

interface Dataset {
    _id?: ObjectId;
    id: string;
    name: string;
    platform: string;
    targetProfile: string;
    dataType: string;
    recordCount: number;
    createdAt: Date;
    tags: string[];
    userId?: string;
    publicId?: string; // ID of the public snapshot if shared
    isPublic?: boolean;
    updatedAt?: Date;
    isEnriching?: boolean; // [NEW] Track background hydration
    metadata?: {
        sampleSize?: number;
        query?: string;
        [key: string]: any;
    };
    data?: any[]; // Populated via aggregation
}

interface Record {
    _id?: ObjectId;
    datasetId: string;
    recordType: 'profile' | 'post' | 'graph_snapshot' | 'large_record_chunk' | 'analytics_data';
    platform: 'instagram' | 'tiktok' | 'youtube';
    username?: string;
    // [MODIFIED] Data can be JSON Object or Compressed Buffer
    data: any;
    createdAt: Date;
    indexed?: boolean;
    compression?: 'gzip'; // [NEW] Flag for compressed data
    chunkGroupId?: string; // [NEW] ID for spanned records
    chunkIndex?: number;   // [NEW] Sequence number
    chunkTotal?: number;   // [NEW] Total chunks
}

interface GetDatasetsOptions {
    limit?: number;
    skip?: number;
    platform?: string;
    tags?: string[];
    userId?: string;
    search?: string;
    excludeTags?: string[];
}

interface GetRecordsOptions {
    limit?: number;
    skip?: number;
    recordType?: string;
}

export interface Job {
    _id?: ObjectId;
    id: string;
    userId: string;
    type: 'map_generation' | 'enrichment' | 'export' | 'ai_analysis' | 'orchestration';
    status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
    progress: number;
    result?: any;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
    metadata?: any;
    // [NEW] Query Accuracy Tracking
    qualityScore?: number;        // 0-100 overall quality
    confidenceScore?: number;     // 0-100 confidence level
    accuracyMetrics?: {
        completeness: number;
        relevance: number;
        freshness: number;
        provenance: number;
    };
}

export interface PromoCode {
    _id?: ObjectId;
    code: string;
    value: number;
    maxUses: number; // 0 = unlimited
    currentUses: number;
    expiresAt?: Date;
    isActive: boolean;
    createdAt: Date;
    createdBy: string; // admin googleId
}

export interface PromoRedemption {
    _id?: ObjectId;
    code: string;
    userId: string;
    redeemedAt: Date;
    creditValue: number;
}

export interface Invoice {
    _id?: ObjectId;
    id: string;
    invoiceId?: string;  // ✅ ADDED - Unique invoice identifier
    userId: string;
    month?: string;  // ✅ ADDED - "2026-01" format
    amount: number;
    totalCost?: number;  // ✅ ADDED - Same as amount but clearer naming
    totalQueries?: number;  // ✅ ADDED - Number of queries in this invoice
    description: string;
    status: 'draft' | 'pending' | 'sent' | 'paid' | 'partial' | 'unpaid' | 'overdue' | 'cancelled';
    paidAmount?: number;  // ✅ ADDED - Amount paid (for partial payments)
    createdAt: Date;
    generatedAt?: Date;  // ✅ ADDED - When invoice was generated
    sentAt?: Date;
    lastSentAt?: Date;  // ✅ ADDED - Track resends
    paidAt?: Date;
    partiallyPaidAt?: Date;  // ✅ ADDED - When partial payment received
    dueDate?: Date;
    updatedAt?: Date;  // ✅ ADDED - Last update timestamp
    updatedBy?: string;  // ✅ ADDED - Admin who updated
    items?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }>;
}

export interface UsageLog {
    _id?: ObjectId;
    userId: string;
    timestamp: Date;
    month: string; // "2026-01" for grouping

    action: 'query_builder' | 'quick_map' | 'deep_search' | 'batch_analysis';
    description: string;

    // Cost breakdown (your actual costs in £)
    costs: {
        gemini?: { tokens: number; cost: number };
        apify?: { computeUnits: number; cost: number };
        proxy?: { mb: number; cost: number };
        scraping?: { profiles: number; cost: number };
        forumScout?: { records: number; cost: number };
    };

    totalCost: number; // Sum of all costs
    chargedAmount: number; // Cost × margin
    balance: number; // User's balance after deduction
}

export interface SupportTicket {
    _id?: ObjectId;
    ticketId: string; // Unique ticket ID like "TICKET-20260107-ABC123"
    userId: string; // googleId of user
    userEmail: string;
    userName: string;
    subject: string;
    status: 'open' | 'closed';
    priority: 'low' | 'medium' | 'high';
    createdAt: Date;
    updatedAt: Date;
    closedAt?: Date;
    closedBy?: string; // Admin who closed it

    // Conversation thread
    messages: Array<{
        id: string;
        sender: 'user' | 'admin';
        senderName: string;
        senderEmail: string;
        message: string;
        timestamp: Date;
    }>;
}

export interface PricingConfig {
    _id?: ObjectId;
    version: string;
    currency: 'GBP';
    margin: number; // e.g., 2.5 = 150% profit
    baseSubscription: number; // Monthly fee in £

    // Your actual API costs (in £)
    costs: {
        geminiPerToken: number;
        apifyComputeUnit: number;
        apifyProxyPerGB: number;
        scrapingPer1000: number;
        forumScoutPerRecord: number;
        mongodbPerHour: number;
    };

    // Calculated feature pricing (costs × margin)
    features: {
        queryBuilder: { basePrice: number; perProfile: number };
        quickMap: { basePrice: number; perProfile: number };
        deepSearch: { basePrice: number };
        batchAnalysis: { basePrice: number; per100: number };
    };

    updatedAt: Date;
    updatedBy: string; // admin googleId
}

export interface UsageLog {
    _id?: ObjectId;
    userId: string;
    timestamp: Date;
    month: string; // "2026-01" for grouping

    action: 'query_builder' | 'quick_map' | 'deep_search' | 'batch_analysis';
    description: string;

    // Cost breakdown (your actual costs in £)
    costs: {
        gemini?: { tokens: number; cost: number };
        apify?: { computeUnits: number; cost: number };
        proxy?: { mb: number; cost: number };
        scraping?: { profiles: number; cost: number };
        forumScout?: { records: number; cost: number };
    };

    totalCost: number; // Sum of all costs
    chargedAmount: number; // Cost × margin
    balance: number; // User's balance after deduction
}

export interface ApifyExecution {
    _id?: ObjectId;
    fingerprint: string;      // SHA-256 hash of (actorId + canonicalInput)
    actorId: string;
    runId: string;           // Apify Run ID
    datasetId: string;       // Apify Dataset ID
    status: 'SUCCEEDED' | 'FAILED';
    input: any;              // Full input payload
    metadata: {
        taskName?: string;    // e.g. "Scrape Followers"
        query?: string;       // Original user query
        planId?: string;     // Orchestration Plan ID
        timestamp: Date;
    };
    createdAt: Date;
    expiresAt?: Date;         // Optional explicit date, otherwise TTL uses createdAt
}

class MongoService {
    private client: MongoClient | null = null;
    private db: Db | null = null;
    private connected: boolean = false;

    async connect(uri: string): Promise<void> {
        try {
            this.client = await MongoClient.connect(uri);
            this.db = this.client.db('fandom_analytics');
            this.connected = true;
            console.log('[MongoService] Connected to MongoDB');

            // Create indexes
            await this.createIndexes();

            // Initialize default pricing if not exists
            await this.initializeDefaultPricing();
        } catch (error) {
            console.error('[MongoService] Connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.connected = false;
            console.log('[MongoService] Disconnected from MongoDB');
        }
    }

    private async createIndexes(): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

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
    getDb(): Db {
        if (!this.db) throw new Error('Database not connected');
        return this.db;
    }

    // --- APIFY CACHING OPERATIONS ---

    async getApifyExecution(fingerprint: string): Promise<ApifyExecution | null> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection<ApifyExecution>('apify_executions').findOne({ fingerprint });
    }

    async saveApifyExecution(execution: ApifyExecution): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        await this.db.collection('apify_executions').updateOne(
            { fingerprint: execution.fingerprint },
            { $set: execution },
            { upsert: true }
        );
    }

    // Dataset operations
    async getDatasets(options: GetDatasetsOptions & { includeData?: boolean } = {}): Promise<Dataset[]> {
        if (!this.db) throw new Error('Database not connected');

        const matchStage: any = {};
        if (options.platform) matchStage.platform = options.platform;
        if (options.tags?.length) matchStage.tags = { $in: options.tags };
        if (options.userId) matchStage.userId = options.userId;



        // Add $match stage if there are filters
        const pipeline: any[] = [];

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
        if (options.skip) pipeline.push({ $skip: options.skip });
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
        } else {
            pipeline.push({
                $project: {
                    data: 0,
                    vectorIndex: 0
                }
            });
        }

        return this.db.collection<Dataset>('datasets')
            .aggregate(pipeline, { allowDiskUse: true })
            .toArray() as Promise<Dataset[]>;
    }



    async createDataset(dataset: Omit<Dataset, '_id'>): Promise<string> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection<Dataset>('datasets').insertOne(dataset as Dataset);
        return result.insertedId.toString();
    }



    async updateDataset(id: string, updates: Partial<Dataset>): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection<Dataset>('datasets').updateOne(
            { id },
            { $set: updates }
        );
        return result.modifiedCount > 0;
    }

    async getDatasetById(id: string): Promise<Dataset | null> {
        if (!this.db) throw new Error('Database not connected');
        const dataset = await this.db.collection<Dataset>('datasets').findOne({ id });
        if (!dataset) return null;

        // [Fix] Hydrate data if stored in 'records' collection (Large Datasets)
        if (!dataset.data || dataset.data.length === 0) {
            // Fetch records
            try {
                const records = await this.getRecords(dataset.id, { limit: 50000 }); // Reasonable limit for visualization
                if (records.length > 0) {
                    dataset.data = records.map(r => r.data).filter(d => d);
                }
            } catch (e) {
                console.warn(`[MongoService] Failed to hydrate dataset ${id}`, e);
            }
        }
        return dataset;
    }

    async deleteDataset(id: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection<Dataset>('datasets').deleteOne({ id });
        return result.deletedCount > 0;
    }

    async getDatasetCount(options: GetDatasetsOptions = {}): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = {};
        if (options.platform) query.platform = options.platform;
        if (options.tags?.length) query.tags = { $in: options.tags };

        return this.db.collection<Dataset>('datasets').countDocuments(query);
    }

    // Record operations
    async getRecords(datasetId: string, options: GetRecordsOptions = {}): Promise<Record[]> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = { datasetId };
        // Exclude chunk parts from normal listing, only show full records or headers
        if (options.recordType) {
            query.recordType = options.recordType;
        } else {
            // By default hide chunks unless asked? 
            // Actually, logical records should be returned. Chunks are internal.
            query.recordType = { $ne: 'large_record_chunk' };
        }

        const results = await this.db.collection<Record>('records')
            .find(query)
            // .limit(options.limit || 100) // Limit might be tricky with async hydration...
            .skip(options.skip || 0)
            .toArray();

        // [NEW] Transparent Decompression via Helper (Async)
        const hydrated = await Promise.all(results.map(async r => {
            const copy = { ...r };
            copy.data = await this.unwrapRecordData(r);
            if (copy.compression) delete copy.compression;
            return copy;
        }));

        return hydrated.filter(h => h.data !== null);
    }

    // [NEW] Helper for robust decompression & Chunk Reassembly
    private async unwrapRecordData(r: Record): Promise<any> {
        // 1. Handle Chunked Records
        if (r.chunkGroupId && r.chunkTotal) {
            // This is a header record. Fetch all chunks.
            if (!this.db) throw new Error('Database not connected');

            const chunks = await this.db.collection<Record>('records')
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
            } catch (e) {
                console.error('[MongoService] Chunk decompression failed:', e);
                return null;
            }
        }

        let shouldDecompress = r.compression === 'gzip';
        let rawData = r.data;

        // Handle MongoDB Binary type (or serialized Buffers)
        if (rawData && rawData._bsontype === 'Binary') {
            rawData = rawData.buffer;
        } else if (rawData && rawData.type === 'Buffer') {
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
            } catch (e) {
                console.error('[MongoService] Decompression failed:', e);
                // If base64 string, try decoding that? 
                if (typeof rawData === 'string' && rawData.startsWith('H4s')) {
                    try {
                        const b64 = Buffer.from(rawData, 'base64');
                        const d2 = zlib.gunzipSync(b64);
                        return JSON.parse(d2.toString());
                    } catch (e2) { /* ignore */ }
                }
                return r.data; // Return raw as fallback
            }
        }
        return r.data;
    }

    async insertRecords(records: Omit<Record, '_id'>[]): Promise<number> {
        if (!this.db) throw new Error('Database not connected');
        if (records.length === 0) return 0;

        const recordsToInsert: any[] = [];

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
                } catch (e) {
                    console.warn('[MongoService] Compression failed for record, saving raw:', e);
                }
            }

            // 2. Check if Compressed Data exceeds 14MB Limit (BSON Limit is 16MB)
            const MAX_CHUNK_SIZE = 14 * 1024 * 1024; // 14MB

            let dataBuffer: Buffer | null = null;
            if (Buffer.isBuffer(copy.data)) dataBuffer = copy.data;
            else if (copy.data && copy.data._bsontype === 'Binary') dataBuffer = copy.data.buffer;

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

            } else {
                // Normal insert
                recordsToInsert.push(copy);
            }
        }

        const result = await this.db.collection<Record>('records').insertMany(recordsToInsert as Record[]);
        return result.insertedCount;
    }

    /**
     * [NEW] Update Graph Snapshot with Enrichment Data
     * Supports transparent compression
     */
    async updateGraphSnapshot(datasetId: string, analyticsData: any): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        let data = analyticsData;
        let compression: 'gzip' | undefined;

        // Apply compression logic if needed
        try {
            const jsonStr = JSON.stringify(data);
            if (jsonStr.length > 1024) {
                data = zlib.gzipSync(jsonStr);
                compression = 'gzip';
            }
        } catch (e) {
            console.warn('[MongoService] Compression failed for graph snapshot update:', e);
        }

        const result = await this.db.collection<Record>('records').updateOne(
            { datasetId, recordType: 'graph_snapshot' },
            {
                $set: {
                    data,
                    compression,
                    // We'll set an updatedAt for DB tracking even if not in interface
                    updatedAt: new Date()
                } as any
            }
        );

        return result.modifiedCount > 0;
    }

    async getRecordCount(datasetId: string, recordType?: string): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = { datasetId };
        if (recordType) query.recordType = recordType;

        return this.db.collection<Record>('records').countDocuments(query);
    }

    async deleteRecordsByDatasetId(datasetId: string): Promise<number> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection<Record>('records').deleteMany({ datasetId });
        return result.deletedCount;
    }

    // Analytics operations
    async saveAnalytics(datasetId: string, analysisType: string, results: any): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection('analytics').insertOne({
            datasetId,
            analysisType,
            results,
            createdAt: new Date()
        });

        return result.insertedId.toString();
    }

    async getAnalytics(datasetId: string, analysisType?: string): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = { datasetId };
        if (analysisType) query.analysisType = analysisType;

        return this.db.collection('analytics')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();
    }

    // Health check
    isConnected(): boolean {
        return this.connected;
    }

    // Profile Cache operations (7-day retention)
    async getProfileCache(username: string, platform: string): Promise<{ followers: number; cachedAt: Date } | null> {
        if (!this.db) throw new Error('Database not connected');

        const cache = await this.db.collection('profile_cache').findOne({
            username: username.toLowerCase(),
            platform
        });

        if (!cache) return null;

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

    async setProfileCache(username: string, platform: string, followers: number): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        await this.db.collection('profile_cache').updateOne(
            { username: username.toLowerCase(), platform },
            {
                $set: {
                    username: username.toLowerCase(),
                    platform,
                    followers,
                    cachedAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    async clearExpiredProfileCache(): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const result = await this.db.collection('profile_cache').deleteMany({
            cachedAt: { $lt: sevenDaysAgo }
        });

        return result.deletedCount;
    }

    // Scrape Fingerprint operations (deduplication)
    async getScrapeFingerprint(fingerprint: string): Promise<any | null> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection('scrape_fingerprints').findOne({ fingerprint });
        return result;
    }

    async saveScrapeFingerprint(data: {
        fingerprint: string;
        actorName: string;
        payload: any;
        payloadHash: string;
        datasetId: string;
        recordCount: number;
        metadata: any;
        ttlHours?: number;
    }): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        const executedAt = new Date();
        const expiresAt = data.ttlHours
            ? new Date(Date.now() + data.ttlHours * 60 * 60 * 1000)
            : undefined;

        await this.db.collection('scrape_fingerprints').updateOne(
            { fingerprint: data.fingerprint },
            {
                $set: {
                    ...data,
                    executedAt,
                    expiresAt,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    async findSimilarScrapes(actorName: string, targetProfile: string, limit: number = 10): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');

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
    async findGlobalProfile(username: string): Promise<any | null> {
        if (!this.db) throw new Error('Database not connected');
        const target = username.toLowerCase().replace('@', '').trim();

        // 1. Check Profile Cache First (Fastest)
        const cache = await this.db.collection('profile_cache').findOne({ username: target });
        if (cache && cache.data) {
            return cache.data;
        }

        // 2. Scan Records for 'profile' type (Most reliable source)
        const profileRecord = await this.db.collection<Record>('records').findOne({
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

    async upsertProfileCache(username: string, platform: string, data: any): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        if (!data || !username) return;

        await this.db.collection('profile_cache').updateOne(
            { username: username.toLowerCase(), platform },
            {
                $set: {
                    username: username.toLowerCase(),
                    platform,
                    followers: data.followersCount || data.followers || 0,
                    data: data, // Store full profile object
                    cachedAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    async findProfilesBatch(usernames: string[]): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');
        if (!usernames || usernames.length === 0) return [];

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

    async getScrapeStats(): Promise<any> {
        if (!this.db) throw new Error('Database not connected');

        const total = await this.db.collection('scrape_fingerprints').countDocuments();
        const byPlatform = await this.db.collection('scrape_fingerprints').aggregate([
            { $group: { _id: '$metadata.platform', count: { $sum: 1 } } }
        ]).toArray();

        return { total, byPlatform };
    }
    // --- USERS & AUTH ---

    async getUser(googleId: string): Promise<any> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('users').findOne({ googleId });
    }

    private readonly SUPER_ADMINS = ['vanillabrand@googlemail.com', 'vanillabrand@gmail.com'];

    isAdmin(email: string): boolean {
        return email && this.SUPER_ADMINS.includes(email.toLowerCase());
    }

    async createUser(user: { googleId: string; email: string; name: string; picture: string; passwordHash?: string }, promoCode?: string): Promise<any> {
        if (!this.db) throw new Error('Database not connected');

        let initialBalance = 0; // Default 0 for new users
        let promoValid = false;

        // Validate Promo Code if provided
        if (promoCode) {
            const codeDoc = await this.db.collection<PromoCode>('promo_codes').findOne({ code: promoCode, isActive: true });
            if (codeDoc) {
                // Check expiry
                if (codeDoc.expiresAt && new Date() > codeDoc.expiresAt) {
                    console.warn(`[Signup] Expired promo code: ${promoCode}`);
                } else if (codeDoc.maxUses > 0 && codeDoc.currentUses >= codeDoc.maxUses) {
                    console.warn(`[Signup] Max uses reached for code: ${promoCode}`);
                } else {
                    // Valid!
                    initialBalance = codeDoc.value;
                    promoValid = true;
                    // Increment use count
                    await this.db.collection('promo_codes').updateOne(
                        { _id: codeDoc._id },
                        { $inc: { currentUses: 1 } }
                    );
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

        await this.db.collection('users').updateOne(
            { googleId: user.googleId },
            { $setOnInsert: newUser },
            { upsert: true }
        );

        return newUser;
    }


    // [NEW] Get user by email (for password login)
    async getUserByEmail(email: string): Promise<any> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('users').findOne({ email });
    }

    // [NEW] Admin: Get all users with stats
    async getAllUsers(): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');

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
    async updateUserStatus(googleId: string, status: 'active' | 'blocked' | 'pending'): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection('users').updateOne(
            { googleId },
            { $set: { status } }
        );
        return result.modifiedCount > 0;
    }

    async updateUserCredits(googleId: string, amount: number): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        // Use findOneAndUpdate for atomicity and to prevent negative balance
        // We prioritize 'balance' for the validation but update BOTH to stay in sync
        const result = await this.db.collection('users').findOneAndUpdate(
            {
                googleId,
                // Check if THE NEW FIELD 'balance' is sufficient if amount is negative
                $or: [
                    { balance: { $gte: amount < 0 ? Math.abs(amount) : -Infinity } },
                    // Fallback for users where migration hasn't run yet
                    { $and: [{ balance: { $exists: false } }, { credits: { $gte: amount < 0 ? Math.abs(amount) : -Infinity } }] }
                ]
            },
            { $inc: { balance: amount, credits: amount } },
            { returnDocument: 'after' }
        );

        return !!result;
    }

    // [NEW] Helper to force admin role
    async makeAdmin(googleId: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection('users').updateOne(
            { googleId },
            { $set: { role: 'admin', status: 'active' } }
        );
        return result.modifiedCount > 0;
    }

    // --- JOBS (Background Tasks) ---

    async createJob(job: Omit<Job, '_id'>): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

        // Ensure ID is set
        if (!job.id) job.id = new ObjectId().toHexString();

        const result = await this.db.collection('jobs').insertOne(job);
        return job.id;
    }

    async getJob(id: string): Promise<Job | null> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('jobs').findOne({ id }) as Promise<Job | null>;
    }

    async getUserJobs(userId: string, limit: number = 20): Promise<Job[]> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('jobs')
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray() as Promise<Job[]>;
    }

    async updateJob(id: string, updates: Partial<Job>): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const updateData: any = { ...updates, updatedAt: new Date() };

        const result = await this.db.collection('jobs').updateOne(
            { id },
            { $set: updateData }
        );
        return result.modifiedCount > 0;
    }

    async getJobsByDatasetId(datasetId: string): Promise<Job[]> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('jobs')
            .find({ "result.datasetId": datasetId })
            .toArray() as Promise<Job[]>;
    }

    async deleteJobsByDatasetId(datasetId: string): Promise<number> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection('jobs').deleteMany({ "result.datasetId": datasetId });
        return result.deletedCount;
    }

    async deleteJob(id: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');
        const result = await this.db.collection('jobs').deleteOne({ id });
        return result.deletedCount > 0;
    }

    // --- PUBLIC MAPS ---

    async createPublicMap(mapData: any, userId: string): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

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

    async getPublicMap(id: string): Promise<any> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('public_maps').findOne({ id });
    }

    // --- TRANSACTIONS (Override/Extend) ---
    // Note: We are keeping the existing method signature but adding a new one for user-linked transactions
    async logTransaction(transaction: { userId: string; cost: number; description: string; type: string; metadata?: any; balance?: number }) {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection('transactions').insertOne({
            ...transaction,
            date: new Date(),
            createdAt: new Date()
        });
    }

    // --- PROMO CODE MANAGEMENT ---

    async createPromoCode(promo: Omit<PromoCode, '_id'>): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<PromoCode>('promo_codes').insertOne({
            ...promo,
            code: promo.code.toUpperCase(),
            currentUses: 0
        } as PromoCode);

        return result.insertedId.toString();
    }

    async getPromoCode(code: string): Promise<PromoCode | null> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection<PromoCode>('promo_codes').findOne({ code: code.toUpperCase() });
    }

    async getAllPromoCodes(): Promise<PromoCode[]> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection<PromoCode>('promo_codes')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
    }

    async updatePromoCode(code: string, updates: Partial<PromoCode>): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<PromoCode>('promo_codes').updateOne(
            { code: code.toUpperCase() },
            { $set: updates }
        );

        return result.modifiedCount > 0;
    }

    async deletePromoCode(code: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<PromoCode>('promo_codes').deleteOne({
            code: code.toUpperCase()
        });

        return result.deletedCount > 0;
    }

    async redeemPromoCode(code: string, userId: string): Promise<{ success: boolean; value?: number; error?: string }> {
        if (!this.db) throw new Error('Database not connected');

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
        const existingRedemption = await this.db.collection<PromoRedemption>('promo_redemptions').findOne({
            code: code.toUpperCase(),
            userId
        });

        if (existingRedemption) {
            return { success: false, error: 'You have already redeemed this promo code' };
        }

        // Record redemption
        await this.db.collection<PromoRedemption>('promo_redemptions').insertOne({
            code: code.toUpperCase(),
            userId,
            redeemedAt: new Date(),
            creditValue: promo.value
        } as PromoRedemption);

        // Increment usage count
        await this.db.collection<PromoCode>('promo_codes').updateOne(
            { code: code.toUpperCase() },
            { $inc: { currentUses: 1 } }
        );

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

    async getPromoCodeUsage(code: string): Promise<PromoRedemption[]> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<PromoRedemption>('promo_redemptions')
            .find({ code: code.toUpperCase() })
            .sort({ redeemedAt: -1 })
            .toArray();
    }

    // --- INVOICE MANAGEMENT ---

    async createInvoice(invoice: Omit<Invoice, '_id'>): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<Invoice>('invoices').insertOne(invoice as Invoice);
        return result.insertedId.toString();
    }

    async getAllInvoices(filters?: { status?: string; limit?: number }): Promise<Invoice[]> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = {};
        if (filters?.status) {
            query.status = filters.status;
        }

        return this.db.collection<Invoice>('invoices')
            .find(query)
            .sort({ createdAt: -1 })
            .limit(filters?.limit || 100)
            .toArray();
    }

    async updateInvoiceStatus(id: string, status: 'draft' | 'sent' | 'paid'): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const updates: any = { status };
        if (status === 'sent') updates.sentAt = new Date();
        if (status === 'paid') updates.paidAt = new Date();

        const result = await this.db.collection<Invoice>('invoices').updateOne(
            { id },
            { $set: updates }
        );

        return result.modifiedCount > 0;
    }

    async updateInvoice(invoiceId: string, updates: Partial<Invoice>): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<Invoice>('invoices').updateOne(
            { $or: [{ invoiceId }, { id: invoiceId }] },
            { $set: updates }
        );

        return result.modifiedCount > 0;
    }

    async getInvoiceByUserAndMonth(userId: string, month: string): Promise<Invoice | null> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<Invoice>('invoices').findOne({
            userId,
            month
        });
    }

    // --- SUPPORT TICKET MANAGEMENT ---

    async createSupportTicket(ticket: Omit<SupportTicket, '_id'>): Promise<string> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection<SupportTicket>('support_tickets').insertOne(ticket as SupportTicket);
        return result.insertedId.toString();
    }

    async getSupportTickets(filters: {
        status?: 'open' | 'closed';
        userId?: string;
        sortBy?: 'createdAt' | 'updatedAt';
        sortOrder?: 'asc' | 'desc';
        page?: number;
        limit?: number;
    }): Promise<{ tickets: SupportTicket[]; total: number; pages: number }> {
        if (!this.db) throw new Error('Database not connected');

        const query: any = {};
        if (filters.status) query.status = filters.status;
        if (filters.userId) query.userId = filters.userId;

        const sortField = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const skip = (page - 1) * limit;

        const [tickets, total] = await Promise.all([
            this.db.collection<SupportTicket>('support_tickets')
                .find(query)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .toArray(),
            this.db.collection<SupportTicket>('support_tickets').countDocuments(query)
        ]);

        return {
            tickets,
            total,
            pages: Math.ceil(total / limit)
        };
    }

    async getSupportTicket(ticketId: string): Promise<SupportTicket | null> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<SupportTicket>('support_tickets').findOne({ ticketId });
    }

    async addTicketMessage(ticketId: string, message: {
        sender: 'user' | 'admin';
        senderName: string;
        senderEmail: string;
        message: string;
    }): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        const newMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            ...message,
            timestamp: new Date()
        };

        await this.db.collection('support_tickets').updateOne(
            { ticketId },
            {
                $push: { messages: newMessage } as any,
                $set: { updatedAt: new Date() }
            }
        );
    }

    async updateTicketStatus(ticketId: string, status: 'open' | 'closed', closedBy?: string): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        const update: any = {
            status,
            updatedAt: new Date()
        };

        if (status === 'closed') {
            update.closedAt = new Date();
            if (closedBy) update.closedBy = closedBy;
        } else {
            update.closedAt = null;
            update.closedBy = null;
        }

        await this.db.collection('support_tickets').updateOne(
            { ticketId },
            { $set: update }
        );
    }

    async updateTicketPriority(ticketId: string, priority: 'low' | 'medium' | 'high'): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        await this.db.collection('support_tickets').updateOne(
            { ticketId },
            { $set: { priority, updatedAt: new Date() } }
        );
    }

    // --- ENHANCED USER MANAGEMENT ---

    async updateUserBalance(googleId: string, newBalance: number): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection('users').updateOne(
            { googleId },
            { $set: { balance: Math.max(0, newBalance), credits: Math.max(0, newBalance) } }
        );

        return result.modifiedCount > 0;
    }

    async getUserTransactions(googleId: string, limit: number = 50): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection('transactions')
            .find({ userId: googleId })
            .sort({ date: -1 })
            .limit(limit)
            .toArray();
    }


    // [NEW] Get All Jobs (Admin View)
    async getAllJobs(limit: number = 100, skip: number = 0): Promise<Job[]> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<Job>('jobs')
            .find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    async closeUserAccount(googleId: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not connected');

        // Soft delete: Set status to blocked and add closedAt timestamp
        const result = await this.db.collection('users').updateOne(
            { googleId },
            {
                $set: {
                    status: 'blocked',
                    closedAt: new Date()
                }
            }
        );

        return result.modifiedCount > 0;
    }

    // ====== PRICING & USAGE TRACKING METHODS ======

    async getPricingConfig(): Promise<PricingConfig | null> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<PricingConfig>('pricing_config')
            .findOne({}, { sort: { updatedAt: -1 } });
    }

    async updatePricingConfig(config: Partial<PricingConfig>, adminId: string): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        const update = {
            ...config,
            updatedAt: new Date(),
            updatedBy: adminId
        };

        // Use updateOne with upsert to avoid duplicates
        // Keep only one active pricing config (latest)
        await this.db.collection('pricing_config').updateOne(
            {}, // Match any document (there should only be one)
            { $set: update },
            { upsert: true } // Create if doesn't exist
        );

        console.log(`[MongoService] Pricing config updated by admin ${adminId}`);
    }

    async initializeDefaultPricing(): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        // Check if pricing already exists
        const existing = await this.getPricingConfig();
        if (existing) return;

        // Create default pricing based on your costs
        const defaultPricing: PricingConfig = {
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

    async logUsage(log: Omit<UsageLog, '_id'>): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        await this.db.collection('usage_logs').insertOne(log as UsageLog);
    }

    async getUserMonthlyUsage(userId: string, month?: string): Promise<UsageLog[]> {
        if (!this.db) throw new Error('Database not connected');

        const targetMonth = month || new Date().toISOString().slice(0, 7); // "2026-01"

        return this.db.collection<UsageLog>('usage_logs')
            .find({ userId, month: targetMonth })
            .sort({ timestamp: -1 })
            .toArray();
    }

    async getUserUsageLogs(userId: string, startDate: Date): Promise<UsageLog[]> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<UsageLog>('usage_logs')
            .find({ userId, timestamp: { $gte: startDate } })
            .sort({ timestamp: -1 })
            .toArray();
    }

    // [NEW] Admin: Get Master Log of all transactions
    async getAllUsageLogs(limit: number = 100, skip: number = 0): Promise<UsageLog[]> {
        if (!this.db) throw new Error('Database not connected');

        return this.db.collection<UsageLog>('usage_logs')
            .find({})
            .sort({ timestamp: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .toArray();
    }

    async getUserBalance(userId: string): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        const user = await this.db.collection('users').findOne({ googleId: userId });
        // Correctly prioritize 'balance' but fall back to 'credits' if balance is missing
        return typeof user?.balance === 'number' ? user.balance : (user?.credits || 0);
    }

    async deductBalance(userId: string, amount: number): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        // Atomic update for both fields to ensure synchronization during migration
        const result = await this.db.collection('users').findOneAndUpdate(
            { googleId: userId, $or: [{ balance: { $gte: amount } }, { credits: { $gte: amount } }] },
            { $inc: { balance: -amount, credits: -amount } },
            { returnDocument: 'after' }
        );

        if (!result) throw new Error("Insufficient balance");
        return result.balance;
    }

    async addToBalance(userId: string, amount: number): Promise<number> {
        if (!this.db) throw new Error('Database not connected');

        const result = await this.db.collection('users').findOneAndUpdate(
            { googleId: userId },
            { $inc: { balance: amount, credits: amount } },
            { returnDocument: 'after', upsert: false }
        );

        return result?.balance || 0;
    }

    async logPayment(payment: {
        userId: string;
        stripePaymentIntentId: string;
        amount: number;
        amountPence: number;
        status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
        metadata: any;
    }): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        await this.db.collection('payments').insertOne({
            ...payment,
            currency: 'gbp',
            createdAt: new Date(),
            completedAt: payment.status === 'succeeded' ? new Date() : null
        });
    }



    async updatePaymentStatus(
        stripePaymentIntentId: string,
        status: 'succeeded' | 'failed' | 'cancelled',
        failureReason?: string
    ): Promise<void> {
        if (!this.db) throw new Error('Database not connected');

        await this.db.collection('payments').updateOne(
            { stripePaymentIntentId },
            {
                $set: {
                    status,
                    completedAt: new Date(),
                    ...(failureReason && { failureReason })
                }
            }
        );
    }

    async getPaymentHistory(userId: string, limit: number = 20): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');

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
    async processPaymentBalance(
        paymentIntentId: string,
        userId: string,
        amount: number
    ): Promise<{ updated: boolean; newBalance: number }> {
        if (!this.db) throw new Error('Database not connected');

        // Atomically update payment status from pending to succeeded
        // This ensures only one process (confirm OR webhook) can credit balance
        const paymentResult = await this.db.collection('payments').findOneAndUpdate(
            {
                stripePaymentIntentId: paymentIntentId,
                status: 'pending'  // Only update if still pending
            },
            {
                $set: {
                    status: 'succeeded',
                    completedAt: new Date(),
                    balanceProcessed: true
                }
            },
            { returnDocument: 'after' }
        );

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

    async markInvoiceAsPaid(invoiceId: string, stripePaymentIntentId: string): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        await this.db.collection('invoices').updateOne(
            { invoiceId },
            { $set: { status: 'paid', paidAt: new Date(), stripePaymentIntentId } }
        );
        console.log(`✅ Invoice ${invoiceId} marked as paid`);
    }

    async getUserInvoices(userId: string): Promise<any[]> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('invoices').find({ userId }).sort({ generatedAt: -1 }).toArray();
    }

    async getPaymentRecord(paymentIntentId: string): Promise<any | null> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('payments').findOne({ stripePaymentIntentId: paymentIntentId });
    }

    async getInvoiceById(invoiceId: string): Promise<any | null> {
        if (!this.db) throw new Error('Database not connected');
        return this.db.collection('invoices').findOne({ invoiceId });
    }

    // --- MARKETING QUESTIONS ---
    async saveMarketingQuestions(questions: string[]): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        // Upsert a single document or store daily docs? Storing daily is better for history.
        // But for serving, we just want the latest.
        await this.db.collection('daily_questions').insertOne({
            questions,
            generatedAt: new Date(),
            dateStr: new Date().toISOString().split('T')[0] // YYYY-MM-DD
        });
    }

    async getLatestMarketingQuestions(): Promise<{ questions: string[]; generatedAt: Date } | null> {
        if (!this.db) throw new Error('Database not connected');
        const results = await this.db.collection('daily_questions')
            .find({})
            .sort({ generatedAt: -1 })
            .limit(1)
            .toArray();

        return (results.length > 0 ? results[0] : null) as unknown as { questions: string[]; generatedAt: Date } | null;
    }

    // [VISUAL INTELLIGENCE] Fetch images from dataset records
    async getDatasetImages(datasetId: string, limit: number = 50): Promise<Array<{ imageUrl: string; recordId: string }>> {
        if (!this.db) throw new Error('Database not connected');

        // [FALLBACK] Use find() and JS filtering to avoid complex aggregation type errors
        // [OPTIMIZATION] Use projection to fetch ONLY image fields, reducing data transfer
        const records = await this.db.collection<Record>('records')
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

        const images: Array<{ imageUrl: string; recordId: string }> = [];

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

            if (images.length >= limit) break;
        }

        return images;
    }

    // --- ADMIN MAINTENANCE ---

    async clearAllDatasets(): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing all datasets, records, and analytics...');
        await Promise.all([
            this.db.collection('datasets').deleteMany({}),
            this.db.collection('records').deleteMany({}),
            this.db.collection('analytics').deleteMany({})
        ]);
    }

    async clearAllQueries(): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing all jobs, executions, and fingerprints...');
        await Promise.all([
            this.db.collection('jobs').deleteMany({}),
            this.db.collection('apify_executions').deleteMany({}),
            this.db.collection('scrape_fingerprints').deleteMany({})
        ]);
    }

    async clearAllProfiles(): Promise<void> {
        if (!this.db) throw new Error('Database not connected');
        console.log('[MongoService] 🧹 Clearing profile cache and cached records...');
        await Promise.all([
            this.db.collection('profile_cache').deleteMany({}),
            this.db.collection('records').deleteMany({ recordType: 'profile' })
        ]);
    }
}


// Singleton instance
export const mongoService = new MongoService();
