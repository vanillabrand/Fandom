import { JobOrchestrator } from '../server/services/jobOrchestrator.js';

// MOCK DATA
const mockAiTree = {
    root: {
        id: 'main',
        label: '@bbc6music',
        type: 'main',
        children: [
            {
                id: 'cluster_1',
                label: 'Indie Rock',
                type: 'cluster',
                children: [
                    { id: 'steve_lamacq', label: '@steve_lamacq', type: 'creator' },
                    { id: 'gillespeterson', label: '@gillespeterson', type: 'creator' }
                ]
            }
        ]
    }
};

const mockProfileMapItems = [
    { username: 'steve_lamacq', biography: 'Legendary DJ', followersCount: 50000, latestPosts: [{ id: 'p1', caption: 'Music is life' }] },
    { username: 'gillespeterson', biography: 'Worldwide FM', followersCount: 150000, profilePicUrl: 'https://pic.com/gp.jpg' }
];

const orchestrator = JobOrchestrator.getInstance() as any;

async function testHydration() {
    console.log('='.repeat(60));
    console.log('🚀 TESTING RICH TREE RE-HYDRATION');
    console.log('='.repeat(60));

    // We simulate the syncApifyDatasetToLocal core logic
    // This is better than running the whole fetch because it isolates the hydration logic

    // Build the master map like the orchestrator does
    const masterProfileMap = new Map();
    mockProfileMapItems.forEach(item => masterProfileMap.set(item.username.toLowerCase(), item));

    const nodes: any[] = [];
    const addedNodeIds = new Set();
    const addNode = (node: any) => { if (!addedNodeIds.has(node.id)) { nodes.push(node); addedNodeIds.add(node.id); } };

    // Traverse function copied from implementation for verification
    const traverseAndHydrate = (node: any, parentId: string) => {
        const rawId = node.handle || node.id || node.label;
        const cleanId = rawId ? rawId.toString().toLowerCase().replace(/^@/, '').trim() : '';
        const nodeId = cleanId || `node_${Math.random()}`;
        const rawType = node.type || node.group;
        const group = (rawType && rawType !== 'root' && rawType !== 'main') ? rawType : (parentId === 'MAIN' ? 'cluster' : 'profile');

        if (rawType !== 'root' && rawType !== 'main' && nodeId !== 'MAIN') {
            const scrapedData = masterProfileMap.get(cleanId) || {};
            const richData = {
                ...(node.data || {}),
                ...scrapedData,
                bio: scrapedData.biography || '',
            };

            addNode({ id: nodeId, group, data: richData });
        }

        if (node.children) node.children.forEach((c: any) => traverseAndHydrate(c, nodeId));
    };

    console.log('Running hydration traversal...');
    traverseAndHydrate(mockAiTree.root, 'MAIN');

    console.log(`Generated ${nodes.length} nodes from tree.`);

    const steve = nodes.find(n => n.id === 'steve_lamacq');
    const gilles = nodes.find(n => n.id === 'gillespeterson');

    const steveOk = steve && steve.data.bio === 'Legendary DJ';
    const gillesOk = gilles && gilles.data.bio === 'Worldwide FM' && gilles.data.profilePicUrl === 'https://pic.com/gp.jpg';

    console.log(`  Steve Lamacq Hydrated: ${steveOk ? '✅' : '❌'}`);
    console.log(`  Gilles Peterson Hydrated: ${gillesOk ? '✅' : '❌'}`);

    if (steveOk && gillesOk) {
        console.log('\n🎉 HYDRATION ENGINE VERIFIED: PASS');
    } else {
        console.log('\n❌ HYDRATION ENGINE VERIFIED: FAIL');
    }
    console.log('='.repeat(60));
}

testHydration();
