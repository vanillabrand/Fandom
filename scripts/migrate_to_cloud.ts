
import { MongoClient } from 'mongodb';

// Configuration
const LOCAL_URI = 'mongodb://localhost:27017/fandom_analytics_clean';
const CLOUD_URI = 'mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0';
const COLLECTIONS_TO_MIGRATE = [
    'users',
    'datasets',
    'records',
    'jobs', // Latest job should be here
    'analytics',
    'usage_logs',
    'invoices',
    'promo_codes',
    'support_tickets',
    'profile_cache',
    'scrape_fingerprints'
];

async function migrate() {
    console.log('🚀 Starting Migration: Local -> Cloud');
    console.log(`From: ${LOCAL_URI}`);
    console.log(`To:   ${CLOUD_URI.split('@')[1]}`); // Hide params for log

    let localClient, cloudClient;

    try {
        // Connect to both
        localClient = await MongoClient.connect(LOCAL_URI);
        cloudClient = await MongoClient.connect(CLOUD_URI);

        // [FIX] Force usage of 'fandom_analytics' database for local connection
        // The URI defaults to 'fandom_analytics_clean' but the app writes to 'fandom_analytics'
        const localDb = localClient.db('fandom_analytics');
        const cloudDb = cloudClient.db('fandom_analytics');

        console.log(`✅ Connected to databases:`);
        console.log(`   - Local: ${localDb.databaseName}`);
        console.log(`   - Cloud: ${cloudDb.databaseName}`);

        for (const colName of COLLECTIONS_TO_MIGRATE) {
            console.log(`\n📦 Migrating Collection: ${colName}...`);

            const localCol = localDb.collection(colName);
            const cloudCol = cloudDb.collection(colName);

            // Get count
            const count = await localCol.countDocuments();
            if (count === 0) {
                console.log(`   ⚠️ Collection '${colName}' is empty in Local DB. Skipping.`);
                continue;
            }

            console.log(`   Found ${count} documents locally.`);

            // Fetch all data
            const docs = await localCol.find({}).toArray();

            if (docs.length > 0) {
                const operations = docs.map(doc => ({
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true
                    }
                }));

                console.log(`   Writing to Cloud DB...`);

                // Batching
                const BATCH_SIZE = 500;
                let totalUpserted = 0;
                let totalModified = 0;
                let totalMatched = 0;

                for (let i = 0; i < operations.length; i += BATCH_SIZE) {
                    const batch = operations.slice(i, i + BATCH_SIZE);
                    try {
                        const result = await cloudCol.bulkWrite(batch);
                        totalUpserted += result.upsertedCount;
                        totalModified += result.modifiedCount;
                        totalMatched += result.matchedCount;
                        process.stdout.write('.');
                    } catch (batchErr) {
                        console.error(`\n   ❌ Batch Error in ${colName}:`, batchErr);
                    }
                }
                console.log(`\n   ✅ Synced ${docs.length} documents (Upserted: ${totalUpserted}, Modified: ${totalModified}, Matched: ${totalMatched}).`);
            }
        }

        console.log('\n🎉 Migration Complete!');

    } catch (error) {
        console.error('❌ Migration Failed:', error);
    } finally {
        if (localClient) await localClient.close();
        if (cloudClient) await cloudClient.close();
    }
}

migrate();
