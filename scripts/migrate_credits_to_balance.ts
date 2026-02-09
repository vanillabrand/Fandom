/**
 * Migration Script: Convert credits to balance (£ GBP)
 * 
 * Converts existing user "credits" field to "balance" in £ GBP
 * Conversion rate: 1 credit = £0.01
 * 
 * Usage: npx tsx scripts/migrate_credits_to_balance.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { mongoService } from '../server/services/mongoService.js';

async function migrateCreditsToBalance() {
    try {
        console.log('[Migration] Starting credits → balance migration...\n');

        // Get MongoDB URI from environment
        const mongoUri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('[Migration] Error: MONGO_DB_CONNECT not found in environment variables');
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
        let noCreditsCount = 0;

        for (const user of allUsers) {
            // Check if user already has balance field
            if (user.balance !== undefined) {
                console.log(`  - ${user.email || user.googleId}: Already has balance (£${user.balance.toFixed(2)})`);
                alreadyMigratedCount++;
                continue;
            }

            // Convert credits to balance
            const credits = user.credits || 0;
            const balance = credits * 0.01; // 1 credit = £0.01

            if (credits === 0) {
                noCreditsCount++;
            }

            // Update user
            await usersCollection.updateOne(
                { _id: user._id },
                {
                    $set: { balance },
                    $unset: { credits: "" }
                }
            );

            console.log(`  - ${user.email || user.googleId}: ${credits} credits → £${balance.toFixed(2)}`);
            updatedCount++;
        }

        console.log('\n[Migration] Complete!\n');
        console.log('Summary:');
        console.log(`  - Total users: ${allUsers.length}`);
        console.log(`  - Migrated: ${updatedCount}`);
        console.log(`  - Already migrated: ${alreadyMigratedCount}`);
        console.log(`  - Had zero credits: ${noCreditsCount}`);
        console.log('\nAll users now have £ GBP balance instead of credits.\n');

        process.exit(0);
    } catch (error) {
        console.error('[Migration] Error:', error);
        process.exit(1);
    }
}

// Run migration
migrateCreditsToBalance();
