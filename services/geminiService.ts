import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { FandomData, Node, Link, OverindexingResult } from "../types.js";

import { UniversalShortcodeRegistry } from '../utils/ShortcodeRegistry.js';
import { safeParseJson } from '../utils/jsonUtils.js';
import { addTransaction } from "./transactionService.js";
import { notify } from "../utils/notifications.js";

// Helper to get API key from runtime (window) or build time (process.env)
const getApiKey = () => {
  if (typeof window !== 'undefined' && (window as any).__ENV__?.GEMINI_API_KEY) {
    return (window as any).__ENV__.GEMINI_API_KEY;
  }
  return process.env.API_KEY || process.env.GEMINI_API_KEY;
};

// Lazy initialization for GoogleGenAI client
// This prevents "API Key not found" errors during module load time (before window.__ENV__ is ready)
let aiClient: GoogleGenAI | null = null;
const getAiClient = () => {
  if (!aiClient) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("Google Gemini API Key is missing. Please check your environment configuration.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

// [NEW] Visual Theme Prompt Component
// [NEW] Visual Theme Prompt Component
// [REMOVED] VISUAL_THEME_PROMPT

export const getFollowerCount = async (platform: string, profile: string): Promise<number> => {
  const model = "gemini-3-flash-preview";
  const siteQuery = platform === 'tiktok' ? 'site:tiktok.com' : 'site:instagram.com';
  const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram';

  const prompt = `
    Task: Verify the existence and find the exact follower count for the ${platformName} handle "${profile}".
    
    CRITICAL VERIFICATION:
    1. Search query: "${siteQuery} ${profile}".
    2. Look at the specific handle in the search result (e.g. @username).
    3. IF the handle found is DIFFERENT from "${profile}" (ignoring case), then return -1.
       - Example: Input "underarmourfc". Search finds "Under Armour (@underarmour)". Result: -1 (Mismatch).
       - Example: Input "underarmourfc". Search finds "Under Armour FC (@underarmourfc)". Result: Match.
    
    Actions:
    1. If handle matches, extract the follower count.
    2. Convert 'M' (millions) or 'K' (thousands) to integers.
    
    Output:
    Return STRICTLY a JSON object.
    
    \`\`\`json
    {
      "count": 123456
    }
    \`\`\`
    
    If handle mismatch or not found, return count: -1.
  `;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0, // Zero temperature for maximum determinism and factual responses
      }
    });

    if (response.text) {
      let cleanText = response.text.trim();
      cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();

      try {
        const data = JSON.parse(cleanText);
        return typeof data.count === 'number' ? data.count : -1;
      } catch (e) {
        console.warn("JSON Parse failed for follower count, attempting regex fallback.", e);
        if (cleanText.includes("-1")) return -1;

        const jsonMatch = cleanText.match(/"count":\s*(-?\d+)/);
        if (jsonMatch && jsonMatch[1]) {
          return parseInt(jsonMatch[1], 10);
        }
        return -1;
      }
    }
    return -1;
  } catch (error) {
    console.error("Error fetching follower count:", error);
    return -1;
  }
};

// Fetch profile image using Apify
export const getProfileImage = async (platform: 'instagram' | 'tiktok', profile: string): Promise<{ profilePicUrl: string | null; fullName: string | null }> => {
  const APIFY_API_TOKEN = (typeof window !== 'undefined' && (window as any).__ENV__?.APIFY_API_TOKEN)
    ? (window as any).__ENV__.APIFY_API_TOKEN
    : (import.meta as any).env.VITE_APIFY_API_TOKEN;
  // Use standard Actor IDs that match the rest of the codebase
  const ACTOR_ID = platform === 'instagram'
    ? 'apify/instagram-profile-scraper'
    : 'microworlds/tiktok-profile-scraper';

  console.log('Apify credentials check:', {
    hasToken: !!APIFY_API_TOKEN,
    actorId: ACTOR_ID,
    platform,
    profile
  });

  if (!APIFY_API_TOKEN || !ACTOR_ID) {
    console.warn('Apify credentials not configured');
    return { profilePicUrl: null, fullName: null };
  }

  try {
    // Convert actor ID for URL (apify/actor -> apify~actor)
    const safeActorId = ACTOR_ID.replace('/', '~');

    // Start the actor run
    const response = await fetch(`/apify-api/v2/acts/${safeActorId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_API_TOKEN}`
      },
      body: JSON.stringify({
        usernames: [profile]
      })
    });

    console.log('Apify API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Apify API error: ${errorText}`);
      return { profilePicUrl: null, fullName: null };
    }

    const runData = await response.json();
    const runId = runData.data.id;

    // Poll for completion (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`/apify-api/v2/actor-runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${APIFY_API_TOKEN}`
        }
      });

      const statusData = await statusResponse.json();

      if (statusData.data.status === 'SUCCEEDED') {
        // Fetch the dataset
        const datasetId = statusData.data.defaultDatasetId;
        const datasetResponse = await fetch(`/apify-api/v2/datasets/${datasetId}/items`, {
          headers: {
            'Authorization': `Bearer ${APIFY_API_TOKEN}`
          }
        });

        const items = await datasetResponse.json();

        if (Array.isArray(items) && items.length > 0) {
          const profileData = items[0];
          return {
            profilePicUrl: profileData.profilePicUrl || profileData.profile_pic_url || null,
            fullName: profileData.fullName || profileData.full_name || null
          };
        }
        break;
      } else if (statusData.data.status === 'FAILED' || statusData.data.status === 'ABORTED') {
        console.error('Apify run failed:', statusData.data.status);
        break;
      }

      attempts++;
    }

    return { profilePicUrl: null, fullName: null };
  } catch (error) {
    console.error('Error fetching profile image from Apify:', error);
    return { profilePicUrl: null, fullName: null };
  }
}

export const fetchFandomAnalysis = async (profile: string, platform: 'instagram' | 'tiktok', sampleSize: number): Promise<FandomData> => {

  // 4. Paywall Check (Deduct Credits)
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('AUTH_TOKEN');
    // Only enforce if token is present, acting as a soft gate for now, or hard gate if strict
    // Since this is a core feature, we should probably enforce it.
    if (token) {
      try {
        const res = await fetch('/api/credits/deduct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ amount: 50, reason: `Analysis for ${profile}` })
        });

        if (!res.ok) {
          const err = await res.json();
          console.error("Paywall Check Failed:", err);
          throw new Error(`Insufficient credits. Required: ${err.required}, Current: ${err.current}`);
        }
      } catch (e: any) {
        // Re-throw checks to surface UI error
        throw e;
      }
    }
  }

  const model = "gemini-3-flash-preview";
  const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram';
  const platformSite = platform === 'tiktok' ? 'site:tiktok.com' : 'site:instagram.com';

  const prompt = `
    Perform a REAL-TIME, DEEP-DIVE social intelligence analysis for the ${platformName} profile "${profile}" using Google Search.
    
    **STRATEGY: THE 'RISING STAR' & 'HIDDEN GEM' PROTOCOL**
    **CONSTRAINT**: Please use Google Search to retrieve the latest information. Focus analysis strictly on the ${platformName} ecosystem. Use queries like "${platformSite}" to validate handles.
    
    We are NOT looking for obvious, global superstars (e.g., exclude Cristiano Ronaldo, Beyoncé, or Official Brand Ambassadors).
    We ARE looking for the **"Rising up from the bottom"** signals—creators, brands, and trends that are bubbling up within the dedicated community but haven't hit the mainstream yet.
    
    **CONTEXT**: Analysing ${sampleSize} followers of the ${platformName} profile ${profile}
    **LANGUAGE**: UK English spelling (colour, analyse).

    **RESEARCH QUERY STRATEGY (Execute these implicitly):**
    1. "Fastest growing micro-influencers followed by ${profile} ${platformName} fans".
    2. "Underrated ${platformName} creators in the ${profile} niche".
    3. "Niche brands with cult followings similar to ${profile}".
    4. "Emerging subcultures and aesthetics in ${profile} ${platformName} community this year".

    **🚨 CRITICAL: MANDATORY PROVENANCE & EVIDENCE FOR EVERY ITEM 🚨**
    
    **ABSOLUTE REQUIREMENT**: For EVERY SINGLE creator, brand, cluster, topic, and subtopic you identify, you MUST provide ALL FOUR of these fields:
    
    1. **citation** (REQUIRED): Explain EXACTLY how you found this item. Be specific about the search query or source.
       - ✅ GOOD: "Found via Google Search: 'rising Scottish comedy creators Instagram 2025'"
       - ❌ BAD: "Found via search" (too vague)
       - ❌ UNACCEPTABLE: Missing this field
    
    2. **searchQuery** (REQUIRED): The EXACT search query you used to discover this item.
       - ✅ GOOD: "site:instagram.com Scottish comedy micro-influencers 50k-200k followers"
       - ❌ BAD: "searched for creators" (not a real query)
       - ❌ UNACCEPTABLE: Missing this field
    
    3. **sourceUrl** (REQUIRED): A REAL, VERIFIABLE URL where this information was found.
       - ✅ GOOD: "https://www.instagram.com/username" or "https://article-url.com/..."
       - ❌ BAD: "https://instagram.com" (too generic)
       - ❌ UNACCEPTABLE: Missing this field or fake URLs
    
    4. **evidence** (REQUIRED): A SPECIFIC data point, quote, or observation that proves this item is real and relevant.
       - ✅ GOOD: "Profile shows 127k followers, 8.2% engagement rate, posts daily about Scottish culture"
       - ✅ GOOD: "Bio states 'Glasgow-based comedian' with 450+ comedy reels"
       - ❌ BAD: "Popular creator" (no specific evidence)
       - ❌ UNACCEPTABLE: Missing this field or vague statements

    **⚠️ VALIDATION RULES:**
    - If you cannot find REAL evidence for an item, DO NOT include it in your response
    - DO NOT fabricate or guess evidence - only include items you can verify through Google Search
    - **VERIFY URLs**: Every sourceUrl MUST be a reachable, real URL found in search results. Do not guess URL patterns.
    - DO NOT use placeholder text like "TBD", "N/A", or "Unknown" in any provenance field
    - EVERY item must have ALL FOUR fields (citation, searchQuery, sourceUrl, evidence) filled with REAL data
    - If you can only find 5 verified creators instead of 10, return 5 - quality over quantity

    **REQUIRED ANALYTICS:**
    
    1. **Over-indexed Creators (Rising Stars)** - TARGET: 8 creators (minimum 5 with FULL evidence):
       - **FILTER**: Exclude anyone with >5M followers. Focus on **10k - 500k** range.
       - **Signal**: Find creators who are "Cult Figures" or exhibiting growth specific to the followers of ${profile} on ${platformName}.
       - **CRITICAL - Handle Field**: You MUST find their ACTUAL ${platformName} username/handle (e.g., @presidentchay, NOT "Chay Denne").
         * Use Google Search to find: "[creator name] ${platformName} username" or "[creator name] ${platformName} handle"
         * The 'handle' field MUST be the actual Instagram username (without @), not the display name
         * Example: If the creator is "Chay Denne", search for their actual handle like "presidentchay"
         * VERIFY the handle by checking the Instagram URL format: instagram.com/[handle]
       - Score = "Cult Index" (Higher score = More specific to this niche, less mainstream).
       - **MANDATORY FOR EACH**: citation, searchQuery, sourceUrl, evidence, AND correct Instagram handle (all 5 fields required)
    
    2. **Brand Affinity (Challenger Brands)** - TARGET: 8 brands (minimum 5 with FULL evidence):
       - Identify REAL brands that followers of ${profile} on ${platformName} engage with but are **NOT** global giants.
       - They should be brands that followers of ${profile} engage with, not what ${profile} itself promotes.
       - Focus on lifestyle/adjacent categories (Tech, Gaming, Streetwear, Nutrition).
       - Score = Affinity Strength (0-5).
       - **CRITICAL - Handle Field**: Find their ACTUAL ${platformName} username/handle.
         * Use Google Search: "[brand name] ${platformName} handle"
         * Verify it exists.
       - **CRITICAL - Metadata**:
         * bio: A short description of what they do (under 10 words).
         * followers: Estimate follower count (e.g. "50k", "1.2M").
       - **MANDATORY FOR EACH**: citation, searchQuery, sourceUrl, evidence, handle, followers, bio (all 7 fields required)
    
    3. **Sub-culture Clusters (Emerging Tribes)** - TARGET: ${Math.max(8, Math.min(20, Math.ceil(sampleSize / 50)))} clusters (minimum 5 with FULL evidence):
       - **CRITICAL**: Use Google Search to find REAL, EXISTING communities/tribes within the ${profile} ${platformName} audience.
       - **Search Query Examples**:
         "${profile} ${platformName} community hashtags"
         "${profile} fans trends 2025"
         "${platformName} ${profile} audience subcultures"
       - **Verification**: Each cluster name MUST represent a real, observable trend or community. DO NOT fabricate cluster names.
       - Research actual hashtags, trends, and community identifiers being used by ${profile}'s audience.
       - Provide context on what each tribe represents in under 10 words.
       - Include relevant keywords/hashtags for each cluster.
       - **MANDATORY FOR EACH**: citation, searchQuery, sourceUrl, evidence (all 4 fields required)
    
    4. **Non-Related Interests (Inverse Signals)** - TARGET: 6 interests:
        - Identify popular interests/topics that followers of ${profile} engage with that are NOT related to ${profile}'s core content topics.
        - These should be interests the audience has OUTSIDE of what ${profile} posts about.
        - For each, provide the interest name and exact percentage of followers interested in it.
        - **MANDATORY FOR EACH**: citation, searchQuery, sourceUrl, evidence (all 4 fields required)

    5. **Topic Hierarchy** - TARGET: 5 topics with 3 subtopics each:
        - 5 popular topics that followers of ${profile} on ${platformName} are engaging with.
        - 3 Sub-topics of each topic that followers of ${profile} on ${platformName} are engaging with.
        - **MANDATORY**: 'evidence' must be specific (e.g., "Mentioned in 15% of posts", "Used 500 times in sample").
        - **MANDATORY FOR EACH TOPIC AND SUBTOPIC**: citation, searchQuery, sourceUrl, evidence (all 4 fields required)

    6. **Top Content (Representative Content)** - TARGET: 3 pieces:
        - Identify 3 key pieces of content (posts, videos, or news) that are trending/popular within this community right now.
        - Must include title/description and if possible a URL (or guess a relevant search URL).
        - Fields: title, platform, url, views (estimate), author, description.
        - **MANDATORY FOR EACH**: citation, searchQuery, sourceUrl, evidence (all 4 fields required)

    7. **Visual DNA Analysis** - TARGET: Visual Identity Profile:
        - Analyze the "vibe" and visual aesthetics of the community's content.
        - **aestheticTags**: 3-5 keywords describing the visual style (e.g., "Minimalist", "Grunge", "Cyberpunk", "Pastel").
        - **vibeDescription**: A defined description of the mood/atmosphere (10-15 words).
        - **colorPalette**: 5 hex codes representing the dominant colors found in the content.


    **GRAPH INSTRUCTION:**
    - Node 'label' must match analytics 'name' exactly.
    - Central Node: Profile.
    - Layer 1: Clusters (The Tribes).
    - Layer 2: Creators & Brands connected to the Clusters.
    
    **PROFILE IMAGE:**
    - Find a high-quality URL for the profile picture of "${profile}".

    **OUTPUT FORMAT:**
    Return ONLY valid JSON containing the 'analytics' object. 
    **DO NOT generate the nodes/links array yourself.** I will build the graph programmatically.
    
    **REMEMBER**: EVERY item in EVERY list MUST have citation, searchQuery, sourceUrl, AND evidence. No exceptions.
    
    Structure:
    {
      "analytics": {
        "profileImage": "https://...",
        "creators": [ 
          { 
            "name": "Name", 
            "handle": "handle", 
            "score": 4.2, 
            "category": "Cat",
            "citation": "Found via Google Search: 'rising micro-influencers in [niche]'",
            "searchQuery": "rising micro-influencers in [niche]",
            "sourceUrl": "https://instagram.com/handle",
            "evidence": "Profile shows 250k followers with 45% growth in last 6 months"
          } 
        ],
        "brands": [ 
          { 
            "name": "Brand", 
            "handle": "brandhandle",
            "score": 3.5, 
            "industry": "Ind",
            "bio": "Sustainable streetwear",
            "followers": "150k",
            "citation": "Found via search: 'niche brands popular with [audience]'",
            "searchQuery": "niche brands popular with [audience]",
            "sourceUrl": "https://...",
            "evidence": "Mentioned in 15% of follower bios"
          } 
        ],
        "clusters": [ 
          { 
            "name": "Cluster", 
            "count": 100, 
            "keywords": ["k"],
            "citation": "Identified via hashtag analysis",
            "searchQuery": "${profile} community hashtags",
            "sourceUrl": "https://...",
            "evidence": "Hashtag #ClusterName used in 500+ posts"
          } 
        ],
        "topics": [ 
            { 
              "name": "Fashion", 
              "percentage": "45%", 
              "subtopics": [
                {
                  "name": "Gorpcore",
                  "citation": "Found in trending hashtags",
                  "searchQuery": "${profile} fashion trends",
                  "sourceUrl": "https://...",
                  "evidence": "Mentioned in 200+ posts"
                }
              ],
              "citation": "Identified from follower content analysis",
              "searchQuery": "${profile} follower interests",
              "sourceUrl": "https://...",
              "evidence": "45% of followers post fashion content"
            } 
        ],
        "nonRelatedInterests": [ 
          { 
            "name": "Cooking", 
            "percentage": "25%",
            "citation": "Found via interest analysis",
            "searchQuery": "${profile} follower hobbies",
            "sourceUrl": "https://...",
            "evidence": "25% of bios mention cooking"
          } 
        ],
        "topContent": [ 
          { 
            "title": "Title", 
            "platform": "Instagram", 
            "url": "https://...", 
            "views": "10k", 
            "author": "handle", 
            "description": "Desc",
            "citation": "Found in trending posts",
            "searchQuery": "${profile} viral content",
            "sourceUrl": "https://...",
            "evidence": "10k views, 500+ shares"
          } 
        ],
        "visualAnalysis": {
            "aestheticTags": ["tag1", "tag2"],
            "vibeDescription": "Description of the visual style...",
            "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"]
        }
      },
      "summary": "Summary highlighting the emerging/rising nature of the findings."
    }
  `;


  // Fetch profile image via Apify
  let profileImageUrl: string | null = null;
  let profileFullName: string | null = null;
  try {
    const profileData = await getProfileImage(platform, profile);
    profileImageUrl = profileData.profilePicUrl;
    profileFullName = profileData.fullName;
    console.log('Profile data fetched:', { profileImageUrl, profileFullName });
  } catch (err) {
    console.warn('Failed to fetch profile data, continuing without it:', err);
  }

  try {
    const ai = getAiClient();

    // Retry Logic for Gemini API
    let response;
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            temperature: 0,
            maxOutputTokens: 30000, // Increased for 1.5 Flash (supports higher output)
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
          }
        });
        break; // Success
      } catch (e: any) {
        attempt++;
        console.warn(`Gemini API Failed (Attempt ${attempt}/${maxRetries}):`, e.message);
        if (attempt === maxRetries) throw e;

        // Exponential Backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!response) {
      notify.geminiError();
      throw new Error("Gemini API failed to respond after retries");
    }

    if (response && response.text) {
      // [FIX] Use robust safeParseJson utility which handles markdown, comments, and truncation (jsonrepair)
      console.log("[GeminiService] Parsing response with safeParseJson...");
      const rawData = safeParseJson(response.text);

      if (!rawData || Object.keys(rawData).length === 0) {
        throw new Error("Failed to parse Gemini response (empty or invalid JSON)");
      }

      // Validate required structure
      if (!rawData.analytics) {
        console.warn("[GeminiService] Response missing 'analytics' key. Full keys:", Object.keys(rawData));
        // If the AI returns the object directly without 'analytics' wrapper (common failure mode)
        if (rawData.creators || rawData.clusters) {
          console.log("[GeminiService] Detected unwrapped analytics object. Wrapping it.");
          rawData.analytics = rawData;
        } else {
          throw new Error("Gemini response missing 'analytics' object");
        }
      }

      try {
        // [CONTINUE] with rawData (Scope: rawData is now defined in this block)

        // --- PROGRAMMATIC GRAPH BUILDER ---
        const nodes: Node[] = [];
        const links: Link[] = [];

        nodes.push({ id: 'MAIN', label: profile, group: 'main', val: 50, level: 0 });

        rawData.analytics.clusters.forEach((cluster: any, i: number) => {
          const cid = `c_${i}`;
          nodes.push({
            id: cid,
            label: cluster.name,
            group: 'cluster',
            val: 19, // [FIX] Reduced by 25% for better UI balance
            level: 1,
            provenance: {
              source: 'Gemini Inference',
              method: 'AI Cluster Generation',
              tool: 'Gemini 2.0 Flash',
              context: `Derived from keywords: ${cluster.keywords?.join(', ')}`,
              query: 'Sub-culture Clusters',
              confidence: 0.9
            }
          });
          links.push({ source: 'MAIN', target: cid, value: 5 });

          const creatorsForCluster = rawData.analytics.creators.filter((_: any, idx: number) => idx % rawData.analytics.clusters.length === i);
          creatorsForCluster.forEach((creator: any) => {
            const crid = `cr_${creator.handle}`;
            if (!nodes.find(n => n.id === crid)) {
              nodes.push({
                id: crid,
                label: creator.name,
                group: 'creator',
                val: 15,
                level: 2,
                data: {
                  username: creator.handle,
                  fullName: creator.name,
                  category: creator.category
                },
                provenance: {
                  source: 'Gemini Inference',
                  method: 'Over-indexed Creator',
                  tool: 'Gemini 2.0 Flash',
                  context: creator.provenance || creator.data?.evidence || `Identified as Rising Star with score ${creator.score}`, // [FIX] Use strict provenance if available
                  query: 'Over-indexed Creators',
                  confidence: 0.85
                }
              });
              links.push({ source: cid, target: crid, value: 3 });
            }
          });
        });

        rawData.analytics.topics.forEach((topic: any, i: number) => {
          const tid = `t_${i}`;
          nodes.push({
            id: tid,
            label: topic.name,
            group: 'topic',
            val: 22,
            level: 1,
            provenance: {
              source: 'Gemini Inference',
              method: 'AI Topic Extraction',
              tool: 'Gemini 2.0 Flash (Google Search)',
              context: `Identified as key topic from ${profile}'s content`,
              query: 'Content Topics',
              confidence: 0.80,
              timestamp: new Date()
            }
          });
          links.push({ source: 'MAIN', target: tid, value: 4 });

          topic.subtopics.forEach((sub: any, j: number) => {
            const sid = `st_${i}_${j}`;
            nodes.push({
              id: sid,
              label: typeof sub === 'string' ? sub : sub.name, // Handle both string and object formats
              group: 'subtopic',
              val: 10,
              level: 2,
              parentId: tid,
              provenance: {
                source: 'Gemini Inference',
                method: 'AI Subtopic Extraction',
                tool: 'Gemini 2.0 Flash',
                context: `Subtopic of ${topic.name}`,
                query: 'Content Subtopics',
                confidence: 0.75,
                timestamp: new Date()
              }
            });
            links.push({ source: tid, target: sid, value: 2 });
          });
        });

        rawData.analytics.brands.slice(0, 8).forEach((brand: any, i: number) => {
          const bid = `b_${i}`;
          const brandHandle = brand.handle || brand.name.replace(/\s+/g, '').toLowerCase(); // Fallback
          nodes.push({
            id: bid,
            label: brand.name,
            group: 'brand',
            val: 18,
            level: 1,
            data: {
              username: brandHandle,
              fullName: brand.name,
              bio: brand.bio,
              followers: brand.followers,
              industry: brand.industry,
              overindexScore: brand.score,
              // Pass through provenance for analytics panel flat list
              provenance: {
                source: 'Gemini Inference',
                method: 'AI Brand Identification',
                tool: 'Gemini 2.0 Flash (Google Search)',
                evidence: [
                  {
                    type: 'insight',
                    text: brand.evidence,
                    url: brand.sourceUrl,
                    date: 'Recent',
                    author: 'System'
                  }
                ]
              }
            },
            provenance: {
              source: 'Gemini Inference',
              method: 'AI Brand Identification',
              tool: 'Gemini 2.0 Flash (Google Search)',
              context: brand.provenance || `Identified as ${brand.industry} brand with score ${brand.score}`, // [FIX] Use strict provenance if available
              query: 'Associated Brands',
              confidence: 0.85,
              timestamp: new Date(),
              evidence: [
                {
                  type: 'insight',
                  text: brand.evidence,
                  url: brand.sourceUrl,
                  date: 'Recent',
                  author: 'System'
                }
              ]
            }
          });
          links.push({ source: 'MAIN', target: bid, value: 2 });
        });

        // Add non-related interests as separate nodes
        rawData.analytics.nonRelatedInterests.forEach((interest: any, i: number) => {
          const nid = `nri_${i}`;
          nodes.push({
            id: nid,
            label: interest.name,
            group: 'nonRelatedInterest',
            val: 14,
            level: 1,
            provenance: {
              source: 'Gemini Inference',
              method: 'AI Interest Analysis',
              tool: 'Gemini 2.0 Flash',
              context: `Non-related interest with ${interest.percentage} affinity`,
              query: 'Non-Related Interests',
              confidence: 0.70,
              timestamp: new Date()
            }
          });
          links.push({ source: 'MAIN', target: nid, value: 1 });
        });

        // --- HELPER FUNCTION: Filter non-English content ---
        // Only allow English letters, numbers, spaces, and common punctuation
        const isEnglishText = (text: string): boolean => {
          if (!text) return false;
          // Regex: allows English letters, numbers, spaces, and common punctuation (ASCII 32-126)
          const englishRegex = /^[\x20-\x7E\s]+$/;
          return englishRegex.test(text);
        };

        // --- HELPER FUNCTION: Validate complete provenance ---
        // Ensures item has ALL required provenance fields with real data
        const hasCompleteProvenance = (item: any): boolean => {
          if (!item) return false;

          // Check all 4 required fields exist and are not empty/placeholder
          const hasCitation = item.citation && item.citation.length > 10 &&
            !item.citation.toLowerCase().includes('tbd') &&
            !item.citation.toLowerCase().includes('n/a');

          const hasSearchQuery = item.searchQuery && item.searchQuery.length > 5 &&
            !item.searchQuery.toLowerCase().includes('tbd') &&
            !item.searchQuery.toLowerCase().includes('n/a');

          const hasSourceUrl = item.sourceUrl && item.sourceUrl.startsWith('http') &&
            !item.sourceUrl.includes('...') &&
            item.sourceUrl.length > 15;

          const hasEvidence = item.evidence && item.evidence.length > 15 &&
            !item.evidence.toLowerCase().includes('tbd') &&
            !item.evidence.toLowerCase().includes('n/a') &&
            !item.evidence.toLowerCase().includes('popular') && // Too vague
            !item.evidence.toLowerCase().includes('well-known'); // Too vague

          return hasCitation && hasSearchQuery && hasSourceUrl && hasEvidence;
        };

        // --- DEDUPLICATION & FILTERING LOGIC ---
        // Remove duplicates, non-English entries, AND items without complete provenance

        // Deduplicate creators by handle (case-insensitive) + filter non-English + validate provenance
        const uniqueCreators = Array.from(
          new Map(
            rawData.analytics.creators
              .filter((c: any) => isEnglishText(c.name) && isEnglishText(c.handle) && hasCompleteProvenance(c))
              .map((c: any) => [c.handle.toLowerCase(), c])
          ).values()
        );

        // Log filtered creators for debugging
        const filteredCreatorsCount = rawData.analytics.creators.length - uniqueCreators.length;
        if (filteredCreatorsCount > 0) {
          console.warn(`⚠️  Filtered out ${filteredCreatorsCount} creators due to missing/incomplete provenance`);
        }

        // Deduplicate brands by name (case-insensitive) + filter non-English + validate provenance
        const uniqueBrands = Array.from(
          new Map(
            rawData.analytics.brands
              .filter((b: any) => isEnglishText(b.name) && hasCompleteProvenance(b))
              .map((b: any) => [b.name.toLowerCase(), b])
          ).values()
        );

        const filteredBrandsCount = rawData.analytics.brands.length - uniqueBrands.length;
        if (filteredBrandsCount > 0) {
          console.warn(`⚠️  Filtered out ${filteredBrandsCount} brands due to missing/incomplete provenance`);
        }

        // Deduplicate clusters by name (case-insensitive) + filter non-English + validate provenance
        const uniqueClusters = Array.from(
          new Map(
            rawData.analytics.clusters
              .filter((c: any) => isEnglishText(c.name) && hasCompleteProvenance(c))
              .map((c: any) => [c.name.toLowerCase(), c])
          ).values()
        );

        const filteredClustersCount = rawData.analytics.clusters.length - uniqueClusters.length;
        if (filteredClustersCount > 0) {
          console.warn(`⚠️  Filtered out ${filteredClustersCount} clusters due to missing/incomplete provenance`);
        }

        // Deduplicate nonRelatedInterests by name (case-insensitive) + filter non-English + validate provenance
        const uniqueNonRelated = Array.from(
          new Map(
            rawData.analytics.nonRelatedInterests
              .filter((n: any) => isEnglishText(n.name) && hasCompleteProvenance(n))
              .map((n: any) => [n.name.toLowerCase(), n])
          ).values()
        );

        const filteredInterestsCount = rawData.analytics.nonRelatedInterests.length - uniqueNonRelated.length;
        if (filteredInterestsCount > 0) {
          console.warn(`⚠️  Filtered out ${filteredInterestsCount} interests due to missing/incomplete provenance`);
        }

        return {
          nodes,
          links,
          profileImage: profileImageUrl,
          profileFullName: profileFullName,
          summary: rawData.summary,
          analytics: rawData.analytics,
          comparisonMetadata: {
            creators: uniqueCreators,
            brands: uniqueBrands,
            clusters: uniqueClusters,
            topics: rawData.analytics.topics,
            nonRelatedInterests: uniqueNonRelated,
            topContent: rawData.analytics.topContent
          }
        };

      } catch (parseError: any) {
        notify.geminiError();
        console.error("Gemini JSON Parse Error:", parseError);
        console.error("Raw response:", response.text);
        throw new Error("Failed to parse Gemini response: " + parseError.message);
      }
    } else {
      throw new Error("Empty response from Gemini");
    }

  } catch (error: any) {
    console.error("Fetch Fandom Analysis Failed:", error);
    notify.geminiError();
    throw error;
  }
};

// Batch Analysis for Deep Search (Semantic Matching)
// [NEW] Enhanced analyzeBatch with specialized modes
export const analyzeBatch = async (
  posts: any[],
  query: string,
  analysisType: 'standard' | 'sentiment' | 'lexicon' = 'standard'
): Promise<{ matches: any[]; vibeAnalysis?: any; lexicon?: any[]; usage?: { estimatedCost: string } }> => {
  const model = "gemini-3-flash-preview";

  const postsText = posts.map((p, i) => `[Post ${i}] (Author: ${p.ownerUsername || p.username || 'unknown'}): ${p.text || p.caption}`).join("\n");

  let systemPrompt = "";

  if (analysisType === 'sentiment') {
    systemPrompt = `
      Task: Perform a deep Sentiment & Vibe Analysis on these social media posts regarding "${query}".

      Analyze specific emotions, polarization, and the overall "mood" of the conversation.

      Output JSON:
      {
        "matches": [
          {
             "id": "Post index (0, 1, etc)",
             "sentiment_score": number (-1.0 to 1.0),
             "emotion_label": string (e.g., "Joy", "Anger", "Confusion", "Hope"),
             "reasoning": "Why this score?"
          }
        ],
        "vibeAnalysis": {
           "aggregate_score": number (average sentiment -1.0 to 1.0),
           "dominant_emotion": string,
           "secondary_emotion": string,
           "vibe_description": "A 1-sentence summary of the community mood (e.g. 'Cautiously optimistic with pockets of skepticism regarding pricing.')",
           "polarization_score": number (0 to 1, how divided is the group?),
           "keywords": string[] (emotional keywords)
        }
      }
      `;
  } else if (analysisType === 'lexicon') {
    systemPrompt = `
      Task: Analyze the language used in these posts to build a "Fandom Lexicon" (Slang Dictionary).
      Identify unique slang terms, acronyms, inside jokes, and specific vocabulary used by this community regarding "${query}".

      Output JSON:
      {
        "matches": [], // Empty matches is fine for lexicon, or return examples
        "lexicon": [
          {
            "term": "The slang word/phrase",
            "definition": "What it means in this context",
            "example": "A usage example found in the text or constructed",
            "category": "Slang" | "Acronym" | "Reference",
            "popularity": number (1-10 commonality in this batch)
          }
        ]
      }
      `;
  } else {
    // STANDARD / DEEP SEARCH PROMPT (Existing)
    systemPrompt = `
      Task: Analyze these ${posts.length} posts for relevance to the query: "${query}".
      Identify posts that are truly relevant (semantic matches).

      Output JSON:
      {
        "matches": [
          {
            "id": "Post index",
            "score": number (0-1 relevance),
            "reasoning": "Why relevant?",
            "topics": ["topic1", "topic2"],
            "provenance": {
               "context": "quoted text snippet",
               "confidence": number
            }
          }
        ]
      }
      `;
  }

  const prompt = `
    ${systemPrompt}

    POSTS TO ANALYZE:
    ${postsText}

    Return ONLY valid JSON.
  `;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0,
      }
    });

    if (response.text) {
      const data = safeParseJson(response.text);

      // Map back to original posts
      // Estimate cost (very rough)
      const estimatedCost = `$${(response.usageMetadata?.totalTokenCount || 0) * 0.0000001}`;

      return {
        matches: data.matches || [],
        vibeAnalysis: data.vibeAnalysis,
        lexicon: data.lexicon,
        usage: { estimatedCost }
      };
    }
  } catch (error) {
    console.warn("analyzeBatch failed:", error);
  }
  return { matches: [], usage: { estimatedCost: "$0.00" } };
};

export const aggregateLocations = async (locations: string[]): Promise<any[]> => {
  const model = "gemini-3-flash-preview";
  // Filter empty
  const raw = locations.filter(l => l && l.length > 2).slice(0, 100); // Limit to 100 to save tokens
  if (raw.length === 0) return [];

  const prompt = `
            Task: Analyze these raw location strings from user profiles and group them into major Cities/Regions.
            Normalize strings (e.g., "NYC", "New York", "Manhattan" -> "New York, USA").
            ignoring vague ones like "Earth" or "Everywhere".

            Return JSON:
            {
              "locations": [
                {
                  "name": "City, Country",
                  "count": number,
                  "lat": number (approx latitude),
                  "lng": number (approx longitude)
                }
              ]
            }

            LOCATIONS:
            ${JSON.stringify(raw)}
          `;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0,
      }
    });

    if (response.text) {
      const data = safeParseJson(response.text);
      return data.locations || [];
    }
  } catch (e) {
    console.warn("Geo Aggregation Failed", e);
  }
  return [];
};

// [VISUAL INTELLIGENCE] Helper: Fetch image as base64 for Gemini Vision
const fetchImageAsBase64 = async (imageUrl: string): Promise<{ inlineData: { data: string; mimeType: string }; originalUrl: string } | null> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${imageUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // [FIX] Check if Buffer is available (Node.js) or use browser alternative
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      // Node.js environment
      base64 = Buffer.from(buffer).toString('base64');
    } else {
      // Browser environment
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(binary);
    }

    // [FIX] Detect MIME type from Content-Type header first, then URL
    let mimeType = response.headers.get('content-type') || 'image/jpeg';

    // Fallback to URL-based detection if header is generic
    if (mimeType === 'application/octet-stream' || !mimeType.startsWith('image/')) {
      if (imageUrl.toLowerCase().includes('.png')) mimeType = 'image/png';
      else if (imageUrl.toLowerCase().includes('.webp')) mimeType = 'image/webp';
      else if (imageUrl.toLowerCase().includes('.gif')) mimeType = 'image/gif';
      else mimeType = 'image/jpeg';
    }

    return {
      inlineData: {
        data: base64,
        mimeType
      },
      originalUrl: imageUrl // [FIX] Track original URL for index mapping
    };
  } catch (error) {
    console.error(`Error fetching image ${imageUrl}:`, error);
    return null;
  }
};

// [VISUAL INTELLIGENCE] Helper: Chunk array for batch processing
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// [VISUAL INTELLIGENCE] Helper: Delay for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// [VISUAL INTELLIGENCE] Visual Analysis Prompts
const getVisualAnalysisPrompt = (analysisType: 'brands' | 'vibe' | 'products' | 'full'): string => {
  const basePrompt = `Analyze these images and provide detailed visual intelligence.`;

  if (analysisType === 'brands' || analysisType === 'full') {
    return `${basePrompt}

**BRAND & LOGO DETECTION:**
Identify any visible brands, logos, or recognizable products in these images.

For each brand/logo found:
1. Brand name (official name)
2. Confidence level (0-100) - how certain you are
3. Image index where it appears (0-based)

**VISUAL AESTHETIC ANALYSIS:**
Analyze the overall aesthetic style and visual vibe.

Identify:
1. Color palette - Extract 3-5 dominant colors as hex codes
2. Aesthetic tags - Choose 3-5 from: Minimalist, Vibrant, Retro, Neon, Earthy, Luxury, Grunge, Pastel, Bold, Monochrome, Vintage, Modern, Playful, Dark, Light
3. Vibe description - 1-2 sentences describing the overall aesthetic

**PRODUCT IDENTIFICATION:**
Identify visible products in the images.

For each product:
1. Category (Clothing, Electronics, Food, Beauty, Accessories, Furniture, etc.)
2. Brief description (e.g., "White sneakers", "Smartphone with black case")

**OUTPUT FORMAT:**
Return ONLY valid JSON:

\`\`\`json
{
  "brands": [
    { "name": "Nike", "confidence": 95, "imageIndex": 0 },
    { "name": "Apple", "confidence": 88, "imageIndex": 2 }
  ],
  "aestheticTags": ["Vibrant", "Modern", "Playful"],
  "vibeDescription": "A bright, energetic collection with bold colors and contemporary styling.",
  "colorPalette": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#F7DC6F", "#BB8FCE"],
  "products": [
    { "category": "Clothing", "description": "White sneakers" },
    { "category": "Electronics", "description": "Smartphone with black case" }
  ]
}
\`\`\`

If no brands/products are visible, return empty arrays. Focus on accuracy over quantity.`;
  }

  if (analysisType === 'vibe') {
    return `${basePrompt}

Analyze the aesthetic style and visual vibe of these images.

Identify:
1. Color palette (hex codes for 3-5 dominant colors)
2. Aesthetic tags (3-5 tags from: Minimalist, Vibrant, Retro, Neon, Earthy, Luxury, Grunge, Pastel, Bold, Monochrome, Vintage, Modern, Playful, Dark, Light)
3. Overall vibe description (1-2 sentences)

Return JSON:
\`\`\`json
{
  "colorPalette": ["#FF6B6B", "#4ECDC4", "#45B7D1"],
  "aestheticTags": ["Vibrant", "Modern", "Playful"],
  "vibeDescription": "A bright, energetic collection with bold colors and contemporary styling."
}
\`\`\``;
  }

  if (analysisType === 'products') {
    return `${basePrompt}

Identify products visible in these images.

For each product:
1. Category (e.g., "Clothing", "Electronics", "Food", "Beauty")
2. Brief description

Return JSON:
\`\`\`json
{
  "products": [
    { "category": "Clothing", "description": "White sneakers" },
    { "category": "Electronics", "description": "Smartphone with black case" }
  ]
}
\`\`\``;
  }

  return basePrompt;
};

// [VISUAL INTELLIGENCE] Main Visual Analysis Function
export const analyzeVisualContent = async (
  imageUrls: string[],
  analysisType: 'brands' | 'vibe' | 'products' | 'full' = 'full'
): Promise<{
  brands: Array<{ name: string; confidence: number; imageUrl: string }>;
  aestheticTags: string[];
  vibeDescription: string;
  colorPalette: string[];
  products: Array<{ category: string; description: string }>;
}> => {
  console.log(`[Visual Intelligence] Analyzing ${imageUrls.length} images (type: ${analysisType})`);

  if (imageUrls.length === 0) {
    return {
      brands: [],
      aestheticTags: [],
      vibeDescription: '',
      colorPalette: [],
      products: []
    };
  }

  try {
    const ai = getAiClient();

    // Batch process images (max 10 at a time to avoid rate limits and token limits)
    const batches = chunkArray(imageUrls, 10);
    const allResults: any[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[Visual Intelligence] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} images)`);

      // Fetch images as base64
      const imageParts = await Promise.all(
        batch.map(url => fetchImageAsBase64(url))
      );

      // [FIX] Create URL mapping before filtering
      const urlToIndexMap = new Map<string, number>();
      batch.forEach((url, idx) => urlToIndexMap.set(url, idx));

      // Filter out failed fetches
      const validImageParts = imageParts.filter(part => part !== null);

      if (validImageParts.length === 0) {
        console.warn(`[Visual Intelligence] No valid images in batch ${batchIndex + 1}, skipping`);
        continue;
      }

      // Prepare prompt
      const prompt = getVisualAnalysisPrompt(analysisType);

      // Call Gemini Vision API
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview', // Superior multimodal logic
          contents: [
            { role: 'user', parts: [{ text: prompt }, ...validImageParts.map(p => ({ inlineData: p.inlineData }))] }
          ],
          config: {
            temperature: 0, // Deterministic analysis
            maxOutputTokens: 2048
          }
        });

        if (response && response.text) {
          let jsonString = response.text.trim();
          jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();

          // [FIX] Use safeParseJson utility for better error handling
          const result = safeParseJson(jsonString);

          if (result) {
            // [FIX] Map imageIndex to actual URLs, accounting for failed fetches
            if (result.brands && Array.isArray(result.brands)) {
              result.brands = result.brands.map((brand: any) => {
                // Find the original URL from validImageParts
                const imagePart = validImageParts[brand.imageIndex];
                const imageUrl = imagePart?.originalUrl || batch[0];

                return {
                  ...brand,
                  imageUrl
                };
              });
            }

            allResults.push(result);
          } else {
            console.error('[Visual Intelligence] Failed to parse JSON response');
            console.log('[Visual Intelligence] Raw response:', jsonString.substring(0, 200));
          }
        }
      } catch (apiError) {
        console.error(`[Visual Intelligence] API error for batch ${batchIndex + 1}:`, apiError);
      }

      // Rate limiting: 15 RPM = 1 request per 4 seconds
      if (batchIndex < batches.length - 1) {
        await delay(4000);
      }
    }

    // Aggregate results from all batches
    const aggregated = {
      brands: [] as Array<{ name: string; confidence: number; imageUrl: string }>,
      aestheticTags: [] as string[],
      vibeDescription: '',
      colorPalette: [] as string[],
      products: [] as Array<{ category: string; description: string }>
    };

    // Merge brands (deduplicate by name)
    const brandMap = new Map<string, { name: string; confidence: number; imageUrl: string }>();
    allResults.forEach(result => {
      if (result.brands) {
        result.brands.forEach((brand: any) => {
          const existing = brandMap.get(brand.name);
          if (!existing || brand.confidence > existing.confidence) {
            brandMap.set(brand.name, brand);
          }
        });
      }
    });
    aggregated.brands = Array.from(brandMap.values());

    // Merge aesthetic tags (count frequency)
    const tagCounts = new Map<string, number>();
    allResults.forEach(result => {
      if (result.aestheticTags) {
        result.aestheticTags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });
    aggregated.aestheticTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Merge color palettes (take most common colors)
    const colorCounts = new Map<string, number>();
    allResults.forEach(result => {
      if (result.colorPalette) {
        result.colorPalette.forEach((color: string) => {
          colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        });
      }
    });
    aggregated.colorPalette = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);

    // Combine vibe descriptions
    const vibes = allResults
      .map(r => r.vibeDescription)
      .filter(v => v && v.length > 0);
    aggregated.vibeDescription = vibes.length > 0 ? vibes[0] : '';

    // Merge products (deduplicate by description)
    const productSet = new Set<string>();
    allResults.forEach(result => {
      if (result.products) {
        result.products.forEach((product: any) => {
          const key = `${product.category}:${product.description}`;
          if (!productSet.has(key)) {
            productSet.add(key);
            aggregated.products.push(product);
          }
        });
      }
    });

    console.log(`[Visual Intelligence] Analysis complete:`, {
      brands: aggregated.brands.length,
      tags: aggregated.aestheticTags.length,
      colors: aggregated.colorPalette.length,
      products: aggregated.products.length
    });

    return aggregated;

  } catch (error) {
    console.error('[Visual Intelligence] Fatal error:', error);
    return {
      brands: [],
      aestheticTags: [],
      vibeDescription: '',
      colorPalette: [],
      products: []
    };
  }
}

// [NEW] Deep Dive Analysis for Job Orchestrator (Universal)

// [NEW] Distributed Analysis Modes
// [NEW] Distributed Analysis Modes
export type AnalysisMode = 'full' | 'structure' | 'creators' | 'brands' | 'content' | 'verification';

export const analyzeFandomDeepDive = async (
  query: string,
  scrapedData: any[],
  intent: string = 'general',
  platform: string = 'instagram',
  datasetUrl: string = '',
  sampleSize: number = 100,
  useVisualTheme: boolean = false,
  richContext: any[] = [], // [NEW] Master List of Full Profiles for Hydration
  mode: AnalysisMode = 'full',
  seedContext: string = "" // [NEW] Accept Seed Context
): Promise<any> => {
  console.log(`[GeminiService] Starting Analysis: ${query} (Intent: ${intent}, Mode: ${mode}, Items: ${scrapedData.length})`);
  if (seedContext) console.log(`[GeminiService] Mixing in Seed Context (${seedContext.length} chars)`);

  // [NEW] Index richContext for O(1) Lookup
  // Key: Lowercase username/handle
  const profileMap = new Map<string, any>();
  if (Array.isArray(richContext)) {
    richContext.forEach(p => {
      const key = (p.username || p.handle || p.ownerUsername || '').toLowerCase();
      if (key) profileMap.set(key, p);
    });
  }

  try {
    const model = "gemini-3-pro-preview"; // [FIX] Use Pro for complex reasoning
    const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram';
    // [NEW] Dynamic Tuning based on Intent
    // [FIX] REMOVED HARD LIMITS on Context. We want to analyze EVERYTHING.
    // Gemin 1.5/2.0 Flash has a massive context window (1M+ tokens), so we can pass the entire dataset.
    const contextLimit = 100000;

    // [FIX] Dynamic Target Count - "As many as the data supports" explanation
    // We still provide a 'target' for the prompt to aim for, but it shouldn't be a hard cap.
    let targetCount = Math.max(50, Math.ceil(sampleSize * 0.5));
    if (intent === 'over_indexing' || intent === 'network_clusters') {
      targetCount = Math.max(100, Math.ceil(sampleSize * 0.8));
    }

    // [NEW] Shortcode Registry (Shared across all modes)
    const registry = new UniversalShortcodeRegistry();

    // Prepare Context (Optimized for Gemini Flash Context Window)
    // We include RICH details but limit count based on mode if needed
    // verifying mode needs less context? No, Auditor needs full context to verify relevance.
    const isContentIntent = true;

    // [FIX] Pass ALL data (up to high limit) - No arbitrary slicing
    const dataContext = scrapedData.slice(0, contextLimit).map(item => {
      const user = item.username || item.ownerUsername || 'unknown';
      const followers = item.followersCount || item.followers || '?';
      const following = item.followsCount || item.following || '?';
      const posts = item.mediaCount || '?';
      const freq = item._frequency ? `(Freq: ${item._frequency})` : '';
      const provenance = (item._provenance && item._provenance.length > 0)
        ? ` [Found via: ${item._provenance.slice(0, 5).join(', ')}]` // Limit to 5 sources to save tokens
        : '';

      // Media & Post Links (Crucial for Content Mode)
      let mediaDetails = "";
      if (isContentIntent) {
        if (item.text || item.caption) {
          const media = registry.register(item.imageUrl || item.displayUrl || '');
          const postUrl = registry.register(item.url || item.postUrl || '');
          const hashtags = (item.hashtags || []).slice(0, 5).join(' ');
          const caption = (item.text || item.caption || '').substring(0, 300).replace(/\n/g, ' ');
          mediaDetails = ` [Media: ${media}] [Link: ${postUrl}] [Tags: ${hashtags}] Post: "${caption}"`;
        } else if (item.latestPosts && Array.isArray(item.latestPosts) && item.latestPosts.length > 0) {
          // [NEW] Fallback to latest post if top-level caption missing
          const topPost = item.latestPosts[0];
          const media = registry.register(topPost.displayUrl || topPost.url || '');
          const postUrl = registry.register(topPost.url || '');
          const caption = (topPost.caption || '').substring(0, 300).replace(/\n/g, ' ');
          mediaDetails = ` [Media: ${media}] [Link: ${postUrl}] Post: "${caption}"`;
        }
      }

      // Network Signals (Crucial for Structure/Clusters)
      let networkSignals = "";
      if (item.relatedProfiles && Array.isArray(item.relatedProfiles)) {
        networkSignals += ` [Related: ${item.relatedProfiles.map((p: any) => p.username).slice(0, 5).join(',')}]`;
      }

      const pic = registry.register(item.profilePicUrl || item.metaData?.profilePicUrl || '');
      // [FIX] Include ID for strict provenance
      const id = item.id || item.pk || item.user_id || 'N/A';
      return `- [ID: ${id}] ${user} ${freq}${provenance}: ${item.biography || 'No bio'} (Followers: ${followers}, Posts: ${posts}) [Pic: ${pic}]${mediaDetails}${networkSignals}`;
    }).join('\n');


    // [NEW] Select Modular Prompt based on Mode
    const systemInstruction = getPromptForMode(mode, intent, query, platformName, targetCount, useVisualTheme, '');

    const prompt = `
      Perform a ${mode.toUpperCase()} ANALYSIS for "${query}" on ${platformName}.
      
      ${seedContext ? `**PRIORITY CONTEXT (FROM SEED PROFILES):**\n${seedContext}\n` : ''}

      **CONTEXT DATA (Source of Truth - WHITELIST):**
      ${dataContext}
      ...(and more items)

      **INSTRUCTIONS:**
      ${systemInstruction}

      **OUTPUT FORMAT:**
      Return raw JSON only. No markdown.
      
      **CRITICAL - STRICT ADHERENCE REQUIRED:**
      1. **NO HALLUCINATIONS:** You are FORBIDDEN from creating/inventing users, brands, or entities. 
      2. **WHITELIST ONLY:** Every single entity (creator, brand, profile) in the output MUST exist in the provided "CONTEXT DATA". 
      3. **PROVENANCE:** For every entity, you MUST include a 'provenance' field citing the specific record [ID] or handle from the context.
      4. **IDS REQUIRED:** You MUST map every output node to its corresponding [ID: ...] from the context.
      5. **HANDLES:** Use the exact handle/username from the context. Do not "fix" or "guess" handles.
      6. **DATA INTEGRITY:** If a bio/stat is missing in context, omit it. Do not infer or guess.
    `;

    const ai = getAiClient();
    console.log(`[GeminiService] Sending ${mode} request...`);

    // [NEW] Parallel Visual Analysis (Vibe Check)
    let visualAnalysisPromise: Promise<any> | null = null;
    if (useVisualTheme) {
      const candidateImages = scrapedData
        .flatMap(item => {
          const images = [];
          if (item.displayUrl) images.push(item.displayUrl);
          if (item.imageUrl) images.push(item.imageUrl);
          if (item.latestPosts && Array.isArray(item.latestPosts)) {
            item.latestPosts.slice(0, 1).forEach((p: any) => {
              if (p.displayUrl) images.push(p.displayUrl);
              if (p.url && !p.url.includes('tiktok')) images.push(p.url); // Avoid video links for vision
            });
          }
          if (item.profilePicUrl) images.push(item.profilePicUrl);
          return images;
        })
        .filter(url => url && url.startsWith('http') && !url.includes('.mp4')) // Relaxed filter to allow proxied images
        .slice(0, 15); // Analyze more images for better coverage

      if (candidateImages.length > 0) {
        console.log(`[GeminiService] 🎨 Launching Parallel Visual Analysis on ${candidateImages.length} images...`);
        // Limit to top 10 for the actual AI call to avoid token limits
        visualAnalysisPromise = analyzeVisualContent(candidateImages.slice(0, 10), 'vibe');
      }
    }

    // [Request]
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 30000, // Large output window
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      }
    });

    // [Response Handling]
    if (response && response.text) {
      console.log(`[GeminiService] ${mode} response received (${response.text.length} chars).`);
      const rawJson = safeParseJson(response.text);

      if (rawJson) {
        // Unpack & Polyfill
        const unpackedJson = registry.unpackObject(rawJson);

        // Polyfill Name Loop
        const polyfillName = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach(item => polyfillName(item));
          } else {
            if (obj.label && !obj.name) obj.name = obj.label;
            Object.values(obj).forEach(v => polyfillName(v));
          }
        };
        polyfillName(unpackedJson);

        // [NEW] Merge Visual DNA Results
        if (visualAnalysisPromise) {
          try {
            const visualData = await visualAnalysisPromise;
            if (visualData && (visualData.aestheticTags?.length > 0 || visualData.vibeDescription)) {
              unpackedJson.analytics = unpackedJson.analytics || {};
              unpackedJson.analytics.visualAnalysis = visualData;

              // [FIX] Ensure visualTheme is populated for the frontend
              unpackedJson.analytics.visualTheme = {
                primaryColor: visualData.colorPalette?.[0] || '#ec4899',
                textureStyle: visualData.aestheticTags?.[0] || 'generic',
                nodeTypeMapping: {}
              };
              console.log("[GeminiService] ✅ Merged Visual DNA into Analytics & Theme");
            }
          } catch (err) {
            console.warn("[GeminiService] ⚠️ Visual Analysis failed silently:", err);
          }
        }

        // [NEW] Hydrate from Rich Context (The "Flesh on the Bones")
        if (profileMap.size > 0) {
          console.log(`[GeminiService] Hydrating graph with ${profileMap.size} scraped profiles...`);
          // [DEBUG] Log sample keys from profileMap
          const sampleKeys = Array.from(profileMap.keys()).slice(0, 5);
          console.log(`[GeminiService] Sample profileMap keys: ${sampleKeys.join(', ')}`);

          let hydrationCount = 0;
          const hydrateNode = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            // Check if this node represents a profile we have data for
            const keysToCheck = [obj.handle, obj.username, obj.ownerUsername, obj.label];
            let match = null;

            for (const k of keysToCheck) {
              if (k && typeof k === 'string') {
                const cleanKey = k.toLowerCase().replace('@', '');
                // Try exact match or with @
                match = profileMap.get(cleanKey) || profileMap.get('@' + cleanKey);
                if (match) {
                  hydrationCount++;
                  break;
                }
              }
            }

            if (match) {
              // Inject Rich Data
              obj.data = obj.data || {};
              // Prefer existing data if key is missing in match
              obj.data.bio = match.biography || match.bio || obj.data.bio || "Bio unavailable";
              obj.data.profilePicUrl = match.profilePicUrl || obj.data.profilePicUrl;
              obj.data.followers = match.followersCount || match.followers || obj.data.followers;
              obj.data.following = match.followsCount || match.following || obj.data.following;
              obj.data.posts = match.mediaCount || match.postsCount || obj.data.posts;
              obj.data.externalUrl = match.externalUrl || match.url || obj.data.externalUrl;
              obj.data.isVerified = match.isVerified || obj.data.isVerified;

              // Add provenance if available
              if (match.source) obj.data.citation = `Derived from ${match.source}`;

              // Ensure handle is set correctly
              if (!obj.handle && match.username) obj.handle = '@' + match.username;
            }

            // Recurse children
            if (Array.isArray(obj)) {
              obj.forEach(item => hydrateNode(item));
            } else {
              Object.values(obj).forEach(v => hydrateNode(v));
            }
          };
          hydrateNode(unpackedJson);
          console.log(`[GeminiService] Hydrated ${hydrationCount} nodes from richContext`);
        } else {
          console.log(`[GeminiService] No richContext provided - skipping hydration`);
        }

        // [NEW] Log 3D Theme for User
        if (unpackedJson.analytics && unpackedJson.analytics.visualTheme) {
          console.log("\n=== 3D THEME GENERATED ===");
          console.log(JSON.stringify(unpackedJson.analytics.visualTheme, null, 2));
          console.log("==========================\n");
        }

        // Save Debug
        try {
          const fs = await import('fs');
          fs.writeFileSync(`debug_gemini_${mode}.json`, JSON.stringify(unpackedJson, null, 2));
        } catch (e) { /* ignore */ }

        return unpackedJson;
      }
    }
    return {}; // Return empty object on failure (don't crash Promise.all)

  } catch (e: any) {
    console.error(`[GeminiService] ${mode} Analysis Failed:`, e);
    return {};
  }
};

// [NEW] The Auditor (Verification Phase) - Enhanced with Quality Metrics
export const verifyAnalysis = async (
  query: string,
  analytics: any
): Promise<{
  isValid: boolean;
  confidence: number;
  reason?: string;
  qualityMetrics?: {
    completeness: number;
    relevance: number;
    diversity: number;
  };
  issues?: string[];
}> => {
  try {
    console.log(`[GeminiService] 🕵️ Auditor verifying relevance for: "${query}"`);

    // Calculate quality metrics
    const qualityMetrics = {
      completeness: 0,
      relevance: 0,
      diversity: 0
    };

    const issues: string[] = [];

    // 1. Completeness Check (0-100)
    let expectedFields = 0;
    let presentFields = 0;

    if (analytics) {
      expectedFields = 5; // clusters, creators, brands, topics, vibeDescription
      if (analytics.clusters && analytics.clusters.length > 0) presentFields++;
      if (analytics.creators && analytics.creators.length > 0) presentFields++;
      if (analytics.brands && analytics.brands.length > 0) presentFields++;
      if (analytics.topics && analytics.topics.length > 0) presentFields++;
      if (analytics.vibeDescription) presentFields++;
    }

    qualityMetrics.completeness = expectedFields > 0 ? (presentFields / expectedFields) * 100 : 0;

    if (qualityMetrics.completeness < 40) {
      issues.push(`Low completeness: only ${presentFields}/${expectedFields} expected fields present`);
    }

    // 2. Diversity Check (variety of results)
    const clusterCount = analytics.clusters?.length || 0;
    const creatorCount = analytics.creators?.length || 0;
    const brandCount = analytics.brands?.length || 0;

    if (clusterCount >= 5) qualityMetrics.diversity += 40;
    else if (clusterCount >= 3) qualityMetrics.diversity += 25;
    else issues.push(`Low cluster diversity: only ${clusterCount} clusters`);

    if (creatorCount >= 10) qualityMetrics.diversity += 30;
    else if (creatorCount >= 5) qualityMetrics.diversity += 15;

    if (brandCount >= 10) qualityMetrics.diversity += 30;
    else if (brandCount >= 5) qualityMetrics.diversity += 15;

    // 3. Check for hallucination indicators
    const genericNames = ['Unknown', 'User', 'Profile', 'Account', 'Example'];
    let genericCount = 0;

    const checkGeneric = (items: any[]) => {
      items?.forEach(item => {
        if (item.label && genericNames.some(g => item.label.includes(g))) {
          genericCount++;
        }
      });
    };

    checkGeneric(analytics.creators);
    checkGeneric(analytics.brands);
    checkGeneric(analytics.clusters);

    if (genericCount > 3) {
      issues.push(`Possible hallucination: ${genericCount} nodes with generic names`);
      qualityMetrics.relevance -= 20;
    }

    // Summarize what we found
    const summary = `
        Clusters: ${analytics.clusters?.map((c: any) => c.label).join(', ') || 'None'}
        Top Creators: ${analytics.creators?.slice(0, 5).map((c: any) => c.label).join(', ') || 'None'}
        Top Brands: ${analytics.brands?.slice(0, 5).map((c: any) => c.label).join(', ') || 'None'}
        Topics: ${analytics.topics?.slice(0, 5).map((c: any) => c.label).join(', ') || 'None'}
        Vibe: ${analytics.vibeDescription || 'None'}
        `;

    const prompt = `
        You are a Quality Assurance Auditor for a Search Engine.
        Original User Query: "${query}"
        
        Generated Analysis Results:
        ${summary}
        
        **TASK:**
        1. **Analyze the Query Constraints:** Does the query ask for a specific category (e.g., "drinks", "tech", "fashion")?
        2. **Verify Relevance:** The result should address the query but **ALLOW** related interests, adjacent topics, and unexpected correlations if they appear as strong signals.
           - *Example: Query "drinks" -> Result includes "Food", "Nightlife", "Gaming" -> ACCEPT (Contextually Related).*
           - *Only REJECT if the result is completely random/hallucinated (e.g., "Nike" appearing in a "Medical" query without context).*
        3. **General Quality:** Does the result answer the user's core question?
        4. **Anti-Hallucination:** Reject generic/hallucinated lists that ignore the context.
        5. **Provide Confidence Score:** Rate your confidence in this result (0-100).
        
        If it fails any of these checks, REJECT it with a specific reason.
        
        Return JSON: { "isValid": boolean, "confidence": number, "reason": "string" } 
        `;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0, responseMimeType: "application/json" }
    });

    if (response.text) {
      const aiResult = JSON.parse(response.text);

      // Calculate overall relevance from AI confidence
      qualityMetrics.relevance = aiResult.confidence || 70;

      // Adjust confidence based on quality metrics
      let adjustedConfidence = aiResult.confidence || 70;
      if (qualityMetrics.completeness < 50) adjustedConfidence -= 15;
      if (qualityMetrics.diversity < 50) adjustedConfidence -= 10;
      if (issues.length > 2) adjustedConfidence -= 10;

      return {
        isValid: aiResult.isValid && qualityMetrics.completeness >= 40,
        confidence: Math.max(0, Math.min(100, adjustedConfidence)),
        reason: aiResult.reason,
        qualityMetrics,
        issues: issues.length > 0 ? issues : undefined
      };
    }
  } catch (e) {
    console.warn("[GeminiService] Auditor failed, assuming valid.", e);
  }
  return {
    isValid: true,
    confidence: 70,
    qualityMetrics: {
      completeness: 0,
      relevance: 0,
      diversity: 0
    }
  };
};


// [NEW] Modular Prompt Factory
const getPromptForMode = (mode: AnalysisMode, intent: string, query: string, platform: string, targetCount: number, useVisualTheme: boolean, focusCategory: string): string => {

  // Base instructions shared by all miners
  const baseConstraints = `
        **CONSTRAINTS:**
        1. **CRITICAL STEP: QUERY ANALYSIS**
           - First, DEEPLY understand the USER'S QUERY: "${query}"
           - Determine the **Intent Category** (e.g., Drinks, Tech, Fashion, General Map).
           - **FOCUS WITH DISCOVERY:** If the query specifies a category (e.g., "drinks"), prioritize that category but **ALSO INCLUDE** related interests, adjacent behaviors, and unexpected correlations found in the context.
           - **DO NOT** filter out valid signals just because they aren't exact matches. Unexpected connections are valuable.
           - If the query is broad (e.g., "map of"), extract diverse, representative data.

        2. Parse the CONTEXT DATA to find specific matching entities.
        3. Return ONLY the JSON object for your specific module.
        4. STRICTLY follow the Schema provided.
        5. "handle" is REQUIRED for all profiles. "label" is user display name.
        
        6. **🌲 UNIVERSAL TREE STRUCTURE REQUIREMENTS (CRITICAL):**
           - **ALWAYS return a HIERARCHICAL TREE** (root -> clusters -> items), NEVER flat arrays
           - **MINIMUM DEPTH**: 3 levels (root -> cluster -> items)
           - **RICH CLUSTERING**: Create AS MANY clusters as the data supports (minimum 3-5 clusters)
           - **NO ARBITRARY LIMITS**: Use ALL available data from context, not just top 10-20 items
           - **RECURSIVE SUB-CLUSTERING**: If a cluster has >20 items, create meaningful sub-clusters
           - **PROPER NODE TYPES**: root="main", clusters="cluster", items="creator/brand/topic"
           - **COMPLETE METADATA**: Every node MUST include: label, type, val, data{}, evidence
           - **SOURCE REFERENCES**: Every item MUST show where it came from (provenance field)
           - **ANSWER THE QUERY FULLY**: Ensure tree structure directly answers the user's question
        
        7. **⚠️ STRICT DATA GROUNDING (MANDATORY):**
           - **WHITELIST ONLY**: You may ONLY return entities that explicitly appear in the provided Context Data.
           - **NO EXTERNAL KNOWLEDGE**: Do not use "general knowledge" to fill in gaps. If it's not in the context, it doesn't exist for this analysis.
           - **ID MAPPING**: Every output node must be traceable back to a specific [ID: ...] in the context.
           - **ANTI-HALLUCINATION**: If you cannot find a match for a requested category, return an empty list. DO NOT invent examples.
           - **PROVENANCE**: Every item MUST have a 'provenance' field indicating exactly which context item it came from.
    `;

  switch (mode) {
    case 'structure':
      return `
    ** ROLE: THE ARCHITECT **
      Your job is to define the "Shape" of the analysis.
            1. Identify 6 - 8 distinct ** Clusters ** (Tribes) based on the data.
            2. Identify 5 - 10 major ** Topics **.

    ${baseConstraints}



    ** JSON SCHEMA:**
  {
    "root": { 
      "label": "Analysis Root",
      "type": "main",
      "children": [{ "label": "Cluster Name", "type": "cluster", "data": { "description": "...", "keywords": [...] } }] 
    },
    "analytics": {
      "clusters": [], // Flattened list of clusters
      "topics": [],
      "vibeDescription": "..."
    }
  }

  `;

    case 'creators':
      return `
    ** ROLE: THE TALENT SCOUT **
      Your job is to find the Rising Stars and Influencers in this dataset.
            1. Extract ** AS MANY AS THE DATA SUPPORTS (Target: ${targetCount}+) Creators ** from the Context.
            2. Focus on "Rising Stars"(high engagement, growing) over established celebs.
            3. ** MANDATORY **: You MUST include 'citation', 'evidenceSource', 'sourceUrl', and 'evidence' for every creator.

    ${baseConstraints}

    ** JSON SCHEMA:**
      {
        "creators": [
          { "label": "Name", "handle": "@handle", "val": 20, "data": { "bio": "...", "profilePicUrl": "...", "followers": 123, "evidence": "..." }, "provenance": "[ID: 12345]" }
        ]
      }
        `;

    case 'brands':
      return `
      ** ROLE: THE BRAND HUNTER **
        Your job is to find the Brands and Products mentioned or followed by this audience.
            1. Extract ** AS MANY AS THE DATA SUPPORTS (Target: ${targetCount}+) Brands ** from the Context.
            2. Look for "Freq: X" signals in the context(accounts followed by multiple people).
            3. ** MANDATORY **: You MUST include 'citation', 'evidence' for every brand.
            4. ** CRITICAL **: Every brand MUST have a "handle" (e.g., @redbulluk) extracted exactly from the context. If you find a brand mention but no handle, search the context for any @username that seems to represent that brand.

    ${baseConstraints}

    ** JSON SCHEMA:**
      {
        "brands": [
          { "label": "Brand Name", "handle": "@handle", "val": 20, "data": { "bio": "...", "profilePicUrl": "...", "affinity": 0.8 }, "provenance": "[ID: 12345]" }
        ]
      }
        `;

    case 'content':
      return `
      ** ROLE: THE CURATOR **
        Your job is to find the most Viral and Representative Content.
            1. Extract ** 15 Top Posts ** from the Context.
            2. Focus on posts with high engagement or perfect relevance to "${query}".
            3. ** MANDATORY **: You MUST include 'mediaUrl' and 'postUrl'.

    ${baseConstraints}

    ** JSON SCHEMA:**
      {
        "topContent": [
          { "label": "Caption/Title", "val": 30, "data": { "mediaUrl": "...", "postUrl": "...", "caption": "..." } }
        ]
      }
        `;

    case 'full':
    default:
      return `
    ** ROLE: THE LEAD ANALYST **
      Your job is to perform a COMPREHENSIVE deep dive analysis.
            1. ** STRUCTURE **: Identify 6-8 Clusters and 5-10 Topics.
            2. ** CREATORS **: Extract ALL significant Creators (Target: ${targetCount}+).
            3. ** BRANDS **: Extract ALL significant Brands (Target: ${targetCount}+).
            4. ** CONTENT **: Extract 10 Representative Posts.
            5. ** SUBCULTURES **: Explicitly identify "Rising Subcultures" as a subset of topics or clusters.
            6. ** ENFORCEMENT **: For every "creator" and "brand" node, ensure the "handle" field is populated with the exact @username from the context. This is what connects the AI node to real data.

    ${baseConstraints}

    ** CRITICAL: YOU MUST FILL ALL FIELDS **

    ** JSON SCHEMA:**
  {
    "root": { 
      "label": "Analysis Root",
      "type": "main",
      "children": [{ "label": "Cluster Name", "type": "cluster", "data": { "description": "...", "keywords": [...] }, "children": [] }] 
    },
    "analytics": {
      "clusters": [], 
      "topics": [{ "label": "Topic Name", "val": 20, "type": "topic" }],
      "subtopics": [{ "label": "Subculture Name", "val": 20, "type": "subtopic" }],
      "creators": [{ "label": "Name", "handle": "@handle", "val": 20, "data": { "bio": "...", "profilePicUrl": "...", "evidence": "..." }, "provenance": "[ID: ...]" }],
      "brands": [{ "label": "Name", "handle": "@handle", "val": 20, "data": { "bio": "...", "profilePicUrl": "...", "evidence": "..." }, "provenance": "[ID: ...]" }],
      "topContent": [{ "label": "Caption", "val": 20, "data": { "mediaUrl": "...", "postUrl": "..." } }],
      "vibeDescription": "..."
    }
  }

  `;

  }
};


// Helper: Custom Instructions per Intent
const getIntentSpecificInstructions = (intent: string, query: string, platform: string, targetCount: number = 20, useVisualTheme: boolean = false): string => {
  switch (intent) {
    case 'influencer_identification':
    case 'bio_search':
      return `
        ** PRIORITY **: Focus heavily on the 'creators' list.
        - TARGET: Identify AS MANY AS THE DATA SUPPORTS (Target: ${targetCount}+) SPECIFIC profiles.
        - ** DATA SOURCE **: The CONTEXT DATA contains scraped profiles with bios, follower counts, and posts.
        - ** EXTRACTION METHOD **:
      1. Scan the context for profiles matching bio keywords or search terms
      2. Prioritize profiles with high follower counts from the context
      3. Extract EXACT metrics(followers, following, posts) from the context data
      4. Include profilePicUrl and latestPosts from the context
        - ** Rich Analytics **: For each creator, estimate their 'growth_stage'(e.g. "Rising", "Established", "Viral Anomaly").
        - Ensure 'evidence' quotes the specific bio text or post content that matches.
      `;
    case 'brand_affinity':
    case 'over_indexing':
      return `
        ** PRIORITY **: Focus heavily on 'brands' and 'creators' that this audience follows.
        - TARGET: Identify AS MANY AS THE DATA SUPPORTS (Target: ${Math.max(50, targetCount)}+) distinct brands / creators.
        - ** DATA SOURCE **: The CONTEXT DATA contains accounts with "(Freq: X)" annotations showing how many people follow them.
        - ** EXTRACTION METHOD **:
          1. Focus on OVER-INDEXED accounts (Freq > 2) - these are the matches found in multiple sub-lists.
          2. Extract brand names from @username fields (e.g., @heineken, @corona)
          3. Mine the biography field for brand mentions, product names, company affiliations
          4. Include EXACT follower counts, bios, and profile pics from the context
        - ** Rich Analytics **:
          - 'affinity_strength': Estimate how strong the connection is (High / Medium / Low) based on frequency in context.
          - 'cult_score': (0 - 10) How "niche" or fanatical is this following ?
        - ** CLUSTERING **:
          - You MUST create a dedicated cluster named "Overindexed Profiles" or "High Affinity Community" for accounts with the highest overlap (highest Freq values).
          - Other clusters should represent consumer segments (e.g., "Luxury Shoppers", "Budget Tech").

    ** JSON SCHEMA:**
        {
          "segments": [
            {
              "cluster_name": "Cluster Name",
              "description": "Description of this consumer segment",
              "brands_creators": [
                { "label": "Name", "handle": "handle", "type": "brand/creator", "cult_score": "1-10", "affinity_strength": "High", "data": { "bio": "...", "followers": 123, "profilePicUrl": "..." } }
              ]
            }
          ]
        }
          `;
    case 'community_analysis':
    case 'micro_cultures':
    case 'general':
    case 'general_map':  // [FIX] Explicit handling for "general map" queries
      return `
        ** PRIORITY **: "Who are the most active micro-communities?"
          - ** DATA SOURCE **: The CONTEXT DATA contains profiles with hashtags, bios, and posts.
        - ** EXTRACTION METHOD **:
      1. Group profiles by shared hashtags and bio keywords
      2. Identify distinct clusters(e.g., "Cozy Gamers", "Luxury Travelers")
      3. For each cluster, extract ALL relevant active profiles from the context(Do not arbitrarily restrict if data is good).
      4. Include their profilePicUrl, bio, metrics, and latestPosts from context data
        - ** CLUSTERS **: Identify distinct "Micro-Communities"(groups of people with shared aesthetics / hashtags).
        - ** IMPORTANT **: For each community, you MUST list the ** Top 10 - 20 Representative Profiles ** from the Context Data.
        - ** MEDIA **: You MUST include the 'profilePicUrl' and a representative 'latestPosts' image for the community leaders.
        - ** TOPICS **: What do they talk about ? List hashtags / themes AND cite 1 - 2 examples of source support(e.g. "Used by @userX").
        - ** CRITICAL **: You MUST create a RICH tree with as many clusters and nodes as the data supports(minimum 50 +).
      `;
    case 'sensitivity_analysis':
    case 'audience_overlap':
      return `
        ** PRIORITY **: Identify potential risks and overlaps.
        - ** DATA SOURCE **: The CONTEXT DATA contains posts, captions, and hashtags.
        - ** EXTRACTION METHOD **:
      1. Scan post captions and hashtags for controversial topics
          2. Identify creators with polarizing content
      3. Extract EXACT quotes from posts as evidence
        - Highlight controversial topics or creators with supporting evidence from the context.
      `;
    case 'subject_matter':
    case 'viral_content':
    case 'content_analysis':
    case 'trends':
      return `
          ** PRIORITY **: Focus heavily on 'topics', 'subtopics', and 'topContent'.
        - TARGET: Identify AS MANY AS DATA SUPPORTS (Target: ${Math.max(20, Math.ceil(targetCount * 0.8))}+) distinct topics.
        - ** DATA SOURCE **: The CONTEXT DATA contains posts with captions, hashtags, and engagement metrics(likes, comments).
        - ** EXTRACTION METHOD **:
      1. Extract hashtags from the context posts(ignore generic ones like #fyp, #viral)
      2. Analyze post captions for conversation themes and topics
      3. Prioritize posts with high engagement(likesCount, commentsCount)
      4. For each topic, include the top 3 - 5 posts from context as 'topContent' with media URLs
      5. Extract creators and brands mentioned in the top content captions
      6. ** MANDATORY EVIDENCE **: For every Topic or Subtopic, you MUST provide 'source_evidence'.
         - Example: "Mentioned by @userA, @userB" or "Seen in post by @userC regarding X".
         - If you cannot find specific evidence in the context, DO NOT create the topic.

        - 'Clusters' should represent conversation themes.
        - ** IMPORTANT **: Also identify Key Opinion Leaders(Creators) and Brands driving these topics from the context data.
        
        ** JSON SCHEMA UPDATE **:
        Ensure topics / subtopics have: { "label": "Topic", "data": { "source_evidence": "Cited text...", "count": 12 } }
      `;
    case 'network_clusters':
      return `
        ** PRIORITY **: Focus heavily on 'clusters'.
        - TARGET: Identify AS MANY AS DATA SUPPORTS (Target: ${Math.max(15, Math.ceil(targetCount * 0.6))}+) distinct sub - communities.
        - ** DATA SOURCE **: The CONTEXT DATA contains profiles with hashtags, bios, and follower lists.
        - ** EXTRACTION METHOD **:
      1. Group profiles by shared hashtags and bio keywords
      2. Look for "Related Profiles" field in context(shows micro - community connections)
          3. For each cluster, extract representative profiles with full data from context
        - Identify distinct sub - communities or 'tribes' within the audience.
        - Name them creatively(e.g. "Cozy Gamers", "Streetwear Resellers").
      `;
    case 'lexicon_analysis':
      return `
        ** PRIORITY **: Focus heavily on 'lexicon'.
        - ** DATA SOURCE **: The CONTEXT DATA contains post captions and comments.
        - ** EXTRACTION METHOD **:
      1. Scan captions for unique slang, acronyms, or community - specific terms
      2. Look for repeated phrases or expressions across multiple posts
      3. Extract EXACT quotes as examples
        - Identify unique slang, undefined acronyms, or community - specific terms in the posts.
        - Provide definitions and examples for each term.
      `;
    case 'sentiment_analysis':
    case 'comparison':
      return `
        ** PRIORITY **: Focus heavily on 'vibeDescription' and 'sentimentScore'.
        - ** DATA SOURCE **: The CONTEXT DATA contains post captions and engagement patterns.
        - ** EXTRACTION METHOD **:
      1. Analyze the tone and language in post captions
      2. Look for patterns in emoji usage, caps lock, exclamation points
      3. Extract representative quotes that capture the mood
        - Analyze the emotional tone of the provided posts.
        - Is the community optimistic, cynical, hype - driven, or critical ?
        - Provide a 'vibeDescription' that captures the mood with supporting quotes from context.
      `;
    case 'geo_discovery':
      return `
          ** PRIORITY **: Focus heavily on geographic distribution.
        - ** DATA SOURCE **: The CONTEXT DATA contains profile location / city data in bios.
        - ** EXTRACTION METHOD **:
      1. Extract location mentions from biography fields
      2. Count frequency of each city / region
      3. Create clusters for top cities with representative profiles from each location
        - Identify the top cities and regions where the audience is based.
        - For each location, include sample profiles with their full data from context.
      `;
    case 'brands':
      return `
        **PRIORITY**: Identify BRANDS mentioned by the community.
        - **DATA SOURCE**: The CONTEXT DATA contains user bios and post captions.
        - **SCORING**: Score = Number of unique profiles mentioning the brand.
        - **EXTRACTION METHOD**:
          1. Scan all 'caption' (including bio) fields in the CONTEXT DATA.
          2. Extract Brand Names (e.g., @nike, #gucci, "wearing Zara").
          3. Count unique occurrences.
          4. **MANDATORY EVIDENCE**: For each brand, you MUST cite the specific users who mentioned it.
             - Format: "Mentioned by @user1 (bio), @user2 (post)".
             - SourceUrl: Link to one of the mentioning profiles.
        
        **OUTPUT GOAL**: List top 20 brands with their mention counts.
      `;
    default:
      return `
        **PRIORITY**: Balanced analysis across all categories - CREATE A RICH, DETAILED TREE.
        - **DATA SOURCE**: The CONTEXT DATA contains rich profile data, posts, hashtags, and engagement metrics.
        - **UNIVERSAL EXTRACTION RULES**:
          1. ALWAYS extract data from the CONTEXT DATA first.
          2. **SCORING**: For Brands and Trends, your scores MUST be based on the COUNT of mentions in the context.
          3. Use EXACT metrics (followers, likes, comments) from the context - do not estimate.
          4. Include profilePicUrl, bio, and latestPosts for every profile.
          5. Quote EXACT text from bios / captions as evidence.
        
        - **MINIMUM REQUIREMENTS**:
          - AT LEAST 10-15 distinct clusters / communities.
          - AT LEAST 5-10 creators / brands per cluster.
          - TOTAL MINIMUM 50+ nodes (excluding the main node).
          - Each node MUST have rich data (bio, profile pic, posts).
          - Identify rising stars, challenger brands, and emerging trends.
          
        - **CRITICAL**: Use the scraped data extensively. Do NOT return minimal trees.
      `;
  }
};

export const generateGeminiContent = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { temperature: 0.0 }
  });
  return response.text || "";
};

export const generateMarketingQuestionsPrompt = (): string => {
  return `
You are an expert marketing strategist and cultural trend forecaster.
    Generate exactly 8 diverse, specific, and high-value marketing questions that a brand manager or strategist would want to ask a "Fandom Mapper" tool.

    CRITICAL REQUIREMENTS:
    1. **Feasibility**: All questions must be answerable by mapping social graphs, analyzing hashtags, or finding audience overlaps.
    2. **Trend-Aware**: Incorporate CURRENT real-world trends, brands, subcultures, and aesthetics (e.g., from 2024-2025 culture).
    3. **Diversity**: Mix the following types of questions randomly:
       - **Brand vs Brand**: Competitor audience overlap (e.g., @nike vs @newbalance).
       - **Subculture Discovery**: Niche communities (e.g., #gorpcore, #cozygaming).
       - **Trend Analysis**: Emerging behaviors or aesthetics.
       - **Influencer Mapping**: Finding bridge creators or key opinion leaders.
       - **Cross-Over Clusters**: Unexpected connections (e.g., Formula 1 fans x Luxury Watches).

    Format the output as a raw JSON array of strings. Do not include markdown formatting or explanations.

    Examples of the style and tone required:
    [
      "Which micro-influencers are bridging the gap between #streetwear and #sustainability?",
      "Map the audience overlap between @skims and @savagexfenty to find uncaptured segments.",
      "What are the emerging aesthetics within the #booktok community right now?",
      "Analyze the core fandom clusters of @formula1 and luxury watch brands.",
      "Which gaming creators over-index with the #wellness and #selfcare audience?",
      "Map the connection between @duolingo followers and chaotic internet humor accounts.",
      "What are the dominant subcultures driving the #y2kfashion revival on TikTok?",
      "Identify the key tastemakers in the rising #slowliving movement."
    ]
        `.trim();
};