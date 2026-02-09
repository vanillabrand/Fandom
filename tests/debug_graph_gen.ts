
import { jobOrchestrator } from '../server/services/jobOrchestrator.js';

// Mock Dependencies
const mockProfiles = [];
const mockQuery = '@cedricgrolet';
const mockAnalytics = {
    root: {
        type: 'root',
        label: '@cedricgrolet',
        children: [
            {
                type: 'cluster',
                label: 'Confectionery',
                id: 'cluster_confectionery',
                children: [
                    { type: 'profile', handle: '@dobbins_eats' }
                ]
            }
        ]
    }
};

async function runDebug() {
    console.log("Starting Debug Graph Gen...");
    const orchestrator = jobOrchestrator;

    // Bypass private method restriction for testing
    const graphData = await (orchestrator as any).generateOverindexGraph(
        mockProfiles,
        mockQuery,
        null,
        mockAnalytics,
        100
    );

    console.log("=== NODES ===");
    console.log(graphData.nodes.map((n: any) => `${n.id} (${n.group})`).join('\n'));

    console.log("\n=== LINKS ===");
    console.log(graphData.links.map((l: any) => `${l.source} -> ${l.target}`).join('\n'));

    const mainLinks = graphData.links.filter((l: any) => l.source === 'MAIN' || l.target === 'MAIN');
    console.log(`\nMain Node Links Found: ${mainLinks.length}`);
}

runDebug();
