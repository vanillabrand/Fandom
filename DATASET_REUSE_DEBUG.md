# Dataset Reuse Debugging ✅

## Problem
System is not reusing existing scrapes from MongoDB when running the same query twice, causing unnecessary API costs.

## Investigation

### What I Found:
1. ✅ `getAllDatasets()` IS fetching from MongoDB (via `/api/datasets`)
2. ✅ Datasets ARE being passed to `analyzeMapRequirements()`
3. ❓ Gemini is not recognizing them as matching the query

### Root Cause (Suspected):
Gemini's matching logic may be too strict or the dataset context format isn't clear enough for it to recognize matches.

## Changes Made

### Added Detailed Logging
**File**: `services/orchestrationService.ts`

```typescript
// Now logs:
console.log(`[Dataset Reuse] Checking ${effectiveDatasets.length} existing datasets for query: "${query}"`);
console.log(`[Dataset Reuse] Available datasets:`, effectiveDatasets.map(d => ({
    id: d.id,
    name: d.name,
    target: d.targetProfile,
    type: d.dataType,
    records: d.recordCount
})));
```

### Improved Dataset Context
Added creation date to help Gemini understand dataset freshness:
```
- ID: abc123
  Name: "irnbru Followers"
  Platform: instagram
  Target: irnbru
  Type: profiles
  Records: 100
  Created: 12/26/2024  ← NEW
  Tags: followers
```

## Next Steps to Debug

### When you run the query again, check the console for:

1. **Dataset Availability**:
```
[Dataset Reuse] Checking 5 existing datasets for query: "what are followers of @irnbru into?"
[Dataset Reuse] Available datasets: [
  { id: "...", name: "irnbru Followers", target: "irnbru", type: "profiles", records: 100 },
  { id: "...", name: "irnbru Posts", target: "irnbru", type: "posts", records: 2000 }
]
```

2. **Gemini's Decision**:
```
✅ REUSING 2 existing dataset(s): ["abc123", "def456"]
💰 COST SAVED: Skipping 2 scrape steps
```

OR

```
⚠️ NO DATASETS REUSED - Planning 2 new scrape(s)
Reasoning: <Gemini's explanation>
```

## Possible Issues & Solutions

### Issue 1: Gemini Not Matching
**Symptoms**: Datasets exist but Gemini says "NO DATASETS REUSED"

**Solution**: The prompt tells Gemini to match based on:
- Target profile (e.g., "irnbru")
- Data type (e.g., "profiles", "posts")
- Query intent

If Gemini is being too conservative, we may need to:
1. Strengthen the matching examples in the prompt
2. Add explicit matching rules
3. Implement client-side matching as a fallback

### Issue 2: Dataset Type Mismatch
**Symptoms**: Query asks for "topics" but only "profiles" dataset exists

**Solution**: This is correct behavior - Gemini should scrape posts to get topics. However, if posts dataset exists, it should reuse that.

### Issue 3: Freshness Requirement
**Symptoms**: Gemini says data is "stale" or user wants "latest"

**Solution**: Check if query contains words like "latest", "fresh", "current", "today's" - these trigger new scrapes.

## Testing

Run this query twice:
```
"what are followers of @irnbru into?"
```

**First run**: Should scrape (no existing data)
**Second run**: Should reuse datasets from first run

Check console logs to see:
1. How many datasets are available
2. What Gemini's reasoning is
3. Whether datasets are being reused

## Status

✅ Added logging to debug dataset reuse
✅ Improved dataset context format
⏳ Waiting for user to test and report console output
