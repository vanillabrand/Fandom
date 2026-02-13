
import { MongoClient, Binary } from 'mongodb';
import zlib from 'zlib';

const MONGO_URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";

async function inspectKobiSnapshot() {
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

        const kobi = nodes.find((n: any) => n.label?.includes('Kobi') || n.id?.includes('kobi') || n.data?.username?.includes('kobi'));
        if (kobi) {
            console.log("Kobi Brown Node Details (SNAPSHOT):");
            console.log(JSON.stringify(kobi, null, 2));
        } else {
            console.log("Kobi Brown not found in snapshot.");
        }

    } finally {
        await client.close();
    }
}

inspectKobiSnapshot().catch(console.error);
