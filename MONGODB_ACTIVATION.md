# MongoDB Backend - Activation Instructions

## ✅ What's Been Done

1. **MongoDB Service** - Full CRUD operations with caching
2. **API Routes** - MongoDB endpoints for datasets, records, analytics, profile cache
3. **Server Update** - Auto-connects to MongoDB on startup
4. **Profile Cache** - 7-day follower count caching
5. **Migration Script** - Ready to transfer SQLite data

## 🚀 How to Activate

### Step 1: Add MongoDB URI to .env.local

The MongoDB URI is already in `mongodb-config.txt`. Copy this line to your `.env.local` file:

```
MONGODB_URI=mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0
```

### Step 2: Restart the Server

Stop the current server (Ctrl+C) and restart:

```bash
npm run dev
```

You should see:
```
🔌 Connecting to MongoDB...
✅ MongoDB connected successfully
📊 Using MongoDB for datasets, records, and cache
```

### Step 3: (Optional) Migrate Existing Data

If you have existing SQLite data to migrate:

```bash
npm run migrate
```

This will transfer all datasets and records from SQLite to MongoDB.

## 📊 What Works Now

### Profile Cache
- Follower counts cached for 7 days
- Automatic expiration
- No redundant API calls

### Datasets
- Pagination (50 per page)
- Fast queries with indexes
- No browser crashes

### API Endpoints
- `GET /api/profile-cache/:platform/:username` - Get cached follower count
- `POST /api/profile-cache` - Cache follower count
- `GET /api/datasets?limit=50&skip=0` - Get datasets with pagination
- `GET /api/datasets/:id` - Get single dataset
- `POST /api/datasets` - Create/update dataset
- `DELETE /api/datasets/:id` - Delete dataset
- `GET /api/datasets/:id/records` - Get records
- `POST /api/datasets/:id/records` - Add records

## 🧪 Testing

1. **Check MongoDB Connection**:
   ```
   http://localhost:3001/health
   ```
   Should show: `"mongodb": true`

2. **Test Profile Cache**:
   - Open Query Builder
   - Type a username
   - Check console for "Cache hit" or "Cache miss"

3. **Test Datasets**:
   - Open Query Builder
   - Should load 50 datasets without crash

## ⚠️ Fallback

If MongoDB fails to connect:
- Server automatically falls back to SQLite
- All existing functionality still works
- Check console for error messages

## 📝 Next Steps

To fully activate profile caching in MapWizard:
1. Re-enable username detection (currently disabled)
2. Update to use `getFollowerCountWithCache()`
3. See `PROFILE_CACHE.md` for details
