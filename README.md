# Fandom Mapper

AI-powered social intelligence engine. Maps fandoms in 3D to uncover rising stars, subcultures, and hidden brand affinities.

## Features
- **3D Force Graph**: Interactive visualization of thousands of nodes with physics-based layout.
- **AI Analysis**: Google Gemini 3.0 Flash integration for deep inspections of content, sentiment, and provenance.
- **Smart Scraper**: Apify integration to fetch real-time Instagram/TikTok data, now with **Split-Storage** to handle massive datasets (>16MB).
- **Orchestration**: Autonomous "Wizard" that plans multi-hop scraping strategies to discover hidden connections.

## Tech Stack
- **Frontend**: React 19, Vite, Three.js (react-force-graph-3d), TailwindCSS.
- **Backend**: Node.js, Express.
- **Database**: MongoDB (Metadata + Chunked Records for scalability).
- **AI**: Google Gemini 3 Pro / 3.0 Flash.

## Setup & Run Locally

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas URI
- Apify API Token
- Google Gemini API Key

### Installation
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure Environment:
    Create `.env.local` with keys (see `.env.example`).
    ```env
    GEMINI_API_KEY=...
    APIFY_API_TOKEN=...
    MONGO_DB_CONNECT=mongodb+srv://...
    ```

### Running
- **Development** (Frontend + Backend):
    ```bash
    npm run dev
    ```
- **Backend Only**:
    ```bash
    npm run start
    ```

## Deployment (Cloud Run)
The app is containerized for Google Cloud Run.
```bash
gcloud run deploy fandom-mapper --source .
```
See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## Documentation
- **[Data Integrity](DATA_INTEGRITY.md)**: Anti-Hallucination safeguards.
- **[Provenance System](ENHANCED_PROVENANCE.md)**: AI Reasoning methodology.
- **[Performance](PERFORMANCE_OPTIMIZATION.md)**: Optimization strategies.

