
import { JobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data
const mockPlan = {
    intent: 'influencer_identification',
    search_keywords: ['vegan'],
    steps: []
};

// Results[0] would be Google Search results (not used directly in graph gen, usually skipped or processed)
// Results[1] would be Enriched Details
const mockResults = [
    [], // Step 1 output (ignored by graph gen usually if step 2 exists)
    [ // Step 2 output (Enriched Profiles)
        {
            username: "vegan_chef_london",
            fullName: "Chef John",
            biography: "Vegan recipes in London",
            followersCount: 50000,
            profilePicUrl: "http://pic.url/1"
        },
        {
            username: "plantbased_sarah",
            fullName: "Sarah",
            biography: "Plant based lifestyle",
            followersCount: 12000,
            profilePicUrl: "http://pic.url/2"
        }
    ]
];

async function runTest() {
    console.log("🧪 Testing Influencer Identification Graph Generation...");

    const orchestrator = (JobOrchestrator as any).getInstance();

    try {
        console.log("Generating graph...");
        const graphData = orchestrator['generateInfluencerGraph'](mockPlan, mockResults, "Find vegan influencers");

        console.log("Graph Structure:");
        console.log(`- Nodes: ${graphData.nodes.length}`); // Should be 1 (ROOT) + 2 (Creators) = 3
        console.log(`- Links: ${graphData.links.length}`);

        // Validation
        const creators = graphData.nodes.filter((n: any) => n.group === 'creator');

        if (graphData.nodes.length >= 3 && creators.length === 2) {
            console.log("✅ Graph Generation Passed");
        } else {
            console.error(`❌ Graph Generation Failed (Expected 3+ nodes, got ${graphData.nodes.length})`);
            process.exit(1);
        }

        // 2. Test Dashboard Config
        console.log("\n🧪 Testing Dashboard Configuration...");
        const mockAnalytics = {
            overindexing: graphData.analytics.overindexing // mimic what processMapGeneration would do
        };

        const dashboard = generateDashboardConfig("Find vegan influencers", "influencer_identification", mockAnalytics);

        const hasCreatorList = dashboard.widgets.some(w => w.id === 'creator_list');

        if (hasCreatorList) {
            const widget = dashboard.widgets.find(w => w.id === 'creator_list');
            if (widget && widget.data.items.length === 2 && widget.data.items[0].title) {
                console.log("✅ Dashboard Config Passed");
            } else {
                console.error("❌ Dashboard Config Failed (Widget data mismatch)");
                console.log("Items:", JSON.stringify(widget?.data.items));
                process.exit(1);
            }
        } else {
            console.error("❌ Dashboard Config Failed (Missing widget)");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Test Failed with Exception:", e);
        process.exit(1);
    }
}

runTest();
