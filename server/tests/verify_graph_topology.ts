import { jobOrchestrator } from '../services/jobOrchestrator.js';

async function verifyTopology() {
    console.log("🧪 Verifying Graph Topology and Root Standardization...");

    const mockResults = [[{ username: "target1", followersCount: 100 }]];
    const mockPlan = { intent: "comparison", steps: [{ stepId: "step1", input: { username: ["target1"] } }] };

    // Test Comparison Graph
    console.log("\n--- Testing Comparison Graph ---");
    const compGraph = (jobOrchestrator as any).generateComparisonGraph(mockPlan, mockResults, "comparison query");
    const rootNode = compGraph.nodes.find((n: any) => n.id === 'MAIN');
    const clusterNode = compGraph.nodes.find((n: any) => n.id === 'MAIN_0');

    if (!rootNode) throw new Error("❌ Root node 'MAIN' missing in Comparison Graph");
    if (rootNode.group !== 'main') console.warn(`⚠️ Root node group is '${rootNode.group}', expected 'main'`);

    if (!clusterNode) throw new Error("❌ Cluster node 'MAIN_0' missing");
    if (clusterNode.group !== 'cluster') throw new Error(`❌ Cluster node group is '${clusterNode.group}', expected 'cluster'`);

    const link = compGraph.links.find((l: any) => l.source === 'MAIN' && l.target === 'MAIN_0');
    if (!link) throw new Error("❌ Link from MAIN to MAIN_0 missing");

    console.log("✅ Comparison Graph Topology Verified");

    // Test Hashtag Graph
    console.log("\n--- Testing Hashtag Graph ---");
    const hashtagGraph = (jobOrchestrator as any).generateHashtagGraph("hashtag query", mockResults);
    const hRoot = hashtagGraph.nodes.find((n: any) => n.id === 'MAIN');
    const hCluster = hashtagGraph.nodes.find((n: any) => n.group === 'cluster');

    if (!hRoot) throw new Error("❌ Root node 'MAIN' missing in Hashtag Graph");
    if (!hCluster) throw new Error("❌ Cluster node missing in Hashtag Graph");

    const hLink = hashtagGraph.links.find((l: any) => l.source === 'MAIN' && (l.target === hCluster.id));
    if (!hLink) throw new Error("❌ Link from MAIN to Cluster missing in Hashtag Graph");

    console.log("✅ Hashtag Graph Topology Verified");

    console.log("\n✨ All Topology Verifications Passed!");
}

verifyTopology().catch(err => {
    console.error(err);
    process.exit(1);
});
