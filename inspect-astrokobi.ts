
import { mongoService } from './server/services/mongoService.js';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";

async function inspectAstroKobi() {
    await mongoService.connect(MONGO_URI);
    const db = mongoService.getDb();

    console.log("--- Inspecting 'astrokobi' in DB ---");

    // 1. Check profile_cache
    const cache = await db.collection('profile_cache').findOne({ username: 'astrokobi' });
    console.log("Profile Cache:", cache ? {
        followers: cache.followers,
        cachedAt: cache.cachedAt,
        hasData: !!cache.data,
        metricsInData: cache.data ? {
            followersCount: cache.data.followersCount,
            followerCount: cache.data.followerCount,
            followers: cache.data.followers
        } : 'N/A'
    } : "Not found");

    // 2. Check latest records in 'records' collection
    const records = await db.collection('records').find({
        $or: [
            { "data.username": "astrokobi" },
            { "data.ownerUsername": "astrokobi" },
            { "username": "astrokobi" }
        ]
    }).sort({ createdAt: -1 }).limit(5).toArray();

    console.log(`Found ${records.length} records in 'records' collection.`);
    records.forEach((r, i) => {
        console.log(`\nRecord ${i} (Type: ${r.recordType}, Platform: ${r.platform}, Dataset: ${r.datasetId}):`);
        const d = r.data || r;
        console.log("Keys:", Object.keys(d).join(', '));
        console.log("Metrics:", {
            followersCount: d.followersCount,
            followerCount: d.followerCount,
            followers: d.followers,
            followers_count: d.followers_count,
            edge_followed_by: d.edge_followed_by?.count
        });

        // Also check if id/pk is numeric
        console.log("Identities:", {
            id: d.id,
            pk: d.pk,
            userId: d.userId,
            ownerId: d.ownerId
        });
    });

    // 3. Check for graph snapshots containing astrokobi
    const snapshots = await db.collection('records').find({
        recordType: 'graph_snapshot'
    }).sort({ createdAt: -1 }).limit(3).toArray();

    console.log(`\nChecking last 3 graph snapshots for astrokobi...`);
    for (const snap of snapshots) {
        // Need to decompress? mongoService.getRecords handles it.
        // We'll just do a raw check if possible or use a simplified unwrap
        console.log(`Snapshot Dataset: ${snap.datasetId}`);
        // We can't easily search inside compressed JSON here without a lot of code, 
        // but we can check if it's the right dataset from the screenshot if we knew it.
    }

    await mongoService.disconnect();
}

inspectAstroKobi().catch(console.error);
