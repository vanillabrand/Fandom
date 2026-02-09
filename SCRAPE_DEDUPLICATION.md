# Scrape Deduplication System - Complete

## ✅ What's Been Implemented

### 1. Scrape Fingerprinting Utility
**Location**: `server/utils/scrapeFingerprintUtil.ts`

**Features**:
- SHA-256 hash generation from actor name + payload
- Automatic metadata extraction (platform, target profile, data type)
- Smart TTL calculation by data type:
  - Posts: 24 hours
  - Followers: 7 days  
  - Profile data: 30 days
- Payload normalization (sorted keys for consistent hashing)

### 2. MongoDB Collection: `scrape_fingerprints`

**Schema**:
```typescript
{
  fingerprint: string,        // Unique SHA-256 hash
  actorName: string,          // e.g., "apify/instagram-scraper"
  payload: object,            // Original configuration
  payloadHash: string,        // Payload-only hash
  executedAt: Date,           // Execution timestamp
  datasetId: string,          // Result dataset reference
  recordCount: number,        // Records scraped
  metadata: {
    platform: string,
    targetProfile: string,
    dataType: string,
    tags: string[]
  },
  expiresAt: Date            // Auto-expiration
}
```

**Indexes**:
- Unique fingerprint
- Actor + platform (compound)
- Target profile
- Execution date
- TTL (automatic cleanup)

### 3. MongoService Methods

```typescript
// Check if scrape exists
getScrapeFingerprint(fingerprint: string)

// Save scrape fingerprint
saveScrapeFingerprint(data)

// Find similar scrapes
findSimilarScrapes(actorName, targetProfile, limit)

// Get statistics
getScrapeStats()
```

## 🎯 How It Works

### Before Executing a Scrape:

```typescript
import { generateScrapeFingerprint, calculateTTL } from './utils/scrapeFingerprintUtil';

// 1. Generate fingerprint
const fingerprint = generateScrapeFingerprint(actorName, payload);

// 2. Check if exists
const existing = await mongoService.getScrapeFingerprint(fingerprint);

if (existing) {
  // Check if still fresh
  const ttl = calculateTTL(existing.metadata.dataType);
  const age = (Date.now() - existing.executedAt.getTime()) / (1000 * 60 * 60);
  
  if (age <= ttl) {
    console.log('✅ Cache hit! Reusing dataset:', existing.datasetId);
    return await getDataset(existing.datasetId);
  }
}

// 3. Execute scrape (cache miss or expired)
const result = await executeApifyScrape(actorName, payload);

// 4. Save fingerprint
await mongoService.saveScrapeFingerprint({
  fingerprint,
  actorName,
  payload,
  payloadHash: generatePayloadHash(payload),
  datasetId: result.datasetId,
  recordCount: result.recordCount,
  metadata: extractMetadataFromPayload(actorName, payload),
  ttlHours: calculateTTL(dataType)
});
```

## 💰 Benefits

1. **Cost Savings**: Avoid redundant Apify calls
2. **Speed**: Instant results for cached scrapes
3. **Consistency**: Same parameters = same dataset
4. **Audit Trail**: Full history of all scrapes
5. **Smart Caching**: Different TTL per data type

## 📊 Example Savings

**Scenario**: Scraping @nike Instagram posts (500 posts)
- **First request**: Executes Apify scrape (~$0.50, 2 minutes)
- **Subsequent requests (within 24h)**: Instant, $0

**Monthly savings** (10 duplicate requests/day):
- API costs: ~$150/month saved
- Time: ~600 minutes saved

## 🔄 Integration Points

### Where to Integrate:

1. **orchestrationService.ts** - Before each scrape step
2. **apifyScraperService.ts** - Wrapper around API calls
3. **MapWizard.tsx** - Show cache status in UI

### Next Steps:

1. ✅ MongoDB collection and indexes created
2. ✅ Fingerprinting utility implemented
3. ✅ MongoService methods added
4. ⏳ **Pending**: Integrate into orchestrationService
5. ⏳ **Pending**: Add UI indicators for cache hits
6. ⏳ **Pending**: Add API endpoints for cache management

## 🧪 Testing

Once integrated, you can test with:

```typescript
// Same scrape twice
const result1 = await executeScrape('apify/instagram-scraper', { username: 'nike', resultsLimit: 100 });
const result2 = await executeScrape('apify/instagram-scraper', { username: 'nike', resultsLimit: 100 });

// result2 should be instant (cache hit)
```

## 📈 Monitoring

Check scrape statistics:
```typescript
const stats = await mongoService.getScrapeStats();
// { total: 150, byPlatform: [{ _id: 'instagram', count: 100 }, ...] }
```

## 🎯 Status

**Ready for Integration!**

All infrastructure is in place. Just need to:
1. Add check before Apify calls in orchestrationService
2. Save fingerprint after successful scrapes
3. Add UI indicators

See implementation plan for detailed integration steps.
