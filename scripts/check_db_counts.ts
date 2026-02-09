
import { MongoClient } from 'mongodb';

// Configuration
const LOCAL_URI = 'mongodb://localhost:27017/fandom_analytics_clean';
const CLOUD_URI = 'mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0';
const COLLECTIONS = [
    'users',
    'datasets',
    'records',
    'jobs',
    'analytics',
    'scrape_fingerprints'
];

async function check() {
    console.log('🔍 Checking Database Counts...');
    let localClient, cloudClient;

    try {
        localClient = await MongoClient.connect(LOCAL_URI);
        const localDb = localClient.db();
        console.log(`\nLocal DB: ${localDb.databaseName}`);

        for (const col of COLLECTIONS) {
            const count = await localDb.collection(col).countDocuments();
            console.log(`   - ${col}: ${count}`);
        }

        try {
            cloudClient = await MongoClient.connect(CLOUD_URI);
            const cloudDb = cloudClient.db('fandom_analytics'); // Explicitly checking fandom_analytics
            console.log(`\nCloud DB: ${cloudDb.databaseName}`);

            for (const col of COLLECTIONS) {
                const count = await cloudDb.collection(col).countDocuments();
                console.log(`   - ${col}: ${count}`);
            }
        } catch (e) {
            console.error('\n❌ Could not connect to Cloud DB:', e.message);
        }

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        if (localClient) await localClient.close();
        if (cloudClient) await cloudClient.close();
    }
}

check();
