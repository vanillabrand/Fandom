
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
const envLocalPath = path.resolve(__dirname, '../../.env.local');
console.log(`Loading env from: ${envLocalPath}`);
dotenv.config({ path: envLocalPath });

const MONGODB_URI = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ No MongoDB URI found in .env.local");
    process.exit(1);
}

console.log(`🔌 Attempting to connect to MongoDB...`);
// Mask the password for display
console.log(`URI: ${MONGODB_URI.replace(/:([^:@]+)@/, ':****@')}`);

async function testConnection() {
    try {
        await mongoose.connect(MONGODB_URI!, {
            serverSelectionTimeoutMS: 5000, // Fail fast
        });
        console.log("✅ MongoDB Connection SUCCESSFUL!");
        await mongoose.disconnect();
        console.log("Disconnected.");
        process.exit(0);
    } catch (error: any) {
        console.error("❌ MongoDB Connection FAILED:");
        console.error(error.title || error.name);
        console.error(error.message);

        if (error.message.includes('ETIMEDOUT')) {
            console.log("\n⚠️  DIAGNOSIS: ETIMEDOUT\n");
            console.log("This almost always means your current IP address is NOT whitelisted in MongoDB Atlas.");
            console.log("Please go to the MongoDB Atlas Dashboard -> Network Access -> Add IP Address (Current IP).");
        }
        process.exit(1);
    }
}

testConnection();
