
import * as fs from 'fs';
import * as path from 'path';

// Redefine the logic locally since we can't easily access private methods or instantiate the full service with DB connections
// This mirrors 'generateTreeFromServerData' and 'generateOverindexGraph' logic relevant to traversal

const loadJSON = (filename: string) => {
    try {
        const filePath = path.resolve(process.cwd(), filename);
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
        return null;
    }
};

const runTest = () => {
    console.log("Loading debug files...");
    const structure = loadJSON('debug_gemini_structure.json');
    const brands = loadJSON('debug_gemini_brands.json');
    const creators = loadJSON('debug_gemini_creators.json');

    if (!structure || !structure.root) {
        console.error("Invalid structure JSON");
        return;
    }

    console.log("✓ Debug files loaded.");

    // MOCK ANALYTICS OBJECT
    const analytics: any = {
        root: structure.root,
        creators: creators || [],
        brands: brands || [],
        topics: [],
        clusters: []
    };

    console.log(`Initial Analytics State: Creators: ${analytics.creators.length}, Brands: ${analytics.brands.length}`);

    // --- REPRODUCTION OF LOGIC ---

    const nodes: any[] = [];
    const addedNodeIds = new Set<string>();
    const extractedAnalytics = {
        creators: [] as any[],
        brands: [] as any[],
        topics: [] as any[],
        clusters: [] as any[],
        subtopics: [] as any[],
        topContent: [] as any[]
    };

    const processNode = (treeNode: any, parentId: string | null, inferredGroup: string | null = null) => {
        if (!treeNode) return;

        const rawId = treeNode.data?.handle || treeNode.label || `node_${Math.random()}`;
        const nodeId = rawId.toLowerCase().replace('@', '').trim();

        if (!addedNodeIds.has(nodeId)) {
            // Determine Group
            let group = treeNode.type || inferredGroup || 'unknown';
            if (group === 'root') group = 'main';
            if (group === 'category') group = 'cluster';
            if (group === 'topic') group = 'topic';
            if (group === 'subtopic') group = 'subtopic';
            if (group === 'entity') group = 'creator';
            if (group === 'content_node') group = 'post';
            if (group === 'influencer') group = 'creator';

            // Heuristic: If unknown but has handle/bio, assume creator
            if (group === 'unknown' && (treeNode.handle || treeNode.data?.handle)) {
                group = 'creator';
            }

            const richData = {
                ...treeNode.data,
                username: treeNode.data?.handle || nodeId,
                name: treeNode.data?.fullName || treeNode.label,
                group: group
            };

            nodes.push({
                id: nodeId,
                label: treeNode.label,
                group: group,
                data: richData
            });
            addedNodeIds.add(nodeId);

            // ANALYTICS POPULATION
            if (group === 'creator' || group === 'influencer') {
                extractedAnalytics.creators.push(richData);
            } else if (group === 'brand') {
                extractedAnalytics.brands.push(richData);
            } else if (group === 'topic') {
                extractedAnalytics.topics.push(richData);
            } else if (group === 'subtopic') {
                if (!extractedAnalytics.subtopics) extractedAnalytics.subtopics = [];
                extractedAnalytics.subtopics.push(richData);
            } else if (group === 'cluster') {
                extractedAnalytics.clusters.push(richData);
            }
        }

        // RECURSION - Children
        if (treeNode.children && Array.isArray(treeNode.children)) {
            treeNode.children.forEach((child: any) => processNode(child, nodeId));
        }

        // RECURSION - Profiles (THE FIX)
        if (treeNode.data && treeNode.data.profiles && Array.isArray(treeNode.data.profiles)) {
            // console.log(`Found ${treeNode.data.profiles.length} embedded profiles in ${treeNode.label}`);
            // Pass 'creator' as default for these embedded profiles
            treeNode.data.profiles.forEach((profile: any) => processNode(profile, nodeId, 'creator'));
        }
    };

    // START TRAVERSAL
    console.log("Starting Traversal...");
    if (analytics.root.children) {
        analytics.root.children.forEach((cluster: any) => {
            processNode(cluster, 'root');
        });
    }

    console.log("--- TRAVERSAL COMPLETE ---");
    console.log(`Generated Nodes: ${nodes.length}`);
    console.log(`Extracted Creators: ${extractedAnalytics.creators.length}`);
    console.log(`Extracted Brands: ${extractedAnalytics.brands.length}`);
    console.log(`Extracted Clusters: ${extractedAnalytics.clusters.length}`);

    // VERIFY MERGE LOGIC (Simulation)
    console.log("\n--- SIMULATING MERGE ---");

    // Merge extracted into main analytics (simulating line 1847 fix)
    const keys = Object.keys(extractedAnalytics);
    keys.forEach(key => {
        if (Array.isArray((extractedAnalytics as any)[key]) && Array.isArray(analytics[key])) {
            const existingMap = new Map(analytics[key].map((i: any) => [i.username || i.handle || i.name || i.label, i]));
            (extractedAnalytics as any)[key].forEach((item: any) => {
                const id = item.username || item.handle || item.name || item.label;
                if (id && !existingMap.has(id)) {
                    analytics[key].push(item);
                }
            });
        }
    });

    console.log(`Final Analytics Count (After Merge):`);
    console.log(`Creators: ${analytics.creators.length}`);
    console.log(`Brands: ${analytics.brands.length}`);

    if (nodes.length < 10) {
        console.error("FAIL: Too few nodes generated. Traversal likely broken.");
    } else {
        console.log("PASS: Node count looks healthy.");
    }

    if (analytics.creators.length === 0) {
        console.error("FAIL: No creators in final analytics.");
    }
};

runTest();
