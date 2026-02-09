
import * as fs from 'fs';
import * as path from 'path';

// MOCKING THE LOGIC FROM jobOrchestrator.ts -> generateTreeFromServerData

const loadJSON = (filename: string) => {
    try {
        const filePath = path.resolve(process.cwd(), filename);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
    }
    return null;
};

const runTest = () => {
    console.log("Loading files...");
    const structure = loadJSON('debug_gemini_structure.json');
    // We need a profiles array. Use the dataset if available, otherwise mock.
    const datasetFilename = 'dataset_instagram-api-scraper_2026-01-18_15-06-04-508.json';
    let profiles = loadJSON(datasetFilename);

    if (!profiles || !Array.isArray(profiles)) {
        console.warn("Real dataset not found or invalid, using mock profiles.");
        profiles = [
            { username: 'mock_user_1', followersCount: 5000, fullName: 'Mock One' },
            { username: 'cedricgrolet', followersCount: 1000000, fullName: 'Cedric Grolet', biography: 'Pastry Chef' }
        ];
    } else {
        console.log(`Loaded ${profiles.length} profiles from dataset.`);
    }

    if (!structure || !structure.root) {
        console.error("Invalid structure JSON");
        return;
    }

    const analytics = { root: structure.root };
    const query = "Test Query";

    console.log("--- STARTING LOGIC TEST ---");

    // [LOGIC START]
    let clusters: any[] = [];

    // 1. Create Lookup Map for Scraped Data
    const profileMap = new Map<string, any>();
    profiles.forEach((p: any) => {
        if (p.username) profileMap.set(p.username.toLowerCase().replace('@', ''), p);
    });

    console.log(`Profile Map Size: ${profileMap.size}`);

    if (analytics && analytics.root && analytics.root.children && analytics.root.children.length > 0) {
        console.log(`[GraphGen] Using AI-defined clusters for structure...`);

        const addedNodeIds = new Set<string>();

        const processNodeRecursively = (treeNode: any, parent: any) => {
            // Generate ID
            const rawId = treeNode.data?.handle || treeNode.label || `node_${Math.random()}`;
            const nodeId = rawId.toLowerCase().replace('@', '').trim();

            // Hydrate with local data
            const scrapedProfile = profileMap.get(nodeId) || {};
            const isHydrated = !!profileMap.get(nodeId);

            // console.log(`Processing: ${nodeId} (Hydrated: ${isHydrated})`);

            // Construct Node
            const node = {
                id: nodeId,
                label: treeNode.label || nodeId,
                type: treeNode.type || (treeNode.data?.handle ? 'creator' : 'cluster'),
                val: treeNode.val || 20,
                children: [] as any[],
                data: {
                    ...treeNode.data,
                    // Hydrate fields
                    username: nodeId,
                    followers: scrapedProfile.followersCount ? scrapedProfile.followersCount.toLocaleString() : treeNode.data?.followers || '?',
                    bio: scrapedProfile.biography || treeNode.data?.bio,
                    profilePicUrl: scrapedProfile.profilePicUrl || scrapedProfile.profilePicUrlHD || treeNode.data?.profilePicUrl,
                    latestPosts: scrapedProfile.latestPosts ? scrapedProfile.latestPosts.slice(0, 3).map((post: any) => ({
                        url: post.url || post.permalink,
                        caption: post.caption || post.description,
                        imageUrl: post.displayUrl || post.mediaUrl || post.thumbnailUrl,
                        date: post.timestamp || post.date
                    })) : [],
                    sourceUrl: `https://instagram.com/${nodeId}`
                }
            };

            if (!addedNodeIds.has(nodeId)) {
                parent.children.push(node);
                addedNodeIds.add(nodeId);
            } else {
                return;
            }

            // Recurse Children
            if (treeNode.children && Array.isArray(treeNode.children)) {
                treeNode.children.forEach((child: any) => processNodeRecursively(child, node));
            }

            // Recurse Profiles (The Critical Fix)
            if (treeNode.data && treeNode.data.profiles && Array.isArray(treeNode.data.profiles)) {
                // console.log(`Found profiles in ${nodeId}: ${treeNode.data.profiles.length}`);
                treeNode.data.profiles.forEach((profile: any) => processNodeRecursively(profile, node));
            }
        };

        // Emulate Root
        const root = { children: [] as any[] };

        // Start Recursion from Root Children
        analytics.root.children.forEach((aiCluster: any) => {
            processNodeRecursively(aiCluster, root);
        });

        // Now use these populated children as our 'clusters' for later flattening
        clusters = root.children;

    } else {
        console.log("Using Fallback...");
    }

    // [LOGIC END]

    console.log("--- RESULTS ---");
    console.log(`Total Root Clusters: ${clusters.length}`);

    let totalNodes = 0;
    const traverse = (n: any) => {
        totalNodes++;
        if (n.children) n.children.forEach(traverse);
    };
    clusters.forEach(traverse);

    console.log(`Total Nodes in Graph: ${totalNodes}`);

    if (totalNodes > 10) {
        console.log("PASS: Full tree traversal successful.");
    } else {
        console.error("FAIL: Tree is too small.");
    }

    // Check hydration of a random node if any
    if (clusters.length > 0 && clusters[0].children.length > 0) {
        // Find a leaf
        let leaf = clusters[0].children[0];
        console.log("Sample Node Data:", JSON.stringify(leaf.data.username));
    }
};

runTest();
