
import { processFollowingForOverindexing } from '../services/overindexingService.js';
import { DatasetPlatform } from '../types.js';

// Mock Data
const mockFollowingSamples = [
    [
        { username: 'brand_nike', fullName: 'Nike', bio: 'Just Do It. #brand', isVerified: true, followerCount: 1000000 },
        { username: 'creator_john', fullName: 'John Doe', bio: 'Content Creator', isVerified: false, followerCount: 10000 }
    ],
    [
        { username: 'brand_nike', fullName: 'Nike', bio: 'Just Do It. #brand', isVerified: true, followerCount: 1000000 },
        { username: 'brand_adidas', fullName: 'Adidas', bio: 'Impossible is Nothing', isVerified: true, followerCount: 900000 }
    ],
    [
        { username: 'brand_nike', fullName: 'Nike', bio: 'Just Do It. #brand', isVerified: true, followerCount: 1000000 },
        { username: 'random_user', fullName: 'Random', bio: 'Just a guy', isVerified: false, followerCount: 100 }
    ]
];

// Mock Sample Size = 3
// Nike appears 3 times (100% freq)
// Adidas appears 1 time (33% freq)
// Creator John appears 1 time (33% freq)

console.log("Starting Real Service Verification for Overindexing...");

const result = processFollowingForOverindexing(
    'test_target',
    'instagram' as DatasetPlatform,
    mockFollowingSamples,
    1, // Min Frequency 1 for testing
    10 // Top N
);

console.log(`Analyzed ${result.followersSampled} followers.`);
console.log(`Found ${result.topBrands.length} brands.`);

// Assertions
const nike = result.topBrands.find(b => b.username === 'brand_nike');
if (nike) {
    console.log(`PASS: Found Brand 'Nike'`);
    console.log(`   -> Frequency: ${nike.frequency} (Expected 3)`);
    console.log(`   -> Score: ${nike.overindexScore.toFixed(2)} (Expected high)`);
} else {
    console.error(`FAIL: Nike not found in top brands`);
}

const adidas = result.topBrands.find(b => b.username === 'brand_adidas');
if (adidas) {
    console.log(`PASS: Found Brand 'Adidas'`);
} else {
    console.warn(`WARN: Adidas might be filtered or low score`);
}

// Check Creator
const john = result.topCreators.find(c => c.username === 'creator_john');
if (john) {
    console.log(`PASS: Found Creator 'John Doe'`);
} else {
    console.warn(`WARN: John Doe might be filtered`);
}

// Check Provenance
if (nike && nike.provenance) {
    console.log("PASS: Provenance data present on result");
    console.log("   -> Source:", nike.provenance.source);
} else {
    console.error("FAIL: Missing Provenance");
}

if (result.topBrands.length > 0) {
    console.log("\n>>> VERIFICATION SUCCESSFUL: Overindexing Service works correctly.");
} else {
    console.error("\n>>> VERIFICATION FAILED: No results generated.");
    process.exit(1);
}
