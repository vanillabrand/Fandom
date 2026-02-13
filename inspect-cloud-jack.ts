
import { MongoClient, Binary } from 'mongodb';
import zlib from 'zlib';

const MONGO_URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";

async function inspectCloudData() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db('fandom_analytics');

        const latestDataset = await db.collection('datasets').find().sort({ createdAt: -1 }).limit(1).toArray();
        if (latestDataset.length === 0) return;

        const ds = latestDataset[0];
        console.log(`Dataset: ${ds.id} (${ds.query})`);

        const snapshotRecord = await db.collection('records').findOne({
            datasetId: ds.id,
            recordType: 'graph_snapshot'
        });

        if (!snapshotRecord) return;

        let data = snapshotRecord.data;
        if (snapshotRecord.compression === 'gzip' || data instanceof Binary) {
            const buffer = data instanceof Binary ? data.buffer : data;
            data = JSON.parse(zlib.gunzipSync(buffer).toString());
        }

        let nodes = data.nodes || data.graph?.nodes;
        if (!nodes) return;

        const jack = nodes.find((n: any) => n.label?.includes('Jack Grealish') || n.id === 'jackgrealish');
        if (jack) {
            console.log("Jack Grealish Metrics:");
            console.log("ID:", jack.id);
            console.log("Label:", jack.label);
            console.log("Username (data):", jack.data?.username);
            console.log("FollowerCount (data):", jack.data?.followerCount);
            console.log("FollowingCount (data):", jack.data?.followingCount);
            console.log("PostCount (data):", jack.data?.postCount);
            console.log("PostsCount (data):", jack.data?.postsCount);
            console.log("Bio (data):", jack.data?.bio?.substring(0, 50));
        } else {
            console.log("Jack Grealish not found.");
        }

    } finally {
        await client.close();
    }
}

inspectCloudData().catch(console.error);
