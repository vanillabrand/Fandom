
import { jobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data
const mockPlan = {
    intent: 'competitor_content_analysis',
    steps: [{
        input: { directUrls: ['https://instagram.com/competitor'] }
    }]
};

const mockResults = [[
    {
        type: 'Post',
        url: 'https://instagram.com/p/123',
        caption: 'Great new product! #awesome @partner',
        likesCount: 100,
        commentsCount: 10,
        timestamp: new Date().toISOString()
    },
    {
        type: 'Video',
        url: 'https://instagram.com/p/456',
        caption: 'Check this out #viral #awesome',
        likesCount: 500,
        commentsCount: 50,
        timestamp: new Date().toISOString()
    }
]];


async function runTest() {
    console.log("Running Competitor Content Analysis Test...");

    // Access private method via any cast (for testing)
    const orchestrator = jobOrchestrator as any;

    // 1. Test Graph Generation
    if (!orchestrator.generateCompetitorContentGraph) {
        console.error("❌ generateCompetitorContentGraph method NOT found!");
        return;
    }

    try {
        const graphData = orchestrator.generateCompetitorContentGraph(mockPlan, mockResults, "Analyze @competitor");

        console.log("Graph Generation Result:");
        console.log(`- Nodes: ${graphData.nodes.length}`);
        console.log(`- Links: ${graphData.links.length}`);
        console.log(`- Analytics available: ${!!graphData.analytics}`);
        console.log(`- Top Hashtags: ${JSON.stringify(graphData.analytics.contentAnalysis.topHashtags)}`);

        if (graphData.nodes.length > 0 && graphData.analytics.contentAnalysis.topHashtags.length > 0) {
            console.log("✅ Graph Generation Passed");
        } else {
            console.error("❌ Graph Generation Failed (Empty results)");
        }

        // 2. Test Dashboard Config
        // mock the flattened structure expected by dashboard config
        const mockAnalytics = {
            topics: graphData.nodes
                .filter((n: any) => n.group === 'topic')
                .map((n: any) => ({
                    name: n.data.hashtag || n.label,
                    percentage: `${n.data.count} posts`
                })),
            brands: graphData.nodes
                .filter((n: any) => n.group === 'brand')
                .map((n: any) => ({
                    name: n.data.mention || n.label,
                    evidence: `Mentioned ${n.data.count} times`
                })),
            topContent: graphData.nodes
                .filter((n: any) => n.group === 'post')
        };

        const dashboard = generateDashboardConfig("Analyze @competitor", "competitor_content_analysis", mockAnalytics);

        console.log("\nDashboard Config Result:");
        const hasHashtags = dashboard.widgets.some(w => w.id === 'top_hashtags');
        const hasMentions = dashboard.widgets.some(w => w.id === 'top_mentions');
        const hasContent = dashboard.widgets.some(w => w.id === 'content_gallery');

        console.log(`- Has Hashtags Widget: ${hasHashtags}`);
        console.log(`- Has Mentions Widget: ${hasMentions}`);
        console.log(`- Has Content Widget: ${hasContent}`);

        if (hasHashtags && hasMentions && hasContent) {
            console.log("✅ Dashboard Config Passed");
        } else {
            console.error("❌ Dashboard Config Failed");
        }

    } catch (e: any) {
        console.error("❌ Test Failed with Exception:", e);
    }
}

runTest();
