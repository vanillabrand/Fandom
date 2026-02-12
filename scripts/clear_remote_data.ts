
import { MongoClient } from 'mongodb';

// Remote URI from env_cloudrun.yaml
const URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";
const DB_NAME = 'fandom_analytics';

async function clearData() {
    console.log('Connecting to Remote MongoDB...');
    const client = await MongoClient.connect(URI);
    const db = client.db(DB_NAME);

    const collectionsToClear = [
        'datasets',
        'records',
        'analytics',
        'profile_cache',
        'scrape_fingerprints',
        'apify_executions',
        'jobs' // Also clear jobs
    ];

    const collectionsToKeep = [
        'users',
        'promo_codes',
        'promo_redemptions',
        'invoices',
        'usage_logs',
        'pricing_config',
        'support_tickets'
    ];

    console.log('--- STARTING CLEANUP ---');
    console.log(`Target DB: ${DB_NAME}`);
    console.log(`Clearing: ${collectionsToClear.join(', ')}`);
    console.log(`Keeping: ${collectionsToKeep.join(', ')}`);

    for (const name of collectionsToClear) {
        try {
            const collection = db.collection(name);
            const count = await collection.countDocuments();
            if (count > 0) {
                await collection.deleteMany({});
                console.log(`✅ Cleared ${name}: ${count} documents removed.`);
            } else {
                console.log(`Example: ${name} is already empty.`);
            }
        } catch (error) {
            console.error(`❌ Failed to clear ${name}:`, error);
        }
    }

    console.log('--- CLEANUP COMPLETE ---');
    await client.close();
}

clearData().catch(console.error);
