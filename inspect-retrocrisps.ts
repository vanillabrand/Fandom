
import { mongoService } from './server/services/mongoService.js';
import dotenv from 'dotenv';
dotenv.config();

async function inspectProfile() {
    // Note: mongoService is already instantiated
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fandom_analytics';
    await mongoService.connect(uri);
    const db = (mongoService as any).db; // Accessing private db for inspection

    if (!db) {
        console.error('Database not connected!');
        return;
    }

    const handle = 'retrocrisps';
    console.log(`--- Inspecting '@${handle}' in DB ---`);

    const cached = await db.collection('profile_cache').findOne({
        $or: [
            { username: new RegExp(`^${handle}$`, 'i') },
            { handle: new RegExp(`^${handle}$`, 'i') }
        ]
    });
    console.log('Profile Cache:', cached ? JSON.stringify(cached, null, 2) : 'Not found');

    const records = await db.collection('records').find({
        $or: [
            { username: new RegExp(`^${handle}$`, 'i') },
            { ownerUsername: new RegExp(`^${handle}$`, 'i') },
            { author: new RegExp(`^${handle}$`, 'i') }
        ]
    }).toArray();
    console.log(`Found ${records.length} records in 'records' collection.`);
    if (records.length > 0) {
        records.slice(0, 3).forEach((r, i) => {
            console.log(`Record ${i + 1} (Type: ${r.recordType || r.type}):`, JSON.stringify(r, null, 2));
        });
    }

    await mongoService.disconnect();
}

inspectProfile().catch(console.error);
