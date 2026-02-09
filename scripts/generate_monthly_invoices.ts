/**
 * Monthly Invoice Generation Cron Job
 * 
 * Run this script on the 1st of every month to:
 * - Generate invoices for all users for the previous month
 * - Send invoice emails via MailJet
 * 
 * Usage:
 * - Manual: npx tsx scripts/generate_monthly_invoices.ts
 * - Cron (1st of month at 9am): 0 9 1 * * npx tsx scripts/generate_monthly_invoices.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { mongoService } from '../server/services/mongoService.js';
import { invoiceService } from '../server/services/invoiceService.js';

async function generateMonthlyInvoices() {
    try {
        console.log('[Invoice Cron] Starting monthly invoice generation...\n');

        // Get MongoDB URI
        const mongoUri = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('[Invoice Cron] Error: MONGO_DB_CONNECT not found in environment');
            process.exit(1);
        }

        // Check MailJet credentials
        const hasMailjet = process.env.MAILJET_APIKEY || process.env.MAILJET_API_KEY;
        if (!hasMailjet) {
            console.error('[Invoice Cron] Warning: MailJet credentials not found. Emails will not be sent.');
        }

        // Connect to database
        await mongoService.connect(mongoUri);
        console.log('[Invoice Cron] Connected to database\n');

        // Get previous month in YYYY-MM format
        const now = new Date();
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month = previousMonth.toISOString().slice(0, 7); // "2026-01"

        console.log(`[Invoice Cron] Generating invoices for: ${month}\n`);

        // Generate all invoices
        const result = await invoiceService.generateAllMonthlyInvoices(month);

        console.log('\n[Invoice Cron] Invoice Generation Complete!');
        console.log(`  - Success: ${result.success}`);
        console.log(`  - Failed: ${result.failed}`);
        console.log(`  - Total: ${result.success + result.failed}\n`);

        // Display results
        console.log('Results:');
        result.results.forEach((r, i) => {
            if (r.success) {
                console.log(`  ${i + 1}. ✅ ${r.email}: ${r.invoiceId} (£${r.amount.toFixed(2)})`);
            } else {
                console.log(`  ${i + 1}. ❌ ${r.email}: ${r.error}`);
            }
        });

        // Send emails for successful invoices
        if (process.env.MAILJET_API_KEY && result.success > 0) {
            console.log('\n[Invoice Cron] Sending invoice emails...');

            let emailsSent = 0;
            let emailsFailed = 0;

            for (const r of result.results) {
                if (r.success) {
                    try {
                        await invoiceService.sendInvoiceEmail(r.userId, r.invoiceId);
                        console.log(`  ✉️  Sent to ${r.email}`);
                        emailsSent++;
                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (error) {
                        console.error(`  ❌ Failed to email ${r.email}`);
                        emailsFailed++;
                    }
                }
            }

            console.log(`\n[Invoice Cron] Emails: ${emailsSent} sent, ${emailsFailed} failed`);
        }

        console.log('\n[Invoice Cron] Complete! 🎉\n');
        process.exit(0);

    } catch (error) {
        console.error('[Invoice Cron] Error:', error);
        process.exit(1);
    }
}

// Run the script
generateMonthlyInvoices();
