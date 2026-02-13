
import { MongoClient } from 'mongodb';

const MONGO_URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";

async function inspectRawKobi() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db('fandom_analytics');

        // Find raw records matching kobi
        const records = await db.collection('records').find({
            $or: [
                { username: /astrokobi/i },
                { ownerUsername: /astrokobi/i },
                { handle: /astrokobi/i },
                { label: /Kobi Brown/i }
            ]
        }).sort({ createdAt: -1 }).limit(5).toArray();

        console.log(`Found ${records.length} raw records.`);
        for (const r of records) {
            console.log("--- Record ---");
            console.log("ID:", r.id || r.pk);
            console.log("Type:", r.type || r.recordType);
            console.log("Username:", r.username || r.ownerUsername);
            console.log("Followers:", r.followersCount, r.followerCount, r.followers, r.edge_followed_by?.count);
            console.log("Following:", r.followsCount, r.followingCount, r.following, r.edge_follow?.count);
            console.log("Posts:", r.postsCount, r.mediaCount, r.posts, r.edge_owner_to_timeline_media?.count);
            console.log("Full Record Keys:", Object.keys(r).join(', '));
            if (r.metaData) console.log("MetaData Keys:", Object.keys(r.metaData).join(', '));
            if (r.owner) console.log("Owner Keys:", Object.keys(r.owner).join(', '));
        }

    } finally {
        await client.close();
    }
}

inspectRawKobi().catch(console.error);
