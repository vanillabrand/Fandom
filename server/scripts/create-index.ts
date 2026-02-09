import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const MONGODB_URI = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGO_DB_CONNECT not found in .env.local');
    process.exit(1);
}

async function createIndex() {
    // We validated MONGODB_URI above, so we can cast it as string
    const client = await MongoClient.connect(MONGODB_URI as string);
    const db = client.db('fandom_analytics');

    console.log('📊 Creating standalone createdAt index on datasets collection...');

    // Create standalone index on createdAt for efficient sorting
    await db.collection('datasets').createIndex({ createdAt: -1 });

    console.log('✅ Index created successfully!');
    console.log('📋 Existing indexes:');

    const indexes = await db.collection('datasets').indexes();
    indexes.forEach(idx => {
        console.log(`  - ${JSON.stringify(idx.key)}`);
    });

    await client.close();
    console.log('✅ Done!');
}

createIndex().catch(console.error);
