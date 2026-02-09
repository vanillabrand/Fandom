
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeFandomDeepDive } from '../../services/geminiService.js';

// Load Env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function runTest() {
    console.log("🧪 Testing Gemini 3D Model Generation...");

    if (!process.env.GEMINI_API_KEY) {
        console.error("❌ GEMINI_API_KEY is missing in .env.local");
        process.exit(1);
    }

    // Mock Context for @nike
    const mockContext = [
        {
            username: 'nike',
            biography: 'Just Do It. 👟 Basketball, Running, Culture.',
            followersCount: 300000000,
            mediaCount: 5000,
            latestPosts: [
                { caption: "New Air Max dropping soon. #sneakerhead #airmax" },
                { caption: "LeBron James breaking records. 🏀 #kingjames" },
                { caption: "Run your best mile today." }
            ]
        },
        {
            username: 'sneakernews',
            biography: 'Your daily dose of sneaker culture.',
            followersCount: 12000000
        }
    ];

    console.log("📤 Sending Mock Data to Gemini...");

    try {
        const result = await analyzeFandomDeepDive(
            '@nike',
            mockContext, // content context
            'structure', // mode
            'instagram',
            '', // datasetUrl
            100, // sampleSize
            true, // useVisualTheme = TRUE
            mockContext, // richContext
            'full' // mode='full' for comprehensive analysis
        );

        console.log("\n✅ Analysis Complete!");

        if (result.analytics && result.analytics.visualTheme) {
            const vt = result.analytics.visualTheme;
            console.log("\n🎨 VISUAL THEME DETECTED:");
            console.log("Archetype:", vt.archetype);
            console.log("Colors:", vt.primaryColor);

            if (vt.models && vt.models.length > 0) {
                console.log(`\n📦 Generated ${vt.models.length} 3D Models:`);
                vt.models.forEach((m: any) => {
                    console.log(`\n--- [${m.id}] ---`);
                    console.log(`SVG Icon: ${m.svgIcon ? (m.svgIcon.substring(0, 50) + '...') : 'MISSING'}`);
                    console.log(`OBJ Data: ${m.objData ? (m.objData.substring(0, 100) + '...') : 'MISSING'}`);
                });
            } else {
                console.warn("⚠️ No models generated in visualTheme.");
            }

            if (vt.nodeTypeMapping) {
                console.log("\n🗺️ Node Mappings:", JSON.stringify(vt.nodeTypeMapping, null, 2));
            }

        } else {
            console.error("❌ No visualTheme found in analytics output.");
            console.log("Full Output Keys:", Object.keys(result));
            if (result.analytics) console.log("Analytics Keys:", Object.keys(result.analytics));
        }

    } catch (error) {
        console.error("❌ Test Failed:", error);
    }
}

runTest();
