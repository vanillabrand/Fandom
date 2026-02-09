
import { mongoService } from './server/services/mongoService.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, './');

const envPath = path.resolve(rootDir, '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config({ path: path.resolve(rootDir, '.env') });
}

async function run() {
    const uri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
    if (!uri) {
        console.error('No connection string found');
        process.exit(1);
    }

    try {
        await mongoService.connect(uri);
        const db = mongoService.getDb();
        const admins = await db.collection('users').find({ role: 'admin' }).toArray();
        console.log('Admin Users:');
        admins.forEach(u => {
            console.log(`- ${u.email} (${u.role})`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
