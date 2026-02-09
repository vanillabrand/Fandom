import { jobOrchestrator } from '../services/jobOrchestrator.js';
async function testLabelResolution() {
    console.log("🧪 Testing graph label resolution...");
    const mockPlan = {
        steps: [
            { stepId: "step_1", actorId: "scraper", input: { username: ["target1"] } }
        ]
    };
    const mockResults = [
        [
            { username: "resolved_target_1", followersCount: 100 }
        ]
    ];
    const mockAnalytics = {
        visualAnalysis: {
            colorPalette: ["#ff0000"]
        }
    };
    // [CASE 1] Resolver logic in generateComparisonGraph
    // We mock a plan that would trigger this
    const comparisonPlan = {
        intent: "comparison",
        steps: [
            { stepId: "step_1", input: { username: ["@USE_DATA_FROM_STEP_step_1"] } }
        ]
    };
    const graph = jobOrchestrator.generateComparisonGraph(comparisonPlan, mockResults, "test query");
    console.log("Generated Nodes:", JSON.stringify(graph.nodes.slice(0, 3), null, 2));
    const mainNode = graph.nodes.find((n) => n.id === 'MAIN_0');
    if (mainNode && mainNode.label === "@resolved_target_1") {
        console.log("✅ Label Resolution Test PASSED");
        if (mainNode.id === "MAIN_0 ") {
            console.error("❌ Trailing space still exists in ID!");
            process.exit(1);
        }
        else {
            console.log("✅ Trailing space in ID fixed.");
        }
    }
    else {
        console.error("❌ Label Resolution Test FAILED. Label was:", mainNode?.label);
        process.exit(1);
    }
}
testLabelResolution().catch(console.error);
