
import { jobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data for Hashtag Tracking
const mockPlan = {
    intent: 'hashtag_tracking',
    steps: [{
        input: { directUrls: ['https://instagram.com/explore/tags/summer'] }
    }]
};

const mockResults = [[
    {
        type: 'Image',
        url: 'https://instagram.com/p/123',
        caption: 'Loving the sun! #summer #beach #vibes',
        likesCount: 200,
        commentsCount: 20,
        ownerUsername: 'creator_one',
        owner: { profilePicUrl: 'http://pic.url/1' }
    },
    {
        type: 'Video',
        url: 'https://instagram.com/p/456',
        caption: 'Best vacation ever #summer #travel @coolbrand',
        likesCount: 800,
        commentsCount: 80,
        ownerUsername: 'influencer_guy',
        owner: { profilePicUrl: 'http://pic.url/2' }
    }
]];


async function runTest() {
    console.log("Running Hashtag Tracking Test...");

    // Access private method via any cast
    const orchestrator = jobOrchestrator as any;

    if (!orchestrator.generateHashtagGraph) {
        console.error("❌ generateHashtagGraph method NOT found!");
        return;
    }

    try {
        const graphData = orchestrator.generateHashtagGraph(mockPlan, mockResults, "Analyze #summer");

        console.log("Graph Generation Result:");
        console.log(`- Nodes: ${graphData.nodes.length}`);
        console.log(`- Links: ${graphData.links.length}`);
        console.log(`- Analytics available: ${!!graphData.analytics}`);
        console.log(`- Top Related Tags: ${JSON.stringify(graphData.analytics.hashtagAnalysis.topRelatedTags)}`);

        // Validation
        const hasBeachTag = graphData.analytics.hashtagAnalysis.topRelatedTags.some((t: any) => t.tag === '#beach');
        const hasInfluencer = graphData.analytics.hashtagAnalysis.topAuthors.some((a: any) => a.username === 'influencer_guy');

        if (graphData.nodes.length > 0 && hasBeachTag && hasInfluencer) {
            console.log("✅ Graph Generation Passed");
        } else {
            console.error("❌ Graph Generation Failed (Missing expected data)");
        }

        // 2. Test Dashboard Config
        const mockAnalytics = {
            topics: graphData.nodes.filter((n: any) => n.group === 'topic' && n.id !== 'MAIN_HASHTAG').map((n: any) => ({ name: n.label })),
            creators: graphData.nodes.filter((n: any) => n.group === 'creator').map((n: any) => ({ name: n.label, handle: n.data.username })),
            topContent: graphData.nodes.filter((n: any) => n.group === 'post' || n.data.url)
        };

        const dashboard = generateDashboardConfig("Analyze #summer", "hashtag_tracking", mockAnalytics);

        console.log("\nDashboard Config Result:");
        const hasRelatedTags = dashboard.widgets.some(w => w.id === 'related_hashtags');
        const hasContributors = dashboard.widgets.some(w => w.id === 'top_contributors');
        const hasContent = dashboard.widgets.some(w => w.id === 'content_gallery');

        console.log(`- Has Related Hashtags Widget: ${hasRelatedTags}`);
        console.log(`- Has Contributors Widget: ${hasContributors}`);
        console.log(`- Has Content Widget: ${hasContent}`);

        if (hasRelatedTags && hasContributors && hasContent) {
            console.log("✅ Dashboard Config Passed");
        } else {
            console.error("❌ Dashboard Config Failed");
        }

    } catch (e: any) {
        console.error("❌ Test Failed with Exception:", e);
    }
}

runTest();
