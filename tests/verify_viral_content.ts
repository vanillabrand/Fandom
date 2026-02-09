
import { JobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data
const mockPlan = {
    intent: 'viral_content',
    search_keywords: ['#viral'],
    steps: []
};

const now = Date.now();
const hour = 1000 * 60 * 60;

const mockResults = [
    [ // Hashtag Posts
        {
            caption: "Super Viral Post!",
            likesCount: 5000,
            commentsCount: 200,
            timestamp: new Date(now - 1 * hour).toISOString() // 1 hour ago
        },
        {
            caption: "Old boring post",
            likesCount: 100,
            commentsCount: 5,
            timestamp: new Date(now - 48 * hour).toISOString() // 48 hours ago
        },
        {
            caption: "Recent but low engagement",
            likesCount: 10,
            commentsCount: 0,
            timestamp: new Date(now - 0.5 * hour).toISOString() // 30 mins ago
        }
    ]
];

async function runTest() {
    console.log("🧪 Testing Viral Content Graph Generation...");

    const orchestrator = (JobOrchestrator as any).getInstance();

    try {
        console.log("Generating graph...");
        const graphData = orchestrator['generateViralGraph'](mockPlan, mockResults, "What is trending?");

        console.log("Graph Structure:");
        console.log(`- Nodes: ${graphData.nodes.length}`);
        // Logic: 1 ROOT + Top 20 posts. We have 3 posts. Should detect 3.

        // Check filtering/scoring
        const nodes = graphData.nodes;
        const viralNode = nodes.find((n: any) => n.data.caption === "Super Viral Post!");
        const boringNode = nodes.find((n: any) => n.data.caption === "Old boring post");

        if (viralNode && boringNode) {
            console.log(`Viral Velocity: ${viralNode.data.velocity}`);
            console.log(`Boring Velocity: ${boringNode.data.velocity}`);

            // Viral: Need (5000 + 400)/2 = 2700 score roughly.
            // Boring: (100 + 10)/49 = 2 score roughly.

            if (parseFloat(viralNode.data.velocity) > parseFloat(boringNode.data.velocity)) {
                console.log("✅ Velocity Scoring Logic Correct");
            } else {
                console.error("❌ Velocity Scoring Logic Failed");
                process.exit(1);
            }
        }

        console.log("Analytics Output:", JSON.stringify(graphData.analytics.viralAnalysis, null, 2));

        // 2. Test Dashboard Config
        console.log("\n🧪 Testing Dashboard Configuration...");
        const analysisResult = {
            analytics: {
                ...graphData.analytics,
                topContent: graphData.nodes
                    .filter((n: any) => n.group === 'post')
                    .map((n: any) => ({
                        title: n.label,
                        views: n.data.velocity + " eng/hr",
                        description: n.data.caption
                    }))
            } // Mocking processMapGeneration flattening
        };

        const dashboard = generateDashboardConfig("What is trending?", "viral_content", analysisResult.analytics);

        const hasGallery = dashboard.widgets.some(w => w.id === 'content_gallery');

        if (hasGallery) {
            console.log("✅ Dashboard Config Passed");
        } else {
            console.error("❌ Dashboard Config Failed (Missing content_gallery)");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Test Failed with Exception:", e);
        process.exit(1);
    }
}

runTest();
