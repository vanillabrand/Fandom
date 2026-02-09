
import React, { useState, useEffect } from 'react';
import {
    DatasetSummary,
    MapGenerationPlan,
    DashboardConfig,
    Dataset
} from '../../types.js';
import { getAllDatasets, getDataset } from '../../services/datasetService.js';
import { DynamicDashboard } from './dashboard/DynamicDashboard.js';
import { ExecutionProgress } from './wizard/ExecutionProgress.js'; // [NEW]
import { BalanceWarning } from './wizard/BalanceWarning.js';
import { Loader2, DollarSign, Play, CheckCircle, AlertTriangle, Users, Sparkles, Database, Activity } from 'lucide-react';
import { toast } from 'sonner';
import FandomGraph from './FandomGraph.js';
import { fetchFollowerCount } from '../../services/apifyScraperService.js'; // Import capability
import { ScottyErrorScreen } from './ScottyErrorScreen.js';

interface MapWizardProps {
    onClose: () => void;
    onMapReady: (data: any) => void;
    onJobSubmitted?: () => void; // Callback to open Activity Center
}

const MapWizardComponent: React.FC<MapWizardProps> = ({ onClose, onMapReady, onJobSubmitted }) => {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [query, setQuery] = useState('');
    // Debounce Query to prevent rapid-fire checks on partial typing
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    useEffect(() => {
        const handler = setTimeout(() => {
            // MEMORY PROTECTION: Limit query length when debouncing
            setDebouncedQuery(query.length > 2000 ? query.slice(0, 2000) : query);
        }, 600); // 600ms debounce
        return () => clearTimeout(handler);
    }, [query]);

    const [sampleSize, setSampleSize] = useState(100);
    const [manualOverwrite, setManualOverwrite] = useState(false);
    // Fix: Stale closure ref
    const manualOverwriteRef = React.useRef(false);
    useEffect(() => { manualOverwriteRef.current = manualOverwrite; }, [manualOverwrite]);

    const [ignoreCache, setIgnoreCache] = useState(false);
    const [useDeepAnalysis, setUseDeepAnalysis] = useState(false); // [NEW] Deep Analysis Flag
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // New State for Dynamic Detection
    const [verifiedProfiles, setVerifiedProfiles] = useState<{ username: string, followers: number }[]>([]);
    const [attemptedProfiles, setAttemptedProfiles] = useState<Set<string>>(new Set());
    // Cache for valid results so we don't re-fetch but can re-display
    const profileCache = React.useRef<Map<string, number>>(new Map());

    const [verifying, setVerifying] = useState(false);

    // Logs
    const [executionLogs, setExecutionLogs] = useState<string[]>([]);
    // Auto-scroll ref
    const logContainerRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll effect
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [executionLogs]);

    const [existingDatasets, setExistingDatasets] = useState<DatasetSummary[]>([]);
    const [plan, setPlan] = useState<MapGenerationPlan | null>(null);
    const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
    const [finalDataset, setFinalDataset] = useState<Dataset | null>(null);

    // [FIX] Missing state for ExecutionProgress
    const [currentStepId, setCurrentStepId] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number>(0);

    // [FIX] Post Depth Limit (Slider State) - Range 1-30
    const [postDepthLimit, setPostDepthLimit] = useState(2);
    const [isReanalyzing, setIsReanalyzing] = useState(false);


    // Initial Load - WITH PAGINATION
    useEffect(() => {
        loadDatasets();
        console.log('[MapWizard] Mounted - loading datasets with pagination');
    }, []);

    const loadDatasets = async () => {
        // Load only 50 recent datasets to prevent timeout (30s limit)
        // Explicitly requesting NO data payload for list view
        const dss = await getAllDatasets({ limit: 50, skip: 0, includeData: false });
        setExistingDatasets(dss.map(d => ({
            id: d.id,
            name: d.name,
            platform: d.platform,
            targetProfile: d.targetProfile,
            dataType: d.dataType as any, // casting for simplicity vs types
            recordCount: d.recordCount,
            createdAt: d.createdAt,
            tags: d.tags
        })));
    };

    // --- DYNAMIC SELECTOR LOGIC ---
    // TEMPORARILY DISABLED: This feature is causing crashes
    // TODO: Redesign this feature to be more performant
    // CRITICAL: Empty dependency array prevents this from running on every keystroke
    useEffect(() => {
        // DISABLED: This useEffect is completely disabled
        // Empty dependency array means it only runs once on mount
        return () => {
            // Cleanup on unmount only
        };
    }, []); // Empty deps - only run once on mount, not on every keystroke

    const updateSampleSize = (profiles: { username: string, followers: number }[]) => {
        if (profiles.length === 0) return;

        const totalFollowers = profiles.reduce((sum, p) => sum + p.followers, 0);
        const suggested = Math.min(Math.ceil(totalFollowers * 0.005), 2000);

        // Only update if user hasn't manually selected (using Ref for async safety)
        if (!manualOverwriteRef.current && suggested > 100) {
            setSampleSize(suggested);
        }
    };
    // ------------------------------

    // Step 1 -> 2: Analyze (Server-Side)
    const handleAnalyze = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('AUTH_TOKEN');
            if (!token) throw new Error("Authentication required. Please log in.");

            const res = await fetch('/api/plan-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    query,
                    sampleSize,
                    postLimit: postDepthLimit,
                    ignoreCache,
                    useDeepAnalysis
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to generate plan');
            }

            const { plan: newPlan } = await res.json();
            setPlan(newPlan);

            // [FIX] Use slider value directly, do not overwrite with "Inverse Scaling"
            setStep(2);

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // [NEW] Debounced Re-Analysis Effect (Triggered by slider changes)
    useEffect(() => {
        if (step !== 2 || !plan || loading) return;

        const timer = setTimeout(() => {
            handleRequote();
        }, 800);

        return () => clearTimeout(timer);
    }, [sampleSize, postDepthLimit]);

    const handleRequote = async () => {
        if (!query.trim() || loading) return;
        setIsReanalyzing(true);

        try {
            const token = localStorage.getItem('AUTH_TOKEN');
            if (!token) throw new Error("Authentication required.");

            const res = await fetch('/api/plan-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    query,
                    sampleSize,
                    postLimit: postDepthLimit, // Use current slider value
                    ignoreCache,
                    useDeepAnalysis
                })
            });

            if (res.ok) {
                const { plan: newPlan } = await res.json();
                setPlan(newPlan);
            }
        } catch (e: any) {
            console.error("[Requote Error]", e);
        } finally {
            setIsReanalyzing(false);
        }
    };

    // Step 2 -> 3: Execute (Server-Side)
    const handleExecute = async () => {
        if (!plan) return;
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('AUTH_TOKEN');
            if (!token) throw new Error("Authentication required. Please log in.");

            // [FIX] Recalculate if cache is valid based on depth slider
            const reusedIds = plan.existingDatasetIds || [];
            const savedDepth = reusedIds.length > 0 && plan.reusedDatasetDetails?.[reusedIds[0]]
                ? plan.reusedDatasetDetails[reusedIds[0]]
                : null;

            // If valid (slider <= saved), then respect user's checkbox.
            // If invalid (slider > saved), FORCE ignoreCache to true.
            const savedDepthValue = typeof savedDepth === 'object' && savedDepth !== null ? (savedDepth as any).depth : savedDepth;
            const depthMismatch = savedDepthValue !== null && postDepthLimit > savedDepthValue;
            const effectiveIgnoreCache = ignoreCache || depthMismatch;

            const res = await fetch('/api/orchestration', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    query,
                    sampleSize,
                    postLimit: postDepthLimit, // [FIX] Send Post Limit Separately
                    ignoreCache: effectiveIgnoreCache
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to start job');
            }

            const { jobId } = await res.json();
            console.log("Job started:", jobId);

            // Show success toast with Activity Center icon
            toast.success(
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <div>
                        <div className="font-semibold">Job Added to Activity Center</div>
                        <div className="text-xs opacity-80">You'll be notified by email when it's ready</div>
                    </div>
                </div>,
                { duration: 5000 }
            );

            // Close wizard
            onClose();

            // Open Activity Center automatically
            if (onJobSubmitted) {
                setTimeout(() => onJobSubmitted(), 300);
            }

        } catch (e: any) {
            console.error("Job submission failed:", e);

            // Handle 402 Payment Required with helpful message
            if (e.message.includes('Insufficient balance') || e.message.includes('402')) {
                setError('💳 Insufficient Balance: Please top up your account in Profile → Overview to continue.');
            } else {
                setError(e.message);
            }
        } finally {
            setLoading(false);
        }
    };

    // Render Step 1
    // [Check for Scotty Error]
    if (error && (
        error.toLowerCase().includes('usage limit') ||
        error.toLowerCase().includes('quota') ||
        error.toLowerCase().includes('hard limit')
    )) {
        return <ScottyErrorScreen onRetry={() => setError(null)} />;
    }

    if (step === 1) {
        return (
            <div className="bg-[#050B14] p-8 rounded-lg border border-[#1A2C42] max-w-2xl mx-auto mt-10">
                <h2 className="text-2xl font-bold text-white mb-2">Intelligent Fandom Mapper</h2>
                <p className="text-gray-400 mb-6">Describe what you want to map. The system will analyse existing data and recommend necessary scrapes.</p>

                <textarea
                    className="w-full bg-[#0F1A2A] border border-[#1A2C42] rounded p-4 text-white focus:border-emerald-500 outline-none mb-4 min-h-[100px]"
                    placeholder="e.g. Map the rising subcultures of @nike fans on Instagram..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />

                <div className="flex items-center gap-4 mb-6">
                    <label className="text-gray-400 text-sm font-medium">Sample Size:</label>
                    <div className="relative">
                        <select
                            value={sampleSize}
                            onChange={(e) => {
                                setSampleSize(Number(e.target.value));
                                setManualOverwrite(true);
                            }}
                            className="bg-[#0F1A2A] border border-[#1A2C42] text-white rounded px-3 py-1.5 focus:border-emerald-500 outline-none text-sm pr-10 appearance-none min-w-[200px]"
                        >
                            {verifiedProfiles.length === 0 && (
                                <>
                                    <option value={100}>100 records (Quick Scan)</option>
                                    <option value={500}>500 records (Standard)</option>
                                    <option value={1000}>1,000 records (Deep Dive)</option>
                                    <option value={5000}>5,000 records (Full Map)</option>
                                </>
                            )}

                            {verifiedProfiles.length > 0 && (() => {
                                const total = verifiedProfiles.reduce((acc, p) => acc + p.followers, 0);
                                return (
                                    <>
                                        <option value={100}>Micro (100) - For Testing</option>
                                        <option value={Math.floor(total * 0.005)}>Representative (0.5% - ~{Math.floor(total * 0.005)})</option>
                                        <option value={Math.min(Math.floor(total * 0.05), 5000)}>Deep Dive (5% - ~{Math.min(Math.floor(total * 0.05), 5000)})</option>
                                        <option value={10000}>Max Cap (10k)</option>
                                    </>
                                );
                            })()}
                        </select>
                        {/* Custom Arrow */}
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                    </div>

                    {/* Verification Badge */}
                    {verifying && <span className="text-xs text-yellow-500 animate-pulse flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Verifying...</span>}

                    {verifiedProfiles.length > 0 && Array.from(new Set(verifiedProfiles.map(p => p.username)))
                        .map(username => verifiedProfiles.find(p => p.username === username)!)
                        .map(vp => (
                            <div key={vp.username} className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded px-2 py-1">
                                <Users size={12} className="text-emerald-400" />
                                <span className="text-xs text-emerald-400 font-mono">
                                    @{vp.username}: {((vp.followers || 0) / 1000).toFixed(1)}k
                                </span>
                            </div>
                        ))}
                </div>

                <div className="flex items-center gap-2 mb-6">
                    <input
                        type="checkbox"
                        id="ignoreCache"
                        checked={ignoreCache}
                        onChange={e => setIgnoreCache(e.target.checked)}
                        className="rounded border-gray-600 bg-[#0F1A2A] text-emerald-500 focus:ring-emerald-500"
                    />
                    <label htmlFor="ignoreCache" className="text-gray-400 text-sm cursor-pointer flex items-center gap-1">
                        <AlertTriangle size={14} className="text-amber-500/80" />
                        Force Fresh Scrape (Ignore existing datasets)
                    </label>
                </div>

                {/* Deep Analysis Toggle */}
                <div className="flex items-center gap-2 mb-6">
                    <input
                        type="checkbox"
                        id="useDeepAnalysis"
                        checked={useDeepAnalysis}
                        onChange={e => setUseDeepAnalysis(e.target.checked)}
                        className="rounded border-gray-600 bg-[#0F1A2A] text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="useDeepAnalysis" className="text-gray-400 text-sm cursor-pointer flex items-center gap-1">
                        <Sparkles size={14} className="text-purple-500/80" />
                        Enable Deep Semantic Analysis (Scrapes Content & Posts)
                    </label>
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                    <button
                        onClick={handleAnalyze}
                        disabled={loading || !query.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : "Analyse Requirements"}
                    </button>
                </div>
                {error && <div className="mt-4 text-red-500 bg-red-900/20 p-3 rounded">{error}</div>}
            </div>
        );
    }

    // Render Step 2: Plan Approval
    if (step === 2 && plan) {
        // [FIXED] Removed conditional hook. State is now top-level.

        // Calculate dynamic cost scaling factor

        // [FIX] Smart Estimation Logic (Client-Side Mirror of Orchestrator)
        const calculateStepEstimates = (s: any, currentSize: number) => {
            const actorId = (s.actorId || s.actor || '').toLowerCase();

            let newRecords = 0;
            // Robust Actor Detection (Slugs or Hashes)
            const isApiScraper = actorId.includes('api-scraper') ||
                actorId.includes('instagram-scraper') ||
                actorId === 'owbucwzk5meeo5xic';

            const isFollowersScraper = actorId.includes('followers-followings') ||
                actorId.includes('thenetaji') ||
                actorId === 'asijo32nquuhp4fnc';

            // [NEW] Proportional Scaling Logic
            const baselineS = (plan as any).baselineSampleSize || sampleSize;
            const baselineP = (plan as any).baselinePostLimit || postDepthLimit;

            const sampleRatio = sampleSize / baselineS;
            const depthRatio = postDepthLimit / baselineP;

            if (isApiScraper) {
                // For API Scraper, scale by both sample and depth
                newRecords = (s.estimatedRecords || (baselineS * baselineP)) * sampleRatio * depthRatio;
            } else if (isFollowersScraper) {
                const isSecondary = s.stepId === 'step_2' || (s.description && s.description.toLowerCase().includes('who those follow'));
                if (isSecondary) {
                    const limit = sampleSize <= 100 ? 20 : (sampleSize <= 500 ? 10 : 3);
                    newRecords = sampleSize * limit;
                } else {
                    newRecords = (s.estimatedRecords || baselineS) * sampleRatio;
                }
            } else {
                newRecords = (s.estimatedRecords || baselineS) * sampleRatio;
            }

            // Calculate new cost
            // [FIX] Use originalCost fallback if estimatedCost is 0 (cached)
            const baseCostForRef = s.originalCost !== undefined ? s.originalCost : (s.estimatedCost || 0);
            const baseRecordsForRef = s.estimatedRecords || 1;
            let estimatedUnitCost = baseCostForRef / baseRecordsForRef || 0.005;

            // Avoid NaN
            if (!isFinite(estimatedUnitCost)) estimatedUnitCost = 0;

            const newCost = newRecords * estimatedUnitCost;

            return { newRecords, newCost };
        };

        // [NEW] Check if current slider exceeds saved depth (invalidates reuse)
        const reusedIds = plan.existingDatasetIds || [];
        const savedDepth = reusedIds.length > 0 && plan.reusedDatasetDetails?.[reusedIds[0]]
            ? plan.reusedDatasetDetails[reusedIds[0]]
            : null;

        // If we have a saved depth and the user asks for MORE, we treat it as a fresh scrape (cache invalid)
        // If no saved depth, we assume cache is valid directly (or backend handled it).
        const savedDepthValue = (plan as any).cachedDepth ?? (typeof savedDepth === 'object' && savedDepth !== null ? (savedDepth as any).depth : savedDepth);
        const savedCount = (plan as any).cachedRecordCount || (typeof savedDepth === 'object' && savedDepth !== null ? (savedDepth as any).recordCount : 0);

        // Result is fully cached (free) ONLY if both depth and count fit within saved limits
        const depthOk = savedDepthValue !== null ? postDepthLimit <= savedDepthValue : true;
        const countOk = savedCount > 0 ? sampleSize <= savedCount : true;
        const resultIsCached = depthOk && countOk && (reusedIds.length > 0);

        // Recalculate Total Cost based on individual step behavior
        let dynamicCost = 0;
        const processedSteps = (plan.steps || []).map(s => {
            const { newRecords, newCost } = calculateStepEstimates(s, sampleSize);

            // Logic: If result is cached AND this step is the source of that cache, cost is 0.
            // But 'calculateStepEstimates' returns the *potential* cost.
            // If resultIsCached is true, we override to 0 for reused steps.

            // Simplified: If we have existing datasets AND resultIsCached is true, assume total cost is reduced.
            // But we need to know WHICH steps are cached.
            // Usually step 1/2 are reused.
            // Let's assume if existingDatasetIds > 0, steps matching those IDs are free.
            // BUT, if resultIsCached is false, NOTHING is free.

            let finalStepCost = newCost;
            if (s.cached || s.stepId === 'reuse_step') {
                if (resultIsCached) {
                    finalStepCost = 0;
                } else {
                    const base = s.estimatedRecords || 1;
                    const billable = Math.max(0, newRecords - base);
                    finalStepCost = billable * (newCost / newRecords);
                }
            }

            dynamicCost += finalStepCost;
            return { ...s, dynamicRecords: newRecords, dynamicCost: finalStepCost };
        });

        // [NEW] Add base orchestration fee (matching backend logic)
        const baseOrchestrationFee = resultIsCached ? 0 : 2.50;
        const FULL_ORCHESTRATION_FEE = 2.50;

        if (!resultIsCached) {
            dynamicCost += baseOrchestrationFee;
        }

        // Calculate potential savings for MapWizard too
        let potentialFullCost = 0;
        processedSteps.forEach(s => {
            const baseCost = s.originalCost !== undefined ? s.originalCost : (s.estimatedCost || 0.01);
            const baseRecs = s.estimatedRecords || 1;
            const unitPrice = baseCost / baseRecs || 0.005;
            potentialFullCost += (s.dynamicRecords * unitPrice);
        });

        // Potential savings is (Cost of Fresh Scrape - Actual Cost)
        const savings = Math.max(0, (potentialFullCost + FULL_ORCHESTRATION_FEE) - dynamicCost);

        // Consolidate stats for display
        const stats = {
            cost: dynamicCost,
            totalRecords: processedSteps.reduce((acc, s) => acc + s.dynamicRecords, 0),
            savings: savings,
            saved: resultIsCached
        };

        return (
            <div className="bg-[#050B14] p-8 rounded-lg border border-[#1A2C42] max-w-3xl mx-auto mt-10">
                <h2 className="text-xl font-bold text-white mb-4">Orchestration Plan</h2>

                <div className="bg-[#0F1A2A] p-4 rounded border border-[#1A2C42] mb-6">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-emerald-400 font-mono">INTENT: {plan.intent?.toUpperCase() || 'UNKNOWN'}</h3>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white flex items-center justify-end gap-1">
                                <DollarSign size={20} className="text-emerald-500" />
                                {isReanalyzing ? (
                                    <span className="animate-pulse text-emerald-500/50">...</span>
                                ) : (
                                    stats.cost.toFixed(2)
                                )}
                            </div>
                            <div className="text-xs text-gray-500">
                                {stats.savings > 0.01 && stats.cost > 0 ? (
                                    <span className="text-emerald-500 font-bold italic">
                                        Saved ${stats.savings.toFixed(2)} vs fresh scrape
                                    </span>
                                ) : "Est. Total Cost (Adjusted)"}
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-300 text-sm mb-4">{plan.reasoning}</p>

                    {/* Reused Datasets Section */}
                    {plan.existingDatasetIds && plan.existingDatasetIds.length > 0 && (resultIsCached || stats.savings > 0.01) && (
                        <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-500/30 rounded">
                            <div className="flex items-center gap-2 mb-2">
                                <Database size={16} className="text-emerald-400" />
                                <span className="text-emerald-400 font-semibold text-sm">
                                    {resultIsCached ? "Reusing Existing Data" : "Partial Cache Reconciliation"}
                                </span>
                                <span className="ml-auto text-emerald-300 font-mono text-xs">${stats.savings.toFixed(2)} Saved</span>
                            </div>
                            <div className="text-xs text-gray-400 text-pretty">
                                {resultIsCached
                                    ? `Full match found in cache (${plan.existingDatasetIds.length} datasets) - no new scraping needed.`
                                    : `Partial match found. Reusing ${stats.savings.toFixed(2)} worth of data and only scraping the difference.`
                                }
                            </div>
                            {savedDepthValue !== null && <div className="text-xs text-emerald-500/80 mt-1">Found Depth: {savedDepthValue} items</div>}
                        </div>
                    )}

                    {/* Cache Invalidation Warning */}
                    {plan.existingDatasetIds && plan.existingDatasetIds.length > 0 && !resultIsCached && (
                        <div className="mb-4 p-3 bg-amber-900/20 border border-amber-500/30 rounded">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle size={16} className="text-amber-400" />
                                <span className="text-amber-400 font-semibold text-sm">Fresh Scrape Required</span>
                            </div>
                            <div className="text-xs text-gray-400">
                                Requested depth ({postDepthLimit}) exceeds saved data ({savedDepthValue}). A new scrape will be performed.
                            </div>
                        </div>
                    )}

                    {/* Proportional Following Configuration */}
                    <div className="mb-6 p-4 bg-blue-900/10 border border-blue-500/30 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-blue-400 font-medium text-sm flex items-center gap-2">
                                <Users size={16} />
                                Post/Comment Scrape Depth
                            </label>
                            <span className="text-blue-300 font-mono font-bold">{postDepthLimit} items</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="30"
                            step="1"
                            value={postDepthLimit}
                            onChange={(e) => {
                                setPostDepthLimit(Number(e.target.value));
                            }}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>1 (Min)</span>
                            <span>30 (Max)</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            Limits the number of posts/comments scraped per profile (Max 30).
                        </p>
                    </div>

                    {/* Scraping Steps Section */}
                    <div className="space-y-3">
                        {processedSteps.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-[#050B14] p-3 rounded border border-[#1A2C42]">
                                <div className="text-emerald-500 font-bold w-6">{idx + 1}</div>
                                <div className="flex-1">
                                    <div className="text-white text-sm font-medium">{s.description}</div>
                                    <div className="text-xs text-gray-500">
                                        Actor: {s.actorId} • {s.dynamicRecords.toLocaleString()} records
                                    </div>
                                </div>
                                <div className="text-gray-400 text-sm font-mono">
                                    ${s.dynamicCost.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Balance Warning - Shows cost estimate and balance check */}
                <BalanceWarning estimatedCost={dynamicCost} />

                <div className="flex justify-end gap-3">
                    <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-400 hover:text-white">Back</button>
                    <button
                        onClick={handleExecute}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded flex items-center gap-2"
                    >
                        <Play size={18} fill="currentColor" /> Approve & Execute
                    </button>
                </div>
            </div>
        );
    }

    // Render Step 3: Execution (Visual Progress)
    if (step === 3 && plan) {
        return (
            <div className="fixed inset-0 bg-[#051810] z-50 p-8 flex flex-col">
                <div className="max-w-6xl mx-auto w-full h-full flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 select-none">
                                <Sparkles className="h-6 w-6 text-emerald-400" />
                                <div className="font-bold text-lg tracking-tight text-white">Fandom Mapper</div>
                            </div>
                            <div className="h-6 w-px bg-gray-700 mx-2"></div>
                            <h2 className="text-xl font-light text-gray-300">System Orchestration</h2>
                        </div>
                        <button disabled className="text-slate-500 cursor-not-allowed font-mono animate-pulse">
                            RUNNING...
                        </button>
                    </div>

                    <div className="flex-1 min-h-0">
                        <ExecutionProgress
                            steps={plan.steps}
                            currentStepId={currentStepId}
                            logs={executionLogs}
                            startTime={startTime}
                            onCancel={() => setStep(1)} // Reset to start
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Render Step 4: Dashboard
    if (step === 4 && dashboardConfig) {
        return (
            <div className="fixed inset-0 bg-[#051810] index-50 overflow-hidden flex flex-col">
                <div className="bg-[#050B14] border-b border-[#1A2C42] p-4 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 select-none">
                            <Sparkles className="h-6 w-6 text-emerald-400" />
                            <div className="font-bold text-lg tracking-tight text-white">Fandom Mapper</div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">← Exit Dashboard</button>
                            <h1 className="text-white font-bold">{query}</h1>
                        </div>
                    </div>
                    <div className="text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle size={14} /> Analysis Complete
                    </div>
                </div>
                <div className="flex-1 overflow-hidden">
                    <DynamicDashboard config={dashboardConfig} />
                </div>
            </div>
        );
    }

    return null;
};

// Export memoized version to prevent unnecessary re-renders
export const MapWizard = React.memo(MapWizardComponent);
