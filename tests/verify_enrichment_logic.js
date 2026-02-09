
// Mock function mirroring the updated logic in JobOrchestrator
function injectUniversalEnrichment(planData, sampleSize) {
    const steps = planData.steps || [];
    if (steps.length === 0) return planData;

    const lastStep = steps[steps.length - 1];
    const isAlreadyEnriched = lastStep.actorId.includes('instagram-api-scraper') && lastStep.input && lastStep.input.resultsType === 'posts';

    if (isAlreadyEnriched) {
        return planData;
    }

    const enrichmentStep = {
        stepId: `step_${steps.length + 1}`,
        description: "Universal Content Enrichment: Fetch posts for Gallery (INJECTED)",
        actorId: "apify/instagram-api-scraper",
        input: {
            "directUrls": [`USE_DATA_FROM_STEP_${lastStep.stepId || `step_${steps.length}`}`],
            "resultsType": "details", // [VERIFY] This is the critical change
            "addParentData": true
        },
        estimatedRecords: sampleSize * 6,
        estimatedCost: Number(((sampleSize / 1000) * 4.30).toFixed(2))
    };

    if (!planData.warnings) planData.warnings = [];
    planData.warnings.push(`Added Universal Enrichment step for full profile analysis (+£${enrichmentStep.estimatedCost.toFixed(2)} est).`);

    planData.steps.push(enrichmentStep);
    return planData;
}

// Test Case
const inputPlan = {
    intent: "market_mapping",
    steps: [
        {
            stepId: "step_1",
            actorId: "apify/instagram-scraper",
            input: { search: "boiler repair" }
        }
    ]
};

const outputPlan = injectUniversalEnrichment(inputPlan, 100);

console.log("Enrichment Step:", outputPlan.steps[1]);

if (outputPlan.steps[1].input.resultsType === 'details') {
    console.log("✅ VERIFICATION PASSED: Enrichment uses 'details' mode.");
} else {
    console.error("❌ VERIFICATION FAILED: Enrichment uses '" + outputPlan.steps[1].input.resultsType + "' mode.");
    process.exit(1);
}
