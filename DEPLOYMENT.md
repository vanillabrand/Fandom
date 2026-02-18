# Deployment Guide: Google Cloud Run

This guide details the requirements, configuration, and steps to deploy the **Fandom Mapper** application to Google Cloud Run.

## 1. Prerequisites

Before deploying, ensure you have the following:

### Google Cloud Platform (GCP)
- **GCP Project**: An active Google Cloud Project (e.g., `huntsocial-fandom-analytics`).
- **Billing Enabled**: Cloud Run and Cloud Build require an enabled billing account.
- **Enabled APIs**:
  - Cloud Run Admin API
  - Cloud Build API
  - Artifact Registry API
  - Container Registry API

### Local Tools
- **Google Cloud SDK (`gcloud`)**: Installed and initialized.
  - [Install Guide](https://cloud.google.com/sdk/docs/install)
  - Run `gcloud auth login` and `gcloud config set project [PROJECT_ID]`.
- **Node.js**: v18+ (for local testing).
- **Docker**: (Optional) For testing the container build locally.

---

## 2. Configuration

### Environment Variables (`env_cloudrun.yaml`)
The application relies on a comprehensive set of environment variables defined in `env_cloudrun.yaml`.
**Critical Variables** include:
- `GEMINI_API_KEY`: AI Analysis.
- `APIFY_API_TOKEN`: Scraping.
- `MONGO_DB_CONNECT`: Database connection constraint.
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`: Payments.
- `JWT_SECRET`: Authentication security.
- `Example`:
  ```yaml
  GEMINI_API_KEY: "AIzaSy..."
  APIFY_API_TOKEN: "apify_api_..."
  MONGO_DB_CONNECT: "mongodb+srv://..."
  AI_TEMPERATURE: "0.3"
  ```

### Dockerfile
The project uses a standard `Dockerfile` located in the root directory:
- **Base Image**: `node:20`
- **Port**: `8080` (Cloud Run default)
- **Build Step**: Runs `npm run build` and `npm run build:server`.
- **Start Command**: `npm start`.

---

## 3. Deployment Steps

### Step 1: Prepare the Environment File
Ensure `env_cloudrun.yaml` is present in the root directory and contains active, production-ready keys.

### Step 2: Deploy to Cloud Run
Run the following command from the project root:

```powershell
gcloud run deploy fandom-mapper-ph1 `
  --source . `
  --region europe-west2 `
  --allow-unauthenticated `
  --env-vars-file .\env_cloudrun.yaml
```

**Explanation of Flags**:
- `--source .`: Uploads the current directory to Cloud Build to create the container image.
- `--region europe-west2`: Deploys to the London region (adjust if needed).
- `--allow-unauthenticated`: Makes the service publicly accessible via HTTPS.
- `--env-vars-file .\env_cloudrun.yaml`: Injects the variables from the YAML file into the container environment.

### Step 3: Verify Deployment
Once the command completes, it will output the **Service URL**:
`Service URL: https://fandom-mapper-ph1-.......run.app`

Open this URL in your browser to verify the application is running.

---

## 4. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Build Failed** | Dockerfile error or dependency issue | Check the "Logs are available at..." URL in the console output. Look for "Step #..." errors in Cloud Build. |
| **403 Forbidden** | IAM Permissions | Ensure `--allow-unauthenticated` was passed. Or check "Cloud Run Invoker" role for "allUsers" in GCP Console. |
| **503 Service Unavailable** | Server crash or Port mismatch | Check "Logs" tab in Cloud Run Console. Ensure `PORT` env var is not manually set to something other than 8080 (Cloud Run injects PORT=8080). |
| **Database Connection Error** | IP Whitelist | Ensure "Allow access from anywhere" (0.0.0.0/0) is enabled in MongoDB Atlas Network Access, as Cloud Run IPs are dynamic. |
| **CORS Errors** | Frontend URL mismatch | Update `VITE_API_URL` or `SCRAPER_URL` in `env_cloudrun.yaml` if they point to localhost. |

## 5. Local Testing (Docker)

To test the *exact* container that will be deployed:

1. **Build**:
   ```bash
   docker build -t fandom-mapper .
   ```
2. **Run** (injecting env vars):
   ```bash
   docker run -p 8080:8080 --env-file env_cloudrun.yaml fandom-mapper
   ```
3. **Access**: http://localhost:8080
