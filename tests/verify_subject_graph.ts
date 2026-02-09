
import { transformToSubjectGraph } from '../services/graphService.js';
import { Dataset } from '../types.js';

/**
 * Verification Script for Subject Matter Graph
 * Simulates a dataset with AI-extracted topics and asserts the graph output.
 */

const mockDataset: Dataset = {
    id: 'test_ds',
    name: 'Topic Test',
    platform: 'instagram',
    targetProfile: 'test_query',
    dataType: 'posts',
    recordCount: 10,
    data: [
        {
            username: 'creator_john',
            fullName: 'John Doe',
            followersCount: 5000,
            recordType: 'profile'
        }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    autoTags: [],
    queriesUsedFor: [],
    sources: [],
    metadata: {
        sourceActor: 'mock',
        scrapeTimestamp: new Date(),
        scrapeParams: {},
        estimatedCompleteness: 100
    },
    analytics: {
        targetProfile: 'test_query',
        platform: 'instagram',
        followersSampled: 10,
        followingAnalyzed: 100,
        calculatedAt: new Date(),
        topCreators: [],
        topBrands: [],
        topMedia: [],
        clusters: [],
        topContent: [],
        nonRelatedInterests: [],
        visualAnalysis: {
            aestheticTags: [],
            vibeDescription: "",
            colorPalette: [],
            // MOCKING THE AI MATCHES (What Gemini would return)
            // @ts-ignore
            matches: [
                { matchedContent: "Dune 2", category: "Movie", sentiment: 0.8 },
                { matchedContent: "Dune 2", category: "Movie", sentiment: 0.9, username: "creator_john" }, // Evidence!
                { matchedContent: "Sandworms", category: "Character", sentiment: 0.5 },
                { matchedContent: "Paul Atreides", category: "Character", sentiment: 0.1 },
                { matchedContent: "Hans Zimmer", category: "Music", sentiment: 0.95 }
            ]
        }
    }
};

function runVerification() {
    console.log("Starting Subject Matter Graph Verification...");

    // Execute Transformation
    const graph = transformToSubjectGraph(mockDataset);

    // Assertions
    console.log(`Generated ${graph.nodes.length} nodes and ${graph.links.length} links.`);

    const duneNode = graph.nodes.find(n => n.label === "Dune 2");
    if (duneNode) {
        console.log("PASS: Found Topic Node 'Dune 2'");
        console.log(`   -> Val (Size): ${duneNode.val} (Expected > 20)`);
        console.log(`   -> Sentiment: ${duneNode.sentiment} (Expected ~0.85)`);
    } else {
        console.error("FAIL: Missing Topic Node 'Dune 2'");
        console.log("DEBUG: Generated Nodes:", JSON.stringify(graph.nodes, null, 2));
    }

    const musicNode = graph.nodes.find(n => n.label === "Hans Zimmer");
    if (musicNode) {
        console.log("PASS: Found Topic Node 'Hans Zimmer'");
    } else {
        console.error("FAIL: Missing Topic Node 'Hans Zimmer'");
    }

    // Check for Main Node
    const main = graph.nodes.find(n => n.id === "MAIN");
    if (main) {
        console.log("PASS: Found MAIN Hub Node");
    } else {
        console.error("FAIL: Missing MAIN Node");
    }

    // Check Links
    const linkToDune = graph.links.find(l => l.target === duneNode?.id && l.source === main?.id);
    if (linkToDune) {
        console.log("PASS: Found Link MAIN -> Dune 2");
    } else {
        console.error("FAIL: Missing Link to Dune 2 from MAIN");
    }

    // Check Evidence Link (User -> Topic)
    const userNode = graph.nodes.find(n => n.id === "user_creator_john");
    if (userNode) {
        console.log("PASS: Found Evidence Creator Node 'John Doe'");
        const linkUserToDune = graph.links.find(l => l.source === userNode.id && l.target === duneNode?.id);
        if (linkUserToDune) {
            console.log("PASS: Found Evidence Link: John Doe -> Dune 2");
        } else {
            console.error("FAIL: Missing Link from John Doe to Dune 2");
        }
    } else {
        console.error("FAIL: Missing Evidence Creator Node");
    }

    if (duneNode && musicNode && main && userNode) {
        console.log("\n>>> VERIFICATION SUCCESSFUL: Subject Matter Identity Confirmed.");
    } else {
        console.error("\n>>> VERIFICATION FAILED.");
        process.exit(1);
    }
}

runVerification();
