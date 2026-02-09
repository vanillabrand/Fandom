
import { JobOrchestrator } from '../server/services/jobOrchestrator.js';
import { generateDashboardConfig } from '../server/services/dashboardConfigService.js';

// Mock Data
const mockPlan = {
    intent: 'sentiment_analysis',
    steps: []
};

const mockResults = [
    [ // Posts
        {
            caption: "I absolutely love this product! It's the best thing ever.",
            likesCount: 100,
            commentsCount: 10,
            url: "http://instagr.am/p/1"
        },
        {
            caption: "Worst experience ever. I hate it. Terrible service.",
            likesCount: 50,
            commentsCount: 5,
            url: "http://instagr.am/p/2"
        },
        {
            caption: "It's okay, not great but not bad.",
            likesCount: 20,
            commentsCount: 2,
            url: "http://instagr.am/p/3"
        }
    ],
    [ // Comments (Optional)
        { text: "Amazing quality! Fan for life.", likesCount: 5 },
        { text: "So disappointed. Trash.", likesCount: 2 },
        { text: "Great quality", likesCount: 1 },
        { text: "Quality is amazing", likesCount: 1 },
        { text: "Trash quality", likesCount: 1 }
    ]
];

async function runTest() {
    console.log("🧪 Testing Sentiment Analysis Graph Generation...");

    // 1. Test Graph Generation
    const orchestrator = (JobOrchestrator as any).getInstance(); // Access private instance

    // We need to access the private method. reliable way in TS without suppressing is tricky, 
    // but for this script we can cast to any.
    try {
        console.log("Generating graph...");
        const graphData = orchestrator['generateSentimentGraph'](mockPlan, mockResults, "Sentiment of @brand");

        console.log("Graph Structure:");
        console.log(`- Nodes: ${graphData.nodes.length}`);
        console.log(`- Links: ${graphData.links.length}`);
        console.log("Analytics Output:", JSON.stringify(graphData.analytics.sentimentAnalysis, null, 2));

        // Validation
        const sentiment = graphData.analytics.sentimentAnalysis;

        // "love", "best", "amazing", "fan" = 4 positives
        // "worst", "hate", "terrible", "disappointed", "trash" = 5 negatives 
        // Note: simple regex split might vary, but let's check directionality.
        // Actually, let's trace:
        // Item 1: "love" (+1), "best" (+1) -> Score +2
        // Item 2: "worst" (-1), "hate" (-1), "terrible" (-1) -> Score -3
        // Item 3: "not bad" -> "bad" (-1) -> Score -1 (naïve tokenizer splits "not bad")
        // Comment 1: "Amazing" (+1), "Fan" (+1) -> Score +2
        // Comment 2: "disappointed" (-1), "Trash" (-1) -> Score -2

        // Total Positive count approx 4-5?
        // Total Negative count approx 5?

        // This is just a sanity check that it runs and produces stats.
        if (graphData.nodes.length > 0 && sentiment.total_analyzed > 0) {
            console.log("✅ Graph Generation Passed");
        } else {
            console.error("❌ Graph Generation Failed (Empty result)");
            process.exit(1);
        }

        // 2. Test Dashboard Config
        console.log("\n🧪 Testing Dashboard Configuration...");
        const dashboard = generateDashboardConfig("Sentiment of @brand", "sentiment_analysis", graphData.analytics);

        const hasThemeWidget = dashboard.widgets.some(w => w.id === 'sentiment_themes');
        const hasEmotionGallery = dashboard.widgets.some(w => w.id === 'emotion_gallery');

        if (hasThemeWidget && hasEmotionGallery) {
            console.log("✅ Dashboard Config Passed");
        } else {
            console.error("❌ Dashboard Config Failed (Missing widgets)");
            console.log("Widgets found:", dashboard.widgets.map(w => w.id));
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Test Failed with Exception:", e);
        process.exit(1);
    }
}

runTest();
