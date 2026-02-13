
import { JobOrchestrator } from './server/services/jobOrchestrator.js';
import { mongoService } from './server/services/mongoService.js';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = "mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0";

async function diagnoseKobiScrape() {
    console.log("--- Diagnosing Kobi Brown Scrape (Full DB Init) ---");

    // Init DB
    try {
        await mongoService.connect(MONGO_URI);
    } catch (e) {
        console.warn("DB connection failed, proceeding without it (might fail later):", e);
    }

    const orchestrator = JobOrchestrator.getInstance();

    const targetHandle = 'astrokobi';

    try {
        console.log(`[Diagnostic] Triggering Deep Scrape for @${targetHandle}...`);
        // Actor dSCLg0C3YEZ83HzYX is Instagram Profile Scraper
        const result = await (orchestrator as any).runApifyActor('dSCLg0C3YEZ83HzYX', {
            usernames: [targetHandle]
        }, 'diag_job_789', {
            taskName: "Diagnostic Scrape"
        });

        console.log("Scrape Status:", result?.status);
        console.log("Items found:", result?.items?.length);

        if (result?.items && result.items.length > 0) {
            const item = result.items[0];
            console.log("RAW Scraper Item Keys:", Object.keys(item).join(', '));
            console.log("Metrics Check:");
            // Check absolutely everything
            const metricFields = [
                'followersCount', 'followerCount', 'followers_count', 'follower_count', 'followers',
                'followsCount', 'followingCount', 'following_count', 'follower_count', 'follows', 'following',
                'postsCount', 'mediaCount', 'postCount', 'posts_count', 'media_count', 'posts'
            ];

            for (const f of metricFields) {
                if (item[f] !== undefined) console.log(`- ${f}:`, item[f], `(${typeof item[f]})`);
            }

            if (item.edge_followed_by) console.log("- edge_followed_by:", JSON.stringify(item.edge_followed_by));

            const normalized = (orchestrator as any).normalizeToStandardProfile(item);
            console.log("Normalized Profile Metrics:", {
                username: normalized.username,
                followers: normalized.followersCount,
                following: normalized.followsCount,
                posts: normalized.postsCount
            });

            if (normalized.followersCount === 0 || normalized.followersCount === null) {
                console.log("ERROR: Normalized followers is still 0/null despite scraper run.");
            }
        } else {
            console.log("No items returned by scraper. Blocking might be happening.");
        }
    } catch (err) {
        console.error("Scrape failed:", err);
    } finally {
        await mongoService.disconnect();
        process.exit(0);
    }
}

diagnoseKobiScrape().catch(console.error);
