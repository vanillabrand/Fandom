import sqlite3 from 'sqlite3';
import { mongoService } from '../services/mongoService';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;
const SQLITE_DB_PATH = './fandom.db';

async function migrate() {
    console.log('🚀 Starting SQLite → MongoDB Migration...\n');

    if (!MONGODB_URI) {
        console.error('❌ MONGO_DB_CONNECT not found in .env.local');
        process.exit(1);
    }

    try {
        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB Atlas...');
        await mongoService.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Connect to SQLite
        console.log('📂 Opening SQLite database...');
        const db = new sqlite3.Database(SQLITE_DB_PATH);
        console.log('✅ SQLite database opened\n');

        // Migrate datasets
        await migrateDatasets(db);

        // Migrate records
        await migrateRecords(db);

        // Close connections
        db.close();
        await mongoService.disconnect();

        console.log('\n🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

async function migrateDatasets(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log('📊 Migrating datasets...');

        db.all('SELECT * FROM datasets', async (err, rows: any[]) => {
            if (err) {
                reject(err);
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('⚠️  No datasets found in SQLite');
                resolve();
                return;
            }

            let migrated = 0;
            let skipped = 0;

            for (const row of rows) {
                try {
                    // Check if dataset already exists
                    const existing = await mongoService.getDatasetById(row.id);
                    if (existing) {
                        console.log(`   ⏭️  Skipping existing dataset: ${row.name}`);
                        skipped++;
                        continue;
                    }

                    // Create dataset in MongoDB
                    await mongoService.createDataset({
                        id: row.id,
                        name: row.name,
                        platform: row.platform,
                        targetProfile: row.target_profile || row.targetProfile,
                        dataType: row.data_type || row.dataType,
                        recordCount: row.record_count || row.recordCount || 0,
                        createdAt: new Date(row.created_at || row.createdAt),
                        tags: row.tags ? JSON.parse(row.tags) : [],
                        metadata: row.metadata ? JSON.parse(row.metadata) : {}
                    });

                    migrated++;
                    console.log(`   ✅ Migrated dataset: ${row.name}`);
                } catch (error) {
                    console.error(`   ❌ Failed to migrate dataset ${row.name}:`, error);
                }
            }

            console.log(`\n📊 Datasets: ${migrated} migrated, ${skipped} skipped\n`);
            resolve();
        });
    });
}

async function migrateRecords(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log('📝 Migrating records...');

        // Get total count first
        db.get('SELECT COUNT(*) as count FROM records', async (err, result: any) => {
            if (err) {
                reject(err);
                return;
            }

            const totalRecords = result.count;
            console.log(`   Total records to migrate: ${totalRecords}`);

            if (totalRecords === 0) {
                console.log('⚠️  No records found in SQLite');
                resolve();
                return;
            }

            const batchSize = 1000;
            let offset = 0;
            let totalMigrated = 0;

            while (offset < totalRecords) {
                const records: any[] = await new Promise((res, rej) => {
                    db.all(
                        `SELECT * FROM records LIMIT ${batchSize} OFFSET ${offset}`,
                        (err, rows) => {
                            if (err) rej(err);
                            else res(rows || []);
                        }
                    );
                });

                if (records.length === 0) break;

                // Transform and insert records
                const transformedRecords = records.map(r => ({
                    datasetId: r.dataset_id || r.datasetId,
                    recordType: r.record_type || r.recordType || 'unknown',
                    platform: r.platform || 'unknown',
                    username: r.username || r.ownerUsername,
                    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
                    createdAt: new Date(r.created_at || r.createdAt || Date.now()),
                    indexed: r.indexed || false
                }));

                try {
                    const inserted = await mongoService.insertRecords(transformedRecords);
                    totalMigrated += inserted;
                    offset += batchSize;

                    const progress = Math.min(100, Math.round((offset / totalRecords) * 100));
                    console.log(`   📝 Progress: ${progress}% (${totalMigrated}/${totalRecords} records)`);
                } catch (error) {
                    console.error(`   ❌ Failed to insert batch at offset ${offset}:`, error);
                    offset += batchSize; // Skip this batch and continue
                }
            }

            console.log(`\n📝 Records: ${totalMigrated} migrated\n`);
            resolve();
        });
    });
}

// Run migration
migrate();
