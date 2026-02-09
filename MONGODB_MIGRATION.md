# MongoDB Migration Instructions

## What's Been Done ✅

1. **Installed Dependencies**
   - mongodb
   - mongoose
   - dotenv
   - sqlite3

2. **Created MongoDB Service** (`server/services/mongoService.ts`)
   - Full CRUD operations
   - Automatic indexing
   - Pagination support

3. **Created Migration Script** (`server/scripts/migrate-to-mongo.ts`)
   - Transfers datasets from SQLite to MongoDB
   - Batch processing for records
   - Progress tracking

4. **Updated Frontend**
   - `datasetService.ts` now supports pagination
   - `MapWizard.tsx` loads only 50 datasets at a time (prevents crash)

## Next Steps 🚀

### 1. Add MongoDB URI to .env.local

Open `.env.local` and add this line:

```
MONGODB_URI=mongodb+srv://vanillabrand_db_user:B1ffB0ff2023!@cluster0.hiotc7p.mongodb.net/?appName=Cluster0
```

(I've created `mongodb-config.txt` with this for easy copy-paste)

### 2. Run the Migration

```bash
npx ts-node server/scripts/migrate-to-mongo.ts
```

This will:
- Connect to MongoDB Atlas
- Transfer all datasets from SQLite
- Transfer all records in batches
- Show progress

### 3. Update Server to Use MongoDB

You'll need to update `server/index.js` (or create a new TypeScript server) to:
- Connect to MongoDB on startup
- Use `mongoService` instead of SQLite queries
- Add API routes for datasets with pagination

### 4. Test

1. Reload the page
2. Open Query Builder
3. Should load 50 datasets without crash
4. Everything should work normally

## Temporary Fix Applied ✅

For now, I've re-enabled `loadDatasets()` with pagination (limit: 50).
This prevents the crash while still showing recent datasets.

## Full MongoDB Migration (Optional)

If you want to fully switch to MongoDB:
1. Run the migration script
2. Update server to use MongoDB
3. Remove SQLite dependencies

Let me know if you want help with the server update!
