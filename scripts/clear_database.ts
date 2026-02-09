/**
 * Clear Database Script
 * Removes all query-related data from MongoDB
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

async function clearDatabase() {
    const mongoUri = process.env.MONGO_DB_CONNECT;

    if (!mongoUri) {
        console.error('❌ MONGO_DB_CONNECT not found in environment variables');
        process.exit(1);
    }

    const client = new MongoClient(mongoUri);
    try {
        console.log('🗑️  Starting database cleanup...\n');

        // Connect to MongoDB
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();

        // Clear jobs collection
        const jobsResult = await db.collection('jobs').deleteMany({});
        console.log(`✅ Deleted ${jobsResult.deletedCount} jobs`);

        // Clear datasets collection
        const datasetsResult = await db.collection('datasets').deleteMany({});
        console.log(`✅ Deleted ${datasetsResult.deletedCount} datasets`);

        // Clear query_feedback collection
        const feedbackResult = await db.collection('query_feedback').deleteMany({});
        console.log(`✅ Deleted ${feedbackResult.deletedCount} query feedback records`);

        // Clear scrape_cache collection (if it exists)
        const cacheResult = await db.collection('scrape_cache').deleteMany({});
        console.log(`✅ Deleted ${cacheResult.deletedCount} scrape cache entries`);

        console.log('\n✨ Database cleanup complete!');
        console.log('You can now run fresh queries without cached data.\n');

        await client.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing database:', error);
        await client.close();
        process.exit(1);
    }
}

clearDatabase();
