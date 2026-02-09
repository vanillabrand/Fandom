export interface Node {
  id: string;
  group: 'main' | 'creator' | 'brand' | 'cluster' | 'topic' | 'subtopic' | 'nonRelatedInterest' | 'overindexed' | 'concept' | 'topic_composite' | 'hashtag' | 'influencer' | 'user' | 'company' | 'evidence' | 'evidence_post';
  val: number; // Size
  size?: number; // [FIX] Optional fallback for D3 size
  label: string;
  level?: number;
  parentId?: string;
  sentiment?: number; // -1 to 1
  emotion?: string;
  isInsight?: boolean;
  color?: string; // Hex color override
  value?: number; // Raw metric value (e.g. occurrences, count)
  username?: string; // Instagram/TikTok username for profile nodes
  profilePic?: string; // [FIX] Profile Picture for Texture Mapping
  externalUrl?: string; // Link to external profile (Instagram, TikTok, etc.)
  provenance?: { // [NEW] Data Provenance
    source: string; // e.g. "dataset_123" or "inference"
    method: string; // e.g. "scraped" or "derived"
    tool?: string;   // e.g. "google-search", "gemini-2.0-flash", "apify/instagram-scraper"
    context?: string; // Exact text match, snippet, or post content
    query?: string;   // The search query or input parameters used
    calculation?: string; // E.g. "followers * 0.1", "overindex_score > 2.0"
    externalId?: string; // Scrape Run ID or Record ID
    steps?: string[]; // Transformation history
    timestamp?: Date;
    confidence?: number;
    evidence?: any[]; // Source evidence (text excerpts, posts, etc.)

    // [NEW] Detailed calculation tracking
    calculationDetails?: {
      type: string;              // 'overindexing', 'clustering', 'ai_analysis', 'topic_extraction'
      formula: string;            // Human-readable formula
      steps: CalculationStep[];   // Detailed breakdown
      datasets: DatasetReference[]; // Source datasets
    };
  };
  data?: any; // [NEW] Attached raw data for detailed inspection
}

// [NEW] Calculation step interface
export interface CalculationStep {
  description: string;  // "Calculate follower overlap"
  formula?: string;     // "intersection(A, B)"
  input?: any;          // { setA: 1500, setB: 2000 }
  output?: any;         // { overlap: 450 }
  datasetRefs?: string[]; // References to datasets used
  tool?: string;
  method?: string;
}

// [NEW] Dataset reference interface
export interface DatasetReference {
  id: string;
  label: string;        // "Nike Followers"
  platform: string;
  recordCount: number;
  createdAt: Date;
  description?: string; // "500 most recent followers"
}

export interface Link {
  source: string;
  target: string;
  value: number;
}

export interface FandomData {
  nodes: Node[];
  links: Link[];
  analytics: {
    creators: { name: string; score: number; category: string; provenance?: any; username?: string; url?: string; label?: string; title?: string }[];
    brands: { name: string; score: number; industry: string; provenance?: any; username?: string; url?: string; label?: string; title?: string }[];
    clusters: { name: string; count: number; keywords: string[]; provenance?: any; label?: string; title?: string }[];
    topics: any[]; // [NEW] Trending Topics
    subtopics: any[]; // [NEW] Emerging Subcultures
    topContent: any[]; // [NEW] Top Content / Posts
    nonRelatedInterests: { name: string; percentage: string }[];
    overindexedAccounts: OverindexedAccount[];
    overindexing?: OverindexingResult; // [FIX] Added to match runtime data
    visualAnalysis?: {
      aestheticTags: string[];
      vibeDescription: string;
      colorPalette: string[];
      lexicon?: { term: string; definition: string; example: string; category: string; popularity: number }[];
      geoData?: { name: string; count: number; lat: number; lng: number }[];
    };
    visualTheme?: {
      archetype?: string;
      nodeTypeMapping?: Record<string, string>;
      models?: Array<{ id: string; objData: string; svgIcon: string }>; // [NEW] Dynamic AI Models
      primaryColor: string;
      textureStyle: string;
    };
  };
  summary: string;
  profileImage?: string;
  profileFullName?: string;
  comparisonMetadata?: {
    creators: any[];
    brands: any[];
    clusters: any[];
    topics: any[];
    nonRelatedInterests: any[];
    topContent: any[];
  };
  profileDetails?: ProfileDetails;
  data?: any[]; // Raw records for drill-down/enrichment lookups
  qualityScore?: number;
  confidenceScore?: number;
  accuracyMetrics?: {
    completeness: number;
    relevance: number;
    freshness: number;
    provenance: number;
  };
  lowConfidenceAreas?: string[];
}

export interface ProfileDetails {
  biography?: string;
  externalUrl?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  isVerified?: boolean;
  isPrivate?: boolean;
  profilePicUrlHD?: string;
  profilePicUrl?: string; // [NEW] Fallback/Standard
  fullName?: string;      // [NEW] Display Name
  isBusinessAccount?: boolean; // [NEW] Business account status
  engagementRate?: number;    // [NEW] Calculated engagement rate
}

export interface SavedMap {
  id: string;
  name: string;
  date: string;
  data: FandomData;
  config: {
    profile: string;
    platform: 'instagram' | 'tiktok';
    inputType: 'profile' | 'hashtag';
    sampleSize: number;
  };
  publicId?: string; // [NEW] Link to shared public map
}

// ============================================
// DATASET TYPES
// ============================================

export type DatasetType = 'followers' | 'following' | 'posts' | 'profiles' | 'overindexed' | 'composite' | 'bio_search' | 'topic_analysis' | 'comparison' | 'geo_discovery';
export type DatasetPlatform = 'instagram' | 'tiktok';

export interface DatasetSource {
  id: string;
  type: DatasetType;
  actorId: string;
  scrapedAt: Date;
  recordCount: number;
  params: Record<string, any>;
  cost?: number;
}

export interface VectorIndex {
  enabled: boolean;
  status: 'pending' | 'indexing' | 'ready' | 'failed';
  lastIndexedAt?: Date;
  vectorCount: number;
  embeddingModel: string; // e.g., 'gemini-embedding-001'
  dimensions: number;     // e.g., 768
}

export interface Dataset {
  id: string;
  name: string;
  platform: DatasetPlatform;
  targetProfile: string;

  // Composite support: a dataset can contain multiple types
  dataType: DatasetType | 'composite';
  sources: DatasetSource[];

  createdAt: Date;
  updatedAt: Date;
  recordCount: number;

  project?: string;
  tags: string[];
  autoTags: string[];
  queriesUsedFor: string[];

  data: any[];

  // Vector search support
  vectorIndex?: VectorIndex;

  // Legacy metadata support (kept for backward compatibility, mapped from primary source)
  metadata: {
    sourceActor: string;
    scrapeTimestamp: Date;
    scrapeParams: Record<string, any>;
    estimatedCompleteness: number;
    warning?: string;
    targetProfilePic?: string; // [FIX] Store profile image URL in metadata
    analytics?: OverindexingResult; // Analytics results for overindexing queries
  };

  // Analytics Result (Composite Graph Support)
  analytics?: OverindexingResult;
}

export interface VectorMatch {
  datasetId: string;
  recordIndex: number;
  score: number; // Cosine similarity 0-1
  text: string;  // The text chunk matched
  metadata?: any;
}

export interface VectorSearchResult {
  matches: VectorMatch[];
  totalCandidates: number;
  inferenceTime: number;
}

export interface DatasetSearchCriteria {
  platform?: DatasetPlatform;
  targetProfile?: string;
  dataType?: DatasetType;
  project?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  query?: string;                // Free text search
  minAgeHours?: number;          // Max age in hours for cache validity
}

export interface DatasetSummary {
  id: string;
  name: string;
  platform: DatasetPlatform;
  targetProfile: string;
  dataType: DatasetType;
  recordCount: number;
  createdAt: Date;
  tags: string[];
}

// ============================================
// QUERY VALIDATION TYPES
// ============================================

export type ApproachType = 'dataset' | 'ai' | 'search' | 'hybrid';

export interface QueryAnalysis {
  originalQuery: string;
  intent: string;                // Parsed intent
  requiredDataTypes: DatasetType[];
  targetProfile?: string;
  platform?: DatasetPlatform;
}

export interface DatasetMatch {
  dataset: DatasetSummary;
  relevanceScore: number;        // 0-100
  coverageScore: number;         // 0-100 how much of query it can answer
  reasoning: string;
}

export interface AccuracyIndicator {
  score: number;                 // 0-100
  level: 'low' | 'medium' | 'high';
  factors: string[];             // Reasons for the score
}

export interface SuccessProbability {
  probability: number;           // 0-100
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export interface ApproachSuggestion {
  type: ApproachType;
  weight: number;                // How much this approach contributes
  description: string;
  requiredDataset?: {
    platform: DatasetPlatform;
    dataType: DatasetType;
    targetProfile: string;
    estimatedRecords: number;
  };
}

export interface QueryValidationResult {
  query: QueryAnalysis;
  matchingDatasets: DatasetMatch[];
  accuracy: AccuracyIndicator;
  successProbability: SuccessProbability;
  suggestedApproaches: ApproachSuggestion[];
  canProceed: boolean;
  warnings: string[];
}

// ============================================
// OVER-INDEXING TYPES
// ============================================

export interface OverindexedAccount {
  username: string;
  platform: DatasetPlatform;
  fullName?: string;
  profilePicUrl?: string;
  followerCount?: number;
  category: 'creator' | 'brand' | 'media' | 'other';
  frequency: number;             // How many times appears in followers' following
  percentage: number;            // Percentage of sampled followers who follow this
  overindexScore: number;        // Score relative to baseline (>1 = overindexed)
  bio?: string;
  url?: string;                  // Instagram profile URL
  provenance?: any; // Data provenance for reasoning display
}

export interface OverindexingResult {
  targetProfile: string;
  platform: DatasetPlatform;
  followersSampled: number;
  followingAnalyzed: number;
  calculatedAt: Date;
  topCreators: OverindexedAccount[];
  topBrands: OverindexedAccount[];
  topMedia: OverindexedAccount[];
  clusters: {
    name: string;
    accounts: OverindexedAccount[];
    commonKeywords: string[];
  }[];
  matches?: any[]; // Semantic extraction matches
  topContent?: any[];
  visualAnalysis?: any;
  nonRelatedInterests?: any[];
}

// ============================================
// APIFY TYPES
// ============================================

export interface ApifyActorConfig {
  actorId: string;
  name: string;
  platform: DatasetPlatform;
  dataTypes: DatasetType[];
  defaultInput: Record<string, any>;
  costPerThousand: number;       // Estimated cost per 1000 records
}

export type ScrapeJobState = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted';

export interface ScrapeJobStatus {
  runId: string;
  actorId: string;
  state: ScrapeJobState;
  startedAt?: Date;
  finishedAt?: Date;
  itemCount: number;
  datasetId?: string;
  errorMessage?: string;
  progress?: number;             // 0-100 if available
}

export interface ScrapeRequest {
  platform: DatasetPlatform;
  targetProfile: string;
  dataType: DatasetType;
  limit?: number;
  options?: Record<string, any>;
}

export interface ScrapeCostEstimate {
  actorId: string;
  estimatedRecords: number;
  estimatedCredits: number;
  estimatedTimeMinutes: number;
  warning?: string;
}

// ============================================
// ORCHESTRATION & DASHBOARD TYPES
// ============================================

export interface ScrapePlanStep {
  id: string;
  stepId?: string; // [FIX] AI sometimes uses stepId instead of id
  actor?: string; // [FIX] AI sometimes uses actor instead of actorId
  description: string;
  actorId: string;
  input: any; // The exact JSON payload for the actor
  estimatedRecords: number;
  estimatedCost: number;
  originalCost?: number; // [NEW] Used for dynamic quote recalculation when cached
  reasoning: string;
  dependsOnStepId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  resultDatasetId?: string; // Where the result is stored
  cached?: boolean; // [NEW] Whether this step was served from cache
  savedCost?: number; // [NEW] Cost saved by reusing cache
  dynamicRecords?: number; // [NEW] Proportional records for UI
  dynamicCost?: number; // [NEW] Proportional cost for UI
}

export interface MapGenerationPlan {
  query: string;
  intent: string;
  steps: ScrapePlanStep[];
  existingDatasetIds: string[];
  totalEstimatedCost: number;
  totalEstimatedTime: number;
  reasoning: string;
  filter?: {
    bioKeywords?: string[];
    minFollowers?: number;
    maxFollowers?: number;
    minFollowing?: number;
  };
  ignoreCache?: boolean;
  reusedDatasetDetails?: Record<string, { depth: number; recordCount: number }>; // [NEW] Map of datasetID -> metadata
  baselineSampleSize?: number; // [NEW] Used for proportional scaling
  baselinePostLimit?: number; // [NEW] Used for proportional scaling
  cachedRecordCount?: number; // [NEW] Sum of records in reused datasets
  cachedDepth?: number; // [NEW] Max depth across reused datasets
}

export type DashboardLayoutType = 'full-map' | 'split-vertical' | 'content-grid' | 'analytics-focus' | 'map-accordion-split';

export interface DashboardWidget {
  id: string;
  type: 'FandomGraph' | 'PostGallery' | 'MetricCard' | 'ClusterList' | 'SourceTrace' | 'ChartPanel' | 'Pulse' | 'Leaderboard' | 'ContentGrid' | 'EntityInspector' | 'ProfileMetricsPanel' | 'OverindexedList' | 'AccordionList';
  chartType?: 'bar' | 'line';
  xAxisKey?: string;
  dataKey?: string;
  title: string;
  data: any;
  colSpan?: number;
  rowSpan?: number;
}

export interface DashboardConfig {
  id?: string;
  title?: string;
  description?: string;
  layout: DashboardLayoutType;
  widgets: DashboardWidget[];
  primaryMetric?: {
    label: string;
    value: string | number;
  };
}

export interface Transaction {
  id: string;
  date: Date;
  type: 'AI' | 'SCRAPE' | 'SEARCH';
  cost: number;
  description: string;
  metadata?: any;
}

// ============================================
// JOB TYPES (Async)
// ============================================

export interface Job {
  id: string;
  userId: string;
  type: 'map_generation' | 'enrichment' | 'export' | 'ai_analysis' | 'orchestration';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
  progress: number;
  result?: {
    datasetId?: string;
    error?: string;
    stage?: string;
    errorType?: string; // [NEW] Added for Scotty Error Screen
    hasRestrictedContent?: boolean; // [NEW] 21+ Warning
    flags?: any;
    qualityScore?: number;
    confidenceScore?: number;
    accuracyMetrics?: {
      completeness: number;
      relevance: number;
      freshness: number;
      provenance: number;
    };
  };
  error?: string; // Top level error
  createdAt: Date | string;
  updatedAt: Date | string;
  metadata?: any;
}

export interface JobResult {
  datasetId?: string;
  message?: string;
  plan?: MapGenerationPlan;
  stage?: string;
}