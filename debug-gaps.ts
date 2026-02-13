
import { JobOrchestrator } from './server/services/jobOrchestrator.js';

async function testGaps() {
    const orchestrator = JobOrchestrator.getInstance();

    // Case 1: Nested graph (what identifyEnrichmentGaps currently expects)
    const analytics1 = {
        graph: {
            nodes: [
                { id: 'user1', group: 'creator', data: { username: 'user1' } } // No followers/bio
            ]
        }
    };
    const gaps1 = (orchestrator as any).identifyEnrichmentGaps(analytics1);
    console.log("Case 1 (Nested):", gaps1);

    // Case 2: Top-level nodes (what graph_snapshot likely has)
    const analytics2 = {
        nodes: [
            { id: 'user2', group: 'creator', data: { username: 'user2' } } // No followers/bio
        ]
    };
    const gaps2 = (orchestrator as any).identifyEnrichmentGaps(analytics2);
    console.log("Case 2 (Top-level):", gaps2);

    // Case 3: Tree structure
    const analytics3 = {
        root: {
            id: 'root',
            children: [
                { id: 'user3', group: 'brand', data: { username: 'user3' } }
            ]
        }
    };
    const gaps3 = (orchestrator as any).identifyEnrichmentGaps(analytics3);
    console.log("Case 3 (Tree):", gaps3);
}

testGaps().catch(console.error);
