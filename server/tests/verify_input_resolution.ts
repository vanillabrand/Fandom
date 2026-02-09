
import { JobOrchestrator } from '../services/jobOrchestrator.js';

// Mock private method access
const orchestrator = JobOrchestrator.getInstance() as any;

const mockPlan = {
    steps: [
        { id: 'step_1', description: 'Followers of A' },
        { id: 'step_2', description: 'Followers of B' }
    ]
};

const mockPreviousResults = [
    [{ username: 'user1' }, { username: 'common_user' }], // Step 1
    [{ username: 'user2' }, { username: 'common_user' }]  // Step 2
];

async function runTest() {
    console.log("🧪 Testing resolveInput...");

    // Scenario 1: Multiple Tokens
    const input1 = {
        usernames: ["USE_DATA_FROM_STEP_step_1", "USE_DATA_FROM_STEP_step_2"]
    };

    console.log("Test 1: Multiple Tokens");
    const result1 = orchestrator.resolveInput(input1, mockPreviousResults, mockPlan);
    const users1 = result1.usernames;

    if (users1.length === 3 && users1.includes('user1') && users1.includes('user2') && users1.includes('common_user')) {
        console.log("✅ Passed: Merged 3 unique users.");
    } else {
        console.error("❌ Failed:", users1);
    }

    // Scenario 2: Mixed Static and Token
    const input2 = {
        usernames: ["static_user", "USE_DATA_FROM_STEP_step_1"]
    };

    console.log("Test 2: Mixed Input");
    const result2 = orchestrator.resolveInput(input2, mockPreviousResults, mockPlan);
    const users2 = result2.usernames;

    if (users2.length === 3 && users2.includes('static_user') && users2.includes('user1')) {
        console.log("✅ Passed: Merged static and dynamic users.");
    } else {
        console.error("❌ Failed:", users2);
    }
}

runTest();
