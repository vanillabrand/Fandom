
import { mongoService } from './server/services/mongoService.js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function run() {
    const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
    if (!uri) {
        console.error("No MongoDB URI found");
        process.exit(1);
    }

    try {
        await mongoService.connect(uri);
        const db = mongoService.getDb();

        // Find dataset for @rusters.uk
        const dataset = await db.collection('datasets').findOne({
            $or: [
                { targetProfile: { $regex: 'rusters.uk', $options: 'i' } },
                { name: { $regex: 'rusters.uk', $options: 'i' } }
            ]
        }, { sort: { createdAt: -1 } });

        if (!dataset) {
            console.log('No dataset found for @rusters.uk. Trying latest...');
            const latest = await db.collection('datasets').findOne({}, { sort: { createdAt: -1 } });
            if (!latest) {
                console.log('No dataset found at all');
                process.exit(0);
            }
            return analyseDataset(latest, db);
        }
        await analyseDataset(dataset, db);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

async function analyseDataset(dataset: any, db: any) {
    console.log('Checking Dataset:', dataset.id, 'Target:', dataset.targetProfile, 'Query:', dataset.metadata?.query);

    // Find graph snapshot
    const record = await db.collection('records').findOne({
        datasetId: dataset.id,
        recordType: 'graph_snapshot'
    });

    if (!record) {
        console.log('No graph snapshot found');
        process.exit(0);
    }

    let data = record.data;
    // Handle compression if necessary
    if (record.compression === 'gzip') {
        const zlib = await import('zlib');
        // MongoDB returns Binary objects for gzipped data
        const buffer = data.buffer || data;
        data = JSON.parse(zlib.gunzipSync(buffer).toString());
    }

    const nodes = data.nodes || (data.graph && data.graph.nodes) || [];
    const node = nodes.find((n: any) => (n.label || '').includes('Kobi Brown') || (n.id || '').includes('astrokobi'));

    if (node) {
        console.log('Found Node:', JSON.stringify(node, null, 2));
    } else {
        console.log('Node Kobi Brown / astrokobi not found in graph snapshot');
        console.log('Sample labels:', nodes.slice(0, 5).map((n: any) => n.label));
    }

    // Also check if there's an active job for this dataset
    const job = await db.collection('jobs').findOne({ 'result.datasetId': dataset.id }, { sort: { createdAt: -1 } });
    if (job) {
        console.log('Latest Job for this dataset:', job.id, 'Status:', job.status, 'isEnriching:', job.metadata?.isEnriching);
    }

    process.exit(0);
} catch (e) {
    console.error("Error:", e);
    process.exit(1);
}
}

run();
