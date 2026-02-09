
import { JobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data
const mockPlan = {
    intent: 'audience_overlap',
    steps: [
        { actorId: 'post_scraper', input: { username: ['nike'] } }, // Step 1: Nike
        { actorId: 'post_scraper', input: { username: ['adidas'] } } // Step 2: Adidas
    ]
};

// Result 1: Nike Audience
const resultNike = [
    { username: "fan_1", fullName: "Fan One" },
    { username: "fan_2", fullName: "Fan Two" },
    { username: "shared_fan", fullName: "Shared Fan" }
];

// Result 2: Adidas Audience
const resultAdidas = [
    { username: "fan_3", fullName: "Fan Three" },
    { username: "shared_fan", fullName: "Shared Fan" } // Overlap!
];

const mockResults = [resultNike, resultAdidas];

async function runTest() {
    console.log("🧪 Testing Audience Overlap Graph Generation...");

    const orchestrator = (JobOrchestrator as any).getInstance();

    try {
        console.log("Generating graph...");
        // Use generateComparisonGraph directly
        const graphData = orchestrator['generateComparisonGraph'](mockPlan, mockResults, "Overlap Nike vs Adidas");

        console.log("Graph Structure:");
        console.log(`- Nodes: ${graphData.nodes.length}`);
        // Expected: ROOT, Main_Nike, Main_Adidas, fan_1, fan_2, shared_fan, fan_3
        // Total: 7 nodes.

        const sharedNode = graphData.nodes.find((n: any) => n.id === 'shared_fan');
        if (sharedNode) {
            console.log("✅ Shared Node found");
            const linksToShared = graphData.links.filter((l: any) => l.target === 'shared_fan');
            console.log(`- Links to shared node: ${linksToShared.length}`);

            // Should be 2 links (one from Nike Main, one from Adidas Main)
            if (linksToShared.length >= 2) {
                console.log("✅ Intersection Linked Correctly");
            } else {
                console.error("❌ Link Intersection Failed");
                // Depending on implementation, generateComparisonGraph might add "Overlap Cluster" instead?
                // In generateComparisonGraph logic I read: "if (isSharedFollower...) links.push({source: overlapClusterId...})"
                // So maybe it links to an Overlap Cluster?
                // Let's check graphData structure more deeply if this fails.
            }

            if (graphData.analytics.comparison && graphData.analytics.comparison.overlapPercentage) {
                console.log(`✅ Overlap Analytics: ${graphData.analytics.comparison.overlapPercentage}%`);
                console.log(`✅ Shared Count: ${graphData.analytics.comparison.shared.count}`);
                if (graphData.analytics.comparison.shared.count === 1) {
                    console.log("✅ Shared Count Correct (1)");
                } else {
                    console.error("❌ Shared Count Mismatch");
                }
            } else {
                console.error("❌ Missing Comparison Analytics");
            }

        } else {
            console.error("❌ Shared Node 'shared_fan' NOT found");
            process.exit(1);
        }

        // 2. Test Dashboard Config
        console.log("\n🧪 Testing Dashboard Configuration...");
        const dashboard = generateDashboardConfig("Overlap of Nike vs Adidas", "audience_overlap", graphData.analytics);

        const hasOverlapCard = dashboard.widgets.some(w => w.id === 'overlap_percentage');

        if (hasOverlapCard) {
            console.log("✅ Dashboard Config Passed");
        } else {
            console.error("❌ Dashboard Config Failed (Missing overlap_percentage widget)");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Test Failed with Exception:", e);
        process.exit(1);
    }
}

runTest();
