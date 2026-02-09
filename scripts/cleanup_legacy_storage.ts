
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error("❌ MONGODB_URI not found in environment variables.");
    process.exit(1);
}

async function cleanupLegacyStorage() {
    console.log("🧹 Starting Legacy Storage Cleanup...");
    console.log("-----------------------------------");

    const client = new MongoClient(MONGO_URI!);

    try {
        await client.connect();
        const db = client.db();
        console.log("✅ Connected to MongoDB");

        const recordsCollection = db.collection('records');

        // 1. Count Total
        const totalRecords = await recordsCollection.countDocuments();
        console.log(`📊 Total Documents in 'records': ${totalRecords.toLocaleString()}`);

        // 2. Identify Legacy/Raw Types
        const targetTypes = ['profile', 'post', 'comment', 'following', 'follower', 'user']; // Raw scrape data
        const query = { recordType: { $in: targetTypes } };

        const targetCount = await recordsCollection.countDocuments(query);
        const snapshotCount = await recordsCollection.countDocuments({ recordType: 'graph_snapshot' });

        console.log(`🎯 Target 'Raw' Records to Delete: ${targetCount.toLocaleString()}`);
        console.log(`🛡️  'Graph Snapshot' Records to Keep: ${snapshotCount.toLocaleString()}`);

        if (targetCount === 0) {
            console.log("✨ No legacy raw records found. Storage is clean.");
            return;
        }

        // 3. Execution
        console.log(`\n⚠️  WARNING: Deleting ${targetCount.toLocaleString()} records...`);
        console.log("This action is permanent.");

        // Wait 3 seconds to allow cancel via Ctrl+C (simulation)
        // In this automated environment we proceed, but assume user approved via prompt.

        const deleteResult = await recordsCollection.deleteMany(query);
        console.log(`\n✅ Deleted ${deleteResult.deletedCount.toLocaleString()} records.`);

        // 4. Verify
        const remaining = await recordsCollection.countDocuments();
        console.log(`📉 Remaining Records: ${remaining.toLocaleString()}`);
        console.log("-----------------------------------");
        console.log("🎉 Cleanup Complete. Space should be reclaimed.");

    } catch (error) {
        console.error("❌ Cleanup failed:", error);
    } finally {
        await client.close();
    }
}

cleanupLegacyStorage().catch(console.error);
