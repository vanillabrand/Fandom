/**
 * Migration Script: Add status and role fields to existing users
 * 
 * Run this once to update all existing users in the database.
 * 
 * Usage: npx tsx scripts/migrate_users.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { mongoService } from '../server/services/mongoService.js';

const SUPER_ADMINS = ['vanillabrand@googlemail.com', 'vanillabrand@gmail.com'];

async function migrateUsers() {
    try {
        console.log('[Migration] Starting user migration...\n');

        // Get MongoDB URI from environment
        const mongoUri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('[Migration] Error: MONGO_DB_CONNECT not found in environment variables');
            console.error('Make sure .env.local contains MONGO_DB_CONNECT');
            process.exit(1);
        }

        // Connect to database
        await mongoService.connect(mongoUri);
        console.log('[Migration] Connected to database\n');

        const db = mongoService.getDb();
        const usersCollection = db.collection('users');

        // Get all users
        const allUsers = await usersCollection.find({}).toArray();
        console.log(`[Migration] Found ${allUsers.length} total users\n`);

        let updatedCount = 0;
        let alreadyMigratedCount = 0;
        let adminPromotedCount = 0;

        for (const user of allUsers) {
            const updates: any = {};
            let needsUpdate = false;

            // Add status if missing
            if (!user.status) {
                updates.status = 'active'; // Auto-approve existing users
                needsUpdate = true;
                console.log(`  - ${user.email}: Adding status = 'active'`);
            }

            // Add role if missing
            if (!user.role) {
                const isAdmin = user.email && SUPER_ADMINS.includes(user.email);
                updates.role = isAdmin ? 'admin' : 'user';
                needsUpdate = true;
                console.log(`  - ${user.email}: Adding role = '${updates.role}'`);

                if (isAdmin) {
                    adminPromotedCount++;
                }
            }

            // Promote super admins if they have wrong role
            if (user.email && SUPER_ADMINS.includes(user.email) && user.role !== 'admin') {
                updates.role = 'admin';
                updates.status = 'active'; // Ensure admins are active
                needsUpdate = true;
                adminPromotedCount++;
                console.log(`  - ${user.email}: Promoting to admin`);
            }

            // Apply updates
            if (needsUpdate) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: updates }
                );
                updatedCount++;
            } else {
                alreadyMigratedCount++;
            }
        }

        console.log('\n[Migration] Complete!\n');
        console.log('Summary:');
        console.log(`  - Total users: ${allUsers.length}`);
        console.log(`  - Updated: ${updatedCount}`);
        console.log(`  - Already migrated: ${alreadyMigratedCount}`);
        console.log(`  - Admins promoted: ${adminPromotedCount}`);
        console.log('\nAll existing users now have status="active" and proper roles.');
        console.log('New signups will have status="pending" and require approval.\n');

        process.exit(0);
    } catch (error) {
        console.error('[Migration] Error:', error);
        process.exit(1);
    }
}

// Run migration
migrateUsers();
