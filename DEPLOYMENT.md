# Deployment Guide: Google Cloud Run & Apify Proxy

## Overview
This application is designed to run on Google Cloud Run as a containerized service. It uses a custom **Server-Side Proxy** (`/apify-api`) to handle authentication with the Apify API securely, ensuring that API tokens are never exposed to the client browser.

## Architecture
- **Frontend**: Vite SPA (Single Page Application)
- **Backend**: Express.js server (serves specific API routes + static frontend)
- **Database**: MongoDB (Atlas)
- **External APIs**: Gemini (Google), Apify (Scraping)

## Environment Variables
The application relies on runtime environment variables.

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API Key for AI Analysis | Yes |
| `APIFY_API_TOKEN` | Apify API Token for Scraping | Yes |
| `MONGO_DB_CONNECT`| MongoDB Connection String | Yes |
| `PORT` | Server Port (Automatically set by Cloud Run) | Yes (Default 3001) |

### **Important: Runtime Injection**
Since the frontend is built statically (`vite build`), it cannot access server-side environment variables directly.
We solve this via **Runtime Injection** in `server/index.js`:
1. The Express server intercepts requests to `index.html`.
2. It reads the `GEMINI_API_KEY` and `APIFY_API_TOKEN` from the server's `process.env`.
3. It injects them into a global `window.__ENV__` object in the HTML `<head>`.
4. The client (`geminiService.ts`, `orchestrationService.ts`) reads from `window.__ENV__`.

## Apify Proxy (`/apify-api`)
To prevent CORS errors and protect the Apify Token, the client **does NOT** call Apify directly.
Instead, it calls the internal proxy:
1. **Client**: `fetch('/apify-api/v2/acts/...')` (No Token attached)
2. **Server**: Middleware in `server/index.js`:
   - Intercepts requests to `/apify-api`
   - Attaches `Authorization: Bearer <APIFY_API_TOKEN>` header
   - Proxies request to `https://api.apify.com`
3. **Result**: Secure, CORS-free scraping.

## Deployment Command
Deploy to Cloud Run using `gcloud`:

```bash
gcloud run deploy fandom-mapper-ph1 \
  --source . \
  --region europe-west2 \
  --allow-unauthenticated \
  --env-vars-file env.yaml
```

**Note**: Ensure `env.yaml` is populated with valid production keys before deploying.
