
// Mock simulating the flow from Structure Miner -> Base Miner -> Gemini Context

const mockApifyItem = {
    username: "follower_user",
    full_name: "Follower Name",
    biography: "Loving life and wearing @nike everyday. #justdoit",
    followersCount: 500,
    id: "12345"
};

// 1. Structure Miner Logic (Simulated)
const structureConnection = {
    source: "target_user",
    target: mockApifyItem.username,
    type: 'follower',
    targetProfile: {
        username: mockApifyItem.username,
        biography: mockApifyItem.biography,
        followersCount: mockApifyItem.followersCount
    }
};

// 2. Base Miner Logic (Simulated)
const context: any[] = [];
const bioText = structureConnection.targetProfile.biography;
if (bioText) {
    context.push({
        username: structureConnection.target,
        caption: `User Bio: ${bioText}`,
        sourceUrl: `https://instagram.com/${structureConnection.target}`,
        role: 'community_member',
        followers: structureConnection.targetProfile.followersCount
    });
}

console.log("Context Item Created:", context[0]);

// 3. Gemini Service Logic (Simulated String Construction)
const dataContextString = context.map(item => {
    const user = item.username;
    const mediaDetails = ` [Link: ${item.sourceUrl}] Post: "${item.caption}"`;
    return `- ${user} ${mediaDetails}`;
}).join('\n');

console.log("\nFinal Context String passed to Gemini:");
console.log(dataContextString);

// Verification
const hasBio = dataContextString.includes("User Bio: Loving life and wearing @nike");
const hasLink = dataContextString.includes("https://instagram.com/follower_user");

if (hasBio && hasLink) {
    console.log("\n✅ SUCCESS: Bio content and Source URL correctly preserved for Gemini.");
} else {
    console.error("\n❌ FAILURE: Data lost during transformation.");
}
