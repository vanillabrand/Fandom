# Profile Follower Count Caching - Implementation Summary

## ✅ What's Been Implemented

### 1. MongoDB Profile Cache Collection
- **Location**: `server/services/mongoService.ts`
- **Features**:
  - Stores username, platform, follower count, and cache timestamp
  - Automatic 7-day TTL (Time To Live) via MongoDB index
  - Compound unique index on username + platform
  - Auto-expiration after 7 days

### 2. Cache Methods in MongoService
```typescript
// Get cached follower count (returns null if expired or not found)
getProfileCache(username: string, platform: string)

// Set/update cached follower count
setProfileCache(username: string, platform: string, followers: number)

// Manually clear expired cache entries
clearExpiredProfileCache()
```

### 3. Frontend Profile Cache Service
- **Location**: `services/profileCacheService.ts`
- **Functions**:
  ```typescript
  // Check cache before API call
  getCachedFollowerCount(username, platform)
  
  // Save to cache after API call
  cacheFollowerCount(username, platform, followers)
  
  // Wrapper function - checks cache, then fetches if needed
  getFollowerCountWithCache(username, platform, fetchFn)
  ```

## 📝 How To Use

### Example: Fetching Follower Count with Cache

```typescript
import { getFollowerCountWithCache } from '../services/profileCacheService';
import { fetchFollowerCount } from '../services/apifyScraperService';

// Instead of calling fetchFollowerCount directly:
const followers = await fetchFollowerCount(username, platform);

// Use the cached version:
const followers = await getFollowerCountWithCache(
    username,
    platform,
    () => fetchFollowerCount(username, platform)
);
```

**Benefits:**
- First call: Fetches from Apify API and caches result
- Subsequent calls (within 7 days): Returns cached value instantly
- After 7 days: Automatically fetches fresh data and updates cache

## 🔄 Integration Points

### Where to Integrate (When Re-enabling Username Detection)

**MapWizard.tsx** - Line ~98-113 (currently disabled):
```typescript
// BEFORE (without cache):
const count = await fetchFollowerCount(username, platform);

// AFTER (with cache):
import { getFollowerCountWithCache } from '../services/profileCacheService';

const count = await getFollowerCountWithCache(
    username,
    platform,
    () => fetchFollowerCount(username, platform)
);
```

### API Endpoints Needed (Backend)

You'll need to add these endpoints to your server:

```typescript
// GET /api/profile-cache/:platform/:username
// Returns: { followers: number, cachedAt: Date } or 404

// POST /api/profile-cache
// Body: { username, platform, followers }
// Returns: 200 OK
```

## 🎯 Benefits

1. **Reduced API Costs**: No redundant Apify calls for same profile within 7 days
2. **Faster Response**: Cached results return instantly
3. **Automatic Cleanup**: MongoDB TTL index auto-deletes expired entries
4. **Smart Caching**: Only caches successful API responses

## ⚠️ Current Status

- ✅ MongoDB collection and indexes created
- ✅ mongoService methods implemented
- ✅ Frontend service created
- ⏳ **Pending**: Backend API endpoints (need to connect to MongoDB)
- ⏳ **Pending**: Integration into MapWizard (when username detection re-enabled)

## 🚀 Next Steps

1. **Add MongoDB connection to backend server**
2. **Create API endpoints** for profile cache
3. **Re-enable username detection** in MapWizard
4. **Replace `fetchFollowerCount` calls** with `getFollowerCountWithCache`

## 📊 Cache Statistics

To monitor cache performance, you can add:
```typescript
// Get cache hit rate
const totalProfiles = await db.collection('profile_cache').countDocuments();
console.log(`Cached profiles: ${totalProfiles}`);
```
