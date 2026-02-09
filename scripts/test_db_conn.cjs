
const { MongoClient } = require('mongodb');

const atlasUri = 'mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0';
const localUri = 'mongodb://localhost:27017/fandom_analytics';

async function test(uri, name) {
    console.log(`Testing ${name}...`);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
        await client.connect();
        console.log(`✅ ${name} Success!`);
        await client.close();
        return true;
    } catch (e) {
        console.log(`❌ ${name} Failed: ${e.message}`);
        return false;
    }
}

async function run() {
    const atlas = await test(atlasUri, 'Atlas');
    const local = await test(localUri, 'Local');

    if (atlas) console.log('Recommendation: Use Atlas (Already configured)');
    else if (local) console.log('Recommendation: Use Local (Modify .env.local to MONGO_DB_CONNECT=mongodb://localhost:27017/fandom_analytics)');
    else console.log('Recommendation: Check your connection settings and firewall.');
}

run();
