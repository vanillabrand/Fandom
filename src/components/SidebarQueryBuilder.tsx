
import React, { useState, useEffect } from 'react';
import { DatasetSummary, MapGenerationPlan, DashboardConfig, Dataset } from '../../types.js';
import { getAllDatasets } from '../../services/datasetService.js';
import { ExecutionProgress } from './wizard/ExecutionProgress.js';
import { BalanceWarning } from './wizard/BalanceWarning.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, DollarSign, Play, AlertTriangle, Users, Sparkles, Activity, Search, Info, X } from 'lucide-react';
import { toast } from 'sonner';
import { ScottyErrorScreen } from './ScottyErrorScreen.js';

interface SidebarQueryBuilderProps {
    onMapReady: (data: any) => void;
    onJobSubmitted?: () => void;
    onStepChange?: (step: number) => void;
}

export const SidebarQueryBuilder: React.FC<SidebarQueryBuilderProps> = ({ onMapReady, onJobSubmitted, onStepChange }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState<1 | 2 | 3>(1); // Step 4 (Dashboard) removed as we stay in main view

    // Notify parent whenever step changes
    useEffect(() => {
        if (onStepChange) onStepChange(step);
    }, [step, onStepChange]);
    const [query, setQuery] = useState('');
    const [sampleSize, setSampleSize] = useState(100);
    const [manualOverwrite, setManualOverwrite] = useState(false);
    const manualOverwriteRef = React.useRef(false);
    const [ignoreCache, setIgnoreCache] = useState(false);
    const [useDeepAnalysis, setUseDeepAnalysis] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [plan, setPlan] = useState<MapGenerationPlan | null>(null);
    const [postDepthLimit, setPostDepthLimit] = useState(2);

    // Execution State
    const [executionLogs, setExecutionLogs] = useState<string[]>([]);
    const [currentStepId, setCurrentStepId] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number>(0);

    // [NEW] Plan Details Overlay State
    const [showPlanDetails, setShowPlanDetails] = useState(false);
    const [isReanalyzing, setIsReanalyzing] = useState(false);

    // State for marketing questions and placeholder
    const [marketingQuestions, setMarketingQuestions] = useState<string[]>([]);
    const [placeholder, setPlaceholder] = useState("e.g. Map the rising subcultures of @nike fans...");
    const [isInputFocused, setIsInputFocused] = useState(false);

    // Fetch questions on mount
    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const res = await fetch('/api/marketing-questions');
                if (res.ok) {
                    const questions = await res.json();
                    if (Array.isArray(questions) && questions.length > 0) {
                        setMarketingQuestions(questions);
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch marketing questions", err);
            }
        };
        fetchQuestions();
    }, []);

    // [NEW] Handle pre-filled query from Landing Page
    useEffect(() => {
        if (location.state && (location.state as any).prefillQuery) {
            setQuery((location.state as any).prefillQuery);
            // Clear location state to prevent re-filling on refresh/navigation
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname]);

    // Typewriter Effect Logic
    useEffect(() => {
        if (isInputFocused || marketingQuestions.length === 0) return;

        let currentIndex = 0;
        let isDeleting = false;
        let txt = '';
        let timer: NodeJS.Timeout;

        const type = () => {
            const currentQuestion = marketingQuestions[currentIndex];

            if (isDeleting) {
                txt = currentQuestion.substring(0, txt.length - 1);
            } else {
                txt = currentQuestion.substring(0, txt.length + 1);
            }

            setPlaceholder(txt);

            let typeSpeed = 50;
            if (isDeleting) typeSpeed /= 2;

            if (!isDeleting && txt === currentQuestion) {
                typeSpeed = 3000; // Pause at end
                isDeleting = true;
            } else if (isDeleting && txt === '') {
                isDeleting = false;
                currentIndex = (currentIndex + 1) % marketingQuestions.length;
                typeSpeed = 500;
            }

            timer = setTimeout(type, typeSpeed);
        };

        timer = setTimeout(type, 100);

        return () => clearTimeout(timer);
    }, [isInputFocused, marketingQuestions]);

    useEffect(() => { manualOverwriteRef.current = manualOverwrite; }, [manualOverwrite]);

    // Analyze (Step 1 -> 2)
    const handleAnalyze = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('AUTH_TOKEN');
            if (!token) throw new Error("Authentication required.");

            const res = await fetch('/api/plan-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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

            const { plan } = await res.json();
            setPlan(plan);

            // [FIX] Use slider value directly, do not overwrite with "Inverse Scaling"
            // The depth is now authoritative from the slider/backend default.
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
    // Execute (Step 2 -> 3)
    const handleExecute = async () => {
        if (!plan) return;
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('AUTH_TOKEN');
            if (!token) throw new Error("Authentication required.");

            const reusedIds = plan.existingDatasetIds || [];
            const details = reusedIds.length > 0 && plan.reusedDatasetDetails?.[reusedIds[0]]
                ? plan.reusedDatasetDetails[reusedIds[0]] : null;
            const savedDepth = details ? (typeof details === 'object' ? details.depth : details) : null;

            const depthMismatch = savedDepth !== null && postDepthLimit > (savedDepth as number);
            const effectiveIgnoreCache = ignoreCache || depthMismatch;

            const res = await fetch('/api/orchestration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    query,
                    sampleSize,
                    postLimit: postDepthLimit,
                    ignoreCache: effectiveIgnoreCache,
                    plan: plan
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to start job');
            }

            const { jobId } = await res.json();

            toast.success(
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <div>
                        <div className="font-semibold">Job Added to Activity Center</div>
                        <div className="text-xs opacity-80">You'll be notified by email when it's ready</div>
                    </div>
                </div>
            );

            // Reset UI
            setStep(1);
            setQuery('');

            // Trigger Activity Center open
            if (onJobSubmitted) onJobSubmitted();

        } catch (e: any) {
            if (e.message.includes('Insufficient balance') || e.message.includes('402')) {
                setError('💳 Insufficient Balance: Please top up account.');
            } else {
                setError(e.message);
            }
        } finally {
            setLoading(false);
        }
    };

    // Render Helpers
    const calculateStats = () => {
        if (!plan) return { records: 0, cost: 0, saved: false, breakdown: [], savings: 0, orchestrationFee: 0 };
        let totalBillableCost = 0;
        let potentialFullCost = 0;
        let totalRecords = 0;
        const reusedIds = plan.existingDatasetIds || [];

        // [ENHANCED] Cache Detection: Check both depth AND record count if available
        let resultIsCached = false;
        if (reusedIds.length > 0) {
            const firstDatasetId = reusedIds[0];
            const details = plan.reusedDatasetDetails?.[firstDatasetId] as any;
            const savedDepth = (plan as any).cachedDepth ?? (details ? (typeof details === 'object' ? details.depth : details) : null);
            const savedCount = (plan as any).cachedRecordCount ?? (details ? (typeof details === 'object' ? details.recordCount : 0) : 0);
            const depthOk = savedDepth !== null ? postDepthLimit <= savedDepth : true;
            const countOk = savedCount > 0 ? sampleSize <= savedCount : true;
            resultIsCached = depthOk && countOk;
        }

        const breakdown: any[] = [];

        (plan.steps || []).forEach(s => {
            const actorId = (s.actorId || s.actor || '').toLowerCase();
            // [FIX] Use plan baseline if available, otherwise fall back to current slider values
            const baselineS = (plan as any).baselineSampleSize ?? sampleSize;
            const baselineP = (plan as any).baselinePostLimit ?? postDepthLimit;
            const sampleRatio = sampleSize / baselineS;
            const depthRatio = postDepthLimit / baselineP;

            let records = s.estimatedRecords || sampleSize;

            // Robust Actor Detection
            const isApiScraper = actorId.includes('api-scraper') || actorId.includes('instagram-scraper') || actorId === 'owbucwzk5meeo5xic';
            const isFollowersScraper = actorId.includes('followers-followings') || actorId.includes('thenetaji') || actorId === 'asijo32nquuhp4fnc';

            if (isApiScraper) {
                // [FIX] Only apply depthRatio to POST scrapes, not profile scrapes
                const isPostScrape = s.input?.resultsType === 'posts' || (s.description && s.description.toLowerCase().includes('posts'));

                if (isPostScrape) {
                    records = (s.estimatedRecords || (baselineS * baselineP)) * sampleRatio * depthRatio;
                } else {
                    // Profile scrape -> Scale by sample size only
                    records = (s.estimatedRecords || baselineS) * sampleRatio;
                }
            } else if (isFollowersScraper) {
                const isSecondary = s.stepId === 'step_2' || (s.description && s.description.toLowerCase().includes('who those follow'));
                if (isSecondary) {
                    const limit = sampleSize <= 100 ? 20 : (sampleSize <= 500 ? 10 : 3);
                    records = sampleSize * limit;
                } else {
                    records = (s.estimatedRecords || baselineS) * sampleRatio;
                }
            } else {
                records = (s.estimatedRecords || baselineS) * sampleRatio;
            }

            const baseCostForRef = s.originalCost !== undefined ? s.originalCost : (s.estimatedCost || 0.01);
            const baseRecordsForRef = s.estimatedRecords || 1;
            const unitPrice = baseCostForRef / baseRecordsForRef || 0.005;

            let billableRecords = records;
            if (s.cached || s.stepId === 'reuse_step') {
                if (resultIsCached) {
                    billableRecords = 0;
                } else {
                    const base = s.estimatedRecords || 1;
                    billableRecords = Math.max(0, records - base);
                }
            }

            let cost = billableRecords * unitPrice;
            if (!isFinite(cost)) cost = 0;

            totalBillableCost += cost;
            potentialFullCost += (records * unitPrice);
            totalRecords += records;

            breakdown.push({
                name: s.description,
                cost: cost,
                records: records
            });
        });

        // [NEW] Add base orchestration fee
        const baseOrchestrationFee = resultIsCached ? 0 : 2.50;
        const FULL_ORCHESTRATION_FEE = 2.50;

        if (!resultIsCached) {
            totalBillableCost += baseOrchestrationFee;
        }
        potentialFullCost += FULL_ORCHESTRATION_FEE;

        const savings = Math.max(0, potentialFullCost - totalBillableCost);

        return {
            records: totalRecords,
            cost: Number(totalBillableCost.toFixed(2)),
            saved: resultIsCached,
            orchestrationFee: baseOrchestrationFee,
            savings: savings
        };
    };


    if (error && (
        error.toLowerCase().includes('usage limit') ||
        error.toLowerCase().includes('quota') ||
        error.toLowerCase().includes('hard limit')
    )) {
        return <ScottyErrorScreen onRetry={() => setError(null)} />;
    }

    // --- STEP 1: INPUT ---
    if (step === 1) {
        return (
            <div className="flex flex-col gap-6">
                {/* Query Input */}
                <div className="relative group space-y-3">
                    <p className="text-xs text-emerald-400/80 leading-relaxed font-light">
                        Enter your query and select a fresh scrape if needed. You can adjust the sample size on the next page.
                    </p>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={isInputFocused ? '' : placeholder}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        className="w-full bg-[#0a1f16] text-white placeholder-emerald-500/30 text-sm font-medium p-4 rounded-lg border border-emerald-500/20 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none h-[161px] transition-all shadow-inner"
                    />
                </div>

                {/* Controls Grid */}
                <div className="grid grid-cols-1 gap-6">

                    {/* Toggles - Compact Row */}
                    <div className="flex flex-col gap-4 px-1">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={ignoreCache}
                                        onChange={e => setIgnoreCache(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-emerald-500/30 bg-[#0a1f16] text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                                    />
                                    <span className="text-[10px] font-bold text-emerald-400/70 group-hover:text-emerald-400 transition-colors">Fresh scrape</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={useDeepAnalysis}
                                        onChange={e => setUseDeepAnalysis(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-emerald-500/30 bg-[#0a1f16] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <div className="flex items-center gap-1">
                                        <Sparkles size={10} className="text-purple-400" />
                                        <span className="text-[10px] font-bold text-emerald-400/70 group-hover:text-purple-400 transition-colors">Deep analysis</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Analysis Button */}
                <button
                    onClick={handleAnalyze}
                    disabled={loading || !query.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 mt-3"
                >
                    {loading ? <Loader2 className="animate-spin" size={14} /> : (
                        <>
                            <Search size={14} strokeWidth={2.5} /> Analyze requirements
                        </>
                    )}
                </button>

                {error && <div className="text-xs text-red-300 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</div>}
            </div>
        );
    }

    // --- STEP 2: PLAN REVIEW ---
    if (step === 2 && plan) {
        const stats = calculateStats();

        return (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-[#0a1f16] border border-emerald-500/30 rounded-lg p-4 relative overflow-hidden">

                    <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-bold text-white">Plan Generated</h3>
                        <button
                            onClick={() => setShowPlanDetails(true)}
                            className="text-emerald-500 hover:text-emerald-400 p-1 hover:bg-emerald-900/30 rounded transition-colors"
                            title="View Full Strategy"
                        >
                            <Info size={14} />
                        </button>
                    </div>
                    <div className="text-xs text-emerald-400 font-mono mb-3">{plan.intent?.toUpperCase()}</div>

                    <div className="flex justify-between items-end mb-3">
                        <div className="flex flex-col">
                            <div className="text-2xl font-bold text-white flex items-center gap-0.5">
                                <DollarSign size={18} className="text-emerald-500" />
                                {isReanalyzing ? (
                                    <span className="animate-pulse text-emerald-500/50">...</span>
                                ) : (
                                    (stats.saved && !ignoreCache ? "0.00" : stats.cost.toFixed(2))
                                )}
                            </div>
                            {stats.savings > 0.01 && !stats.saved && !ignoreCache && (
                                <div className="text-[10px] text-emerald-500/80 font-bold ml-1 uppercase tracking-tighter">
                                    Partial Savings: ${stats.savings.toFixed(2)}
                                </div>
                            )}
                        </div>
                        {stats.saved && !ignoreCache && (
                            <div className="text-[10px] text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold uppercase">
                                Full Reuse (Free)
                            </div>
                        )}
                    </div>



                    {/* Adjustable Parameters */}
                    <div className="space-y-3 mb-4">
                        {/* Sample Size Adjuster */}
                        <div className="bg-black/20 rounded-lg p-3 border border-emerald-500/10 transition-all hover:border-emerald-500/30">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Sample Size</label>
                                <span className="text-[10px] text-emerald-100 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">{sampleSize} profiles</span>
                            </div>
                            <select
                                value={sampleSize}
                                onChange={(e) => setSampleSize(Number(e.target.value))}
                                className="w-full bg-black/40 border border-emerald-500/20 rounded-md px-2.5 py-2 text-white text-xs outline-none cursor-pointer hover:border-emerald-500/50 transition-all font-medium appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:14px] bg-[right_8px_center] bg-no-repeat shadow-lg"
                            >
                                <option value={100} className="bg-[#051810]">100 (Quick)</option>
                                <option value={500} className="bg-[#051810]">500 (Standard)</option>
                                <option value={1000} className="bg-[#051810]">1000 (Deep Scan)</option>
                                <option value={5000} className="bg-[#051810]">5000 (Maximum)</option>
                            </select>
                        </div>

                        {/* Scrape Depth Slider */}
                        <div className="bg-black/20 rounded-lg p-3 border border-emerald-500/10 transition-all hover:border-emerald-500/30">
                            <div className="flex justify-between items-center mb-2 text-[10px]">
                                <label className="text-emerald-400 font-bold uppercase tracking-wider">Scrape Depth</label>
                                <span className="text-emerald-100 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">{postDepthLimit} posts/user</span>
                            </div>
                            <input
                                type="range"
                                min="1" max="30" step="1"
                                value={postDepthLimit}
                                onChange={(e) => setPostDepthLimit(Number(e.target.value))}
                                className="w-full h-1 bg-gray-700/50 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 mt-2"
                            />
                        </div>
                    </div>
                </div>

                <BalanceWarning estimatedCost={stats.saved && !ignoreCache ? 0 : stats.cost} />

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setStep(1)}
                        className="bg-[#0F1A2A] hover:bg-[#1A2C42] text-gray-400 hover:text-white py-2 rounded-lg text-xs font-medium transition-colors border border-[#1A2C42]"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleExecute}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-lg shadow-emerald-900/20"
                    >
                        {loading ? <Loader2 className="animate-spin" size={14} /> : (
                            <>
                                <Play size={14} fill="currentColor" />
                                {stats.saved && !ignoreCache ? "Reuse (Free)" : "Execute"}
                            </>
                        )}
                    </button>
                </div>


                {/* Plan Details Overlay */}
                {showPlanDetails && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPlanDetails(false)}>
                        <div
                            className="bg-[#022c22] border border-emerald-500/50 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowPlanDetails(false)}
                                className="absolute right-4 top-4 text-emerald-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <h3 className="text-2xl font-thin text-white mb-6">Strategy</h3>

                            <div className="prose prose-invert prose-emerald max-w-none">
                                <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                                    {plan.reasoning}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
};
