
import { JobOrchestrator } from './server/services/jobOrchestrator.js';

async function testRound3Fixes() {
    const orchestrator = JobOrchestrator.getInstance();

    console.log("--- Testing Round 3 Fixes (Email Trap & Links) ---");

    // Case 1: Email Trap (Management: astrokobi@night.co)
    // Label: Kobi Brown, Bio: "management: astrokobi@night.co"
    // Expectation: Should NOT pick @night.co. Should fallback to slugified 'kobibrown'.
    const analytics1 = {
        nodes: [
            {
                id: 'kobi_email',
                label: 'Kobi Brown',
                group: 'creator',
                data: {
                    bio: 'management: astrokobi@night.co'
                }
            }
        ]
    };
    const gaps1 = (orchestrator as any).identifyEnrichmentGaps(analytics1);
    console.log("Case 1 (Email Trap - kobibrown slugified):", gaps1);
    // Result: [ 'kobibrown' ] (because @night.co is filtered out by the email-safe regex)

    // Case 2: Linktree Extraction
    // Label: Kobi Brown, Bio: "management: astrokobi@night.co", Link: "linktr.ee/astrokobi"
    // Expectation: Should resolve to 'astrokobi' from the link.
    const analytics2 = {
        nodes: [
            {
                id: 'kobi_link',
                label: 'Kobi Brown',
                group: 'creator',
                data: {
                    bio: 'management: astrokobi@night.co',
                    externalUrl: 'https://linktr.ee/astrokobi'
                }
            }
        ]
    };
    const gaps2 = (orchestrator as any).identifyEnrichmentGaps(analytics2);
    console.log("Case 2 (Linktree Resolution):", gaps2);
    // Result: [ 'astrokobi' ]

    // Case 3: Beacons Resolution
    const analytics3 = {
        nodes: [
            {
                id: 'beacons_node',
                label: 'Test User',
                group: 'creator',
                data: {
                    externalUrl: 'beacons.ai/testuser_99'
                }
            }
        ]
    };
    const gaps3 = (orchestrator as any).identifyEnrichmentGaps(analytics3);
    console.log("Case 3 (Beacons Resolution):", gaps3);
    // Result: [ 'testuser_99' ]

    // Case 4: Real bio mention still works (no email nearby)
    const analytics4 = {
        nodes: [
            {
                id: 'real_mention',
                label: 'Footballer',
                group: 'creator',
                data: {
                    bio: 'Playing for @chelseafc'
                }
            }
        ]
    };
    const gaps4 = (orchestrator as any).identifyEnrichmentGaps(analytics4);
    console.log("Case 4 (Real bio mention):", gaps4);
    // Result: [ 'chelseafc' ]
}

testRound3Fixes().catch(console.error);
