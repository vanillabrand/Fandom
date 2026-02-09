/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APIFY_API_TOKEN: string;
    readonly VITE_PROFILE_SCRAPE_ACTOR_INSTAGRAM: string;
    readonly VITE_PROFILE_SCRAPE_ACTOR_TIKTOK: string;
    readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
