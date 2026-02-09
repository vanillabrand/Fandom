import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Loader2, AlertCircle, PanelLeftClose, PanelLeftOpen, Sparkles, Save, Trash2, RefreshCw, Play, Share2, HelpCircle, Search, Activity, Download, Settings, LayoutDashboard, FolderOpen, ChevronRight, Heart } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SidebarQueryBuilder } from './SidebarQueryBuilder.js';
import { SavedMapsModal } from './SavedMapsModal.js';
// [PERFORMANCE] Lazy load heavy components
import { LazyFandomGraph3D, LazyAnalyticsPanel } from './LazyComponents.js';
import GraphErrorBoundary from './GraphErrorBoundary.js'; // [P0] Error boundary for 3D graph
import GraphLegend from './GraphLegend.js';
import { MapWizard } from './MapWizard.js';
import { ActivityCenter } from './ActivityCenter.js';
import { BudgetDisplay } from './budget/BudgetDisplay.js';
// import { DynamicDashboard } from './dashboard/DynamicDashboard.js'; // [REMOVED]
import { ScottyErrorScreen } from './ScottyErrorScreen.js'; // [NEW] Import Scotty Screen
import { ProgressGraph } from './ProgressGraph.js'; // [NEW] Import Progress Graph
import { fetchFandomAnalysis } from '../../services/geminiService.js';
import { FandomData, SavedMap, Job } from '../../types.js';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext.js';
import { ExportMenu } from './ExportMenu.js'; // [NEW] Export Menu

// Custom TikTok Icon
const TikTokIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 1 0 1-.05V9.6l.06.03V2h3.41A9.66 9.66 0 0 0 17.41 6.69h2.18Z" />
    </svg>
);

const loadSavedConfig = () => {
    try {
        const saved = localStorage.getItem('FANDOM_CONFIG');
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.error("Failed to load saved config", e);
        return {};
    }
};

// [REMOVED] LocalStorage Helper
// const loadSavedMaps = (): SavedMap[] => { ... }

export const Dashboard = () => {
    const { user, logout, token, refreshProfile } = useAuth();

    // Load initial config once on mount
    const [initialConfig] = useState(loadSavedConfig);

    const [profile, setProfile] = useState(initialConfig.profile || 'underarmourfc');
    const [inputType, setInputType] = useState<'profile' | 'hashtag'>(initialConfig.inputType || 'profile');
    const [platform, setPlatform] = useState<'instagram' | 'tiktok'>(initialConfig.platform || 'instagram');
    // Default to 100 for quick maps. Cap loaded config at 100 to prevent legacy "500" from hanging.
    const [sampleSize, setSampleSize] = useState(Math.min(initialConfig.sampleSize || 100, 100));

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<FandomData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false); // [NEW]
    const [queryStep, setQueryStep] = useState(1); // [NEW] Track sidebar step

    // Save/Load State
    const [saveName, setSaveName] = useState("");
    const [savedMaps, setSavedMaps] = useState<SavedMap[]>([]);
    const [currentMapId, setCurrentMapId] = useState<string | null>(null); // [NEW] Track active map ID
    const [showInsight, setShowInsight] = useState(true);

    // [New] Fetch saved maps from MongoDB on mount/auth change
    // [New] Fetch saved maps from MongoDB on mount/auth change
    const [mapSearch, setMapSearch] = useState("");
    const [mapPage, setMapPage] = useState(0);
    const [hasMoreMaps, setHasMoreMaps] = useState(true);
    const MAPS_LIMIT = 20;

    // [New] Async Job State
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    // [NEW] Track if user manually closed the panel to prevent auto-reopening on updates
    const [hasUserClosedActivity, setHasUserClosedActivity] = useState(false);
    const activeJobsCount = jobs.filter(j => ['queued', 'running'].includes(j.status)).length;

    // [NEW] Dynamic Config State - REMOVED
    // const [dashboardConfig, setDashboardConfig] = useState<any | null>(null);

    const [showApifyError, setShowApifyError] = useState(false); // [NEW] State for Scotty Screen

    // [NEW] Ref for PDF Capture
    const dashboardRef = React.useRef<HTMLDivElement>(null);

    // Poll Jobs
    useEffect(() => {
        if (!token) return;

        const pollJobs = async () => {
            try {
                const res = await fetch('/api/jobs?limit=50', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (res.status === 401) {
                    console.warn("[Dashboard] Token expired during poll. Logging out.");
                    logout(); // Stop polling via unmount/redirect
                    return;
                }

                if (res.ok) {
                    const data = await res.json();
                    setJobs(data);

                    // [NEW] Check for Apify Hard Limit Error
                    const hasLimitError = data.some((j: Job) =>
                        j.status === 'failed' &&
                        (j.result?.errorType === 'APIFY_HARD_LIMIT_EXCEEDED' ||
                            (j.result?.error && j.result.error.includes('Monthly usage hard limit exceeded')))
                    );

                    if (hasLimitError) {
                        setShowApifyError(true);
                    }
                }
            } catch (e) {
                console.error("Job poll failed", e);
            }
        };

        pollJobs(); // Initial
        const interval = setInterval(pollJobs, 5000);
        return () => clearInterval(interval);
    }, [token, logout]);

    // [NEW] Track previous jobs to detect completion
    // [NEW] Pulse Animation State
    const [isPulsing, setIsPulsing] = useState(false);
    const prevJobsRef = React.useRef<Job[]>([]);
    const completedJobsRef = React.useRef<Set<string>>(new Set()); // Track already-processed completions

    useEffect(() => {
        // [FIX] Ensure prevJobsRef is ALWAYS updated by moving it to the top
        const prevJobs = prevJobsRef.current;
        prevJobsRef.current = jobs;

        let pulseTimer: NodeJS.Timeout | null = null;

        if (prevJobs.length > 0 && jobs.length > 0) {
            const hasStatusChange = jobs.some(job => {
                const prev = prevJobs.find(p => p.id === job.id);
                // Status changed OR new job added
                return !prev || prev.status !== job.status;
            });

            if (hasStatusChange) {
                // Trigger Pulse (only if activity center is closed)
                if (!isActivityOpen) {
                    setIsPulsing(true);
                }
                pulseTimer = setTimeout(() => setIsPulsing(false), 2000);

                // Check for Completion to Auto-Open
                const prevRunning = prevJobs.filter(j => j.status === 'running').map(j => j.id);
                const currentCompleted = jobs.filter(j => j.status === 'completed').map(j => j.id);
                const justFinished = currentCompleted.filter(id =>
                    prevRunning.includes(id) && !completedJobsRef.current.has(id)
                );

                if (justFinished.length > 0) {
                    // Mark as processed to prevent duplicate logs
                    justFinished.forEach(id => completedJobsRef.current.add(id));

                    console.log("[Dashboard] Job finished. Auto-open?", !hasUserClosedActivity);

                    // Only auto-open if the user hasn't explicitly closed it this session
                    if (!hasUserClosedActivity) {
                        setIsActivityOpen(true);
                    }

                    // Optional: Toast
                    const finishedJob = jobs.find(j => j.id === justFinished[0]);
                    if (finishedJob) {
                        toast.success(`Job completed: ${finishedJob.type.replace('_', ' ')}`);
                    }
                }
            }
        } else if (jobs.length > prevJobs.length && prevJobs.length > 0) {
            // New job started (first time)
            if (!isActivityOpen) {
                setIsPulsing(true);
            }
            pulseTimer = setTimeout(() => setIsPulsing(false), 2000);
        }

        return () => {
            if (pulseTimer) clearTimeout(pulseTimer);
        };
    }, [jobs, isActivityOpen, hasUserClosedActivity]);

    // [NEW] Clear pulse when Activity Center is opened
    useEffect(() => {
        if (isActivityOpen && isPulsing) {
            setIsPulsing(false);
        }
    }, [isActivityOpen]);

    const handleViewResult = async (datasetId: string) => {
        // [GUARD] Prevent redundant loading of the same map
        if (datasetId === currentMapId && data) {
            console.log("[Dashboard] Map already loaded:", datasetId);
            setIsActivityOpen(false);
            return;
        }

        const toastId = toast.loading("Loading result map...");
        try {
            const res = await fetch(`/api/datasets/${datasetId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Result dataset not found");

            const dataset = await res.json();
            console.log("[Dashboard] Dataset received:", dataset);
            console.log("[Dashboard] dataset.data structure:", dataset.data);

            // Handle snapshot vs raw data
            let mapData = null;

            if (Array.isArray(dataset.data)) {
                console.log("[Dashboard] dataset.data is an array, length:", dataset.data.length);

                // 1. Look for a record that HAS nodes/links
                const graphRecord = dataset.data.find((d: any) => d.nodes && d.links);
                // [FIX] Analytics data might not have recordType inside the payload, so duck-type it
                const analyticsRecord = dataset.data.find((d: any) => !d.nodes && (d.creators || d.clusters || d.brands || d.recordType === 'analytics_data'));

                console.log("[Dashboard] Graph Record found:", graphRecord ? "YES" : "NO");
                console.log("[Dashboard] Analytics Record found:", analyticsRecord ? "YES" : "NO");

                if (graphRecord) {
                    mapData = graphRecord;
                    // [FIX] Merge separated analytics into graph data
                    if (analyticsRecord) {
                        console.log("[Dashboard] Merging separated analytics data...", Object.keys(analyticsRecord));
                        if (!mapData.analytics) mapData.analytics = {};

                        // [FIX] Unwrap .data if it exists (Phase 3 aggregation format)
                        const analyticsSource = analyticsRecord.data || analyticsRecord;
                        Object.assign(mapData.analytics, analyticsSource);

                        // [FIX] Ensure summary is accessible at top level for Export/UI
                        if (analyticsSource.summary && !mapData.summary) {
                            mapData.summary = analyticsSource.summary;
                        }
                    }
                }

                // 2. Fallback to first item if it looks like FandomData
                if (!mapData && dataset.data[0]?.nodes) {
                    mapData = dataset.data[0];
                    console.log("[Dashboard] Fallback to first item:", mapData);
                }
            } else if (dataset.data?.nodes) {
                mapData = dataset.data;
                console.log("[Dashboard] dataset.data is an object with nodes");
            }

            console.log("[Dashboard] Final mapData:", mapData);
            console.log("[Dashboard] mapData has nodes?", mapData?.nodes?.length);
            console.log("[Dashboard] mapData has links?", mapData?.links?.length);

            if (mapData && mapData.nodes && mapData.links) {
                console.log("[Dashboard] Setting graph data with", mapData.nodes.length, "nodes and", mapData.links.length, "links");

                // [NEW] Merge accuracy metadata from dataset for UI
                if (dataset.metadata) {
                    mapData.qualityScore = dataset.metadata.qualityScore;
                    mapData.confidenceScore = dataset.metadata.confidenceScore;
                    mapData.accuracyMetrics = dataset.metadata.accuracyMetrics;
                    mapData.lowConfidenceAreas = dataset.metadata.lowConfidenceAreas;
                }

                setData(mapData);
                setProfile(dataset.targetProfile || mapData.profileFullName || profile);
                setPlatform(dataset.platform as any);
                setCurrentMapId(datasetId); // [FIX] Ensure key is updated for fresh load

                // [NEW] Check for Dynamic Dashboard Config - REMOVED
                // We ignore dashboardConfig to force standard Node Map view
                /*
                if (dataset.metadata && dataset.metadata.dashboardConfig) {
                    console.log("[Dashboard] Loaded Dynamic Config:", dataset.metadata.dashboardConfig);
                    const config = dataset.metadata.dashboardConfig;
                    // ...
                    setDashboardConfig(config);
                } else {
                    setDashboardConfig(null);
                }
                */

                setIsActivityOpen(false); // Close panel
                setIsSidebarOpen(false); // [UX] Hide Query Panel
                setIsRightPanelOpen(true); // [UX] Show Analytics Panel
                toast.success("Map loaded!", { id: toastId });
            } else {
                console.error("[Dashboard] No valid graph data found in dataset");
                console.error("[Dashboard] dataset.data:", dataset.data);
                toast.error("Dataset format not supported or contains no graph data.", { id: toastId });
            }

        } catch (e: any) {
            console.error("[Dashboard] Failed to load result:", e);
            toast.error("Failed to load result: " + e.message, { id: toastId });
        }
    };


    const fetchMaps = useCallback(async (page: number, search: string, append: boolean = false) => {
        if (!token) return;

        try {
            const queryParams = new URLSearchParams({
                limit: MAPS_LIMIT.toString(),
                skip: (page * MAPS_LIMIT).toString(),
                excludeTags: 'shared-autosave', // Filter out auto-saves
                tags: 'snapshot' // Only show explicitly saved maps
            });

            if (search.trim()) {
                queryParams.append('search', search.trim());
            }

            const res = await fetch(`/api/datasets?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const datasets = await res.json();

                // Convert to SavedMap
                const maps = datasets.map((d: any) => ({
                    id: d.id,
                    name: d.name,
                    date: new Date(d.createdAt).toLocaleDateString(),
                    data: d.data,
                    config: {
                        profile: d.targetProfile || d.name,
                        platform: d.platform,
                        inputType: d.dataType === 'hashtag' ? 'hashtag' : 'profile',
                        sampleSize: d.recordCount
                    },
                    publicId: d.publicId
                }));

                setSavedMaps(prev => append ? [...prev, ...maps] : maps);
                setHasMoreMaps(maps.length === MAPS_LIMIT);
            }
        } catch (e) {
            console.error("Failed to fetch maps", e);
        }
    }, [token]);

    useEffect(() => {
        if (!token) {
            setSavedMaps([]);
            return;
        }
        // Initial fetch
        fetchMaps(0, "", false);
    }, [token, fetchMaps]);

    // Search Debounce Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (token) {
                setMapPage(0);
                fetchMaps(0, mapSearch, false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [mapSearch, token, fetchMaps]);

    const handleLoadMoreMaps = () => {
        const nextPage = mapPage + 1;
        setMapPage(nextPage);
        fetchMaps(nextPage, mapSearch, true);
    };

    // Save config to local storage whenever it changes
    useEffect(() => {
        const config = {
            profile,
            inputType,
            platform,
            sampleSize
        };
        localStorage.setItem('FANDOM_CONFIG', JSON.stringify(config));
    }, [profile, inputType, platform, sampleSize]);

    const handleMapFandom = async () => {
        if (!token) {
            toast.error("Please log in to generate maps");
            return;
        }

        const toastId = toast.loading("Starting map generation job...");
        try {
            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'ai_analysis',
                    input: {
                        query: profile, // using 'profile' as the query input
                        sampleSize,
                        platform: platform
                    }
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to start job");
            }

            const job = await res.json();
            toast.success("Job started! Tracking in Activity Center.", { id: toastId });
            setHasUserClosedActivity(false); // Reset so user sees this new activity
            setIsActivityOpen(true); // Open panel to show it

            // We don't set 'loading' to true here because it's async.
            // The UI remains interactive.

        } catch (err: any) {
            console.error("Job start failed:", err);
            toast.error(err.message, { id: toastId });
        }
    };

    const handleSaveMap = async () => {
        if (!data || !saveName || !token) {
            if (!token) toast.error("Please login to save maps");
            return;
        }

        const toastId = toast.loading("Saving map to cloud...");

        try {
            // [ADJUSTMENT] Store the graph JSON as ONE record with type 'snapshot'.
            const payload = {
                id: currentMapId || crypto.randomUUID(), // Update if existing? For now, 'Save' usually implies new unless 'Update'. 
                // Let's assume Save always creates NEW unless we add 'Update' UI. 
                // But if we want to "Save this share link", we need a stable ID.
                // Let's generate a NEW ID if we are typing a name.
                // If we are "Saving Changes", we might want to keep ID.
                // For simplicity: Save New Map = New ID.
                name: saveName,
                platform,
                targetProfile: inputType === 'profile' ? profile : saveName,
                dataType: inputType,
                recordCount: data.nodes.length,
                tags: ['snapshot'],
                data: [{
                    recordType: 'graph_snapshot',
                    data: data // Correctly wrap in 'data' field for mongoService aggregation
                }]
            };

            // Force ID if we are "updating" logic? 
            // Current UI is "Save As" style (Input box). 
            // So we always create new.
            const newId = crypto.randomUUID();
            payload.id = newId;

            const res = await fetch('/api/datasets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to save");

            toast.success("Map saved to database!", { id: toastId });
            setSaveName("");
            setCurrentMapId(newId); // Set active

            // Refresh list
            const newMap: SavedMap = {
                id: newId,
                name: saveName,
                date: new Date().toLocaleDateString(),
                data: data,
                config: { profile, platform, inputType, sampleSize }
            };
            setSavedMaps(prev => [newMap, ...prev]);

        } catch (e: any) {
            console.error(e);
            toast.error("Save failed: " + e.message, { id: toastId });
        }
    };

    const handleLoadMap = async (map: SavedMap) => {
        // If data is missing (lazy load), fetch it
        if (!map.data) {
            const toastId = toast.loading("Loading map...");
            try {
                const res = await fetch(`/api/datasets/${map.id}`, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const dataset = await res.json();
                    // We stored it as a single record in 'data' array
                    // See getDatasetById Aggregation -> it flattens records.data
                    // Look for a record that HAS nodes/links
                    // [FIX] Handle separated analytics record (Phase 3 Aggregation)
                    const snapshot = dataset.data.find((d: any) => d.nodes && d.links);
                    const analyticsRecord = dataset.data.find((d: any) => d.recordType === 'analytics_data');

                    let finalData = snapshot || dataset.data[0];

                    if (snapshot && analyticsRecord && analyticsRecord.data) {
                        console.log("[Dashboard] Merging separated analytics data (LoadMap)...", Object.keys(analyticsRecord.data));
                        // [DEBUG] Check for Visual DNA specifically
                        if (analyticsRecord.data.visualAnalysis) console.log("[Dashboard] Found Visual Analysis in analytics record");
                        else console.warn("[Dashboard] Visual Analysis MISSING in analytics record");

                        if (!finalData.analytics) finalData.analytics = {};
                        Object.assign(finalData.analytics, analyticsRecord.data);

                        // Also ensure summary is carried over if it exists in analytics
                        if (analyticsRecord.data.summary && !finalData.summary) {
                            finalData.summary = analyticsRecord.data.summary;
                        }
                    }

                    if (finalData && finalData.nodes) {
                        setData(finalData);
                        setProfile(dataset.targetProfile);
                        setPlatform(dataset.platform as any);
                        setInputType(dataset.dataType as any);
                        setCurrentMapId(map.id); // Set as Current
                        toast.dismiss(toastId);
                    }
                }
            } catch (e) {
                toast.error("Failed to load map", { id: toastId });
            }
        } else {
            setData(map.data);
            setProfile(map.config.profile);
            setPlatform(map.config.platform);
            setInputType(map.config.inputType);
            setSampleSize(map.config.sampleSize);
            setCurrentMapId(map.id); // Set as Current
            setIsSidebarOpen(false); // [UX] Hide Query Panel
            setIsRightPanelOpen(true); // [UX] Show Analytics Panel
        }
    };

    const handleDeleteMap = async (id: string) => {
        if (!confirm("Are you sure?")) return;

        const originalMaps = [...savedMaps];
        setSavedMaps(savedMaps.filter(m => m.id !== id)); // Optimistic

        try {
            const res = await fetch(`/api/datasets/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Delete failed");
        } catch (e) {
            setSavedMaps(originalMaps); // Revert
            toast.error("Failed to delete map");
        }
    };

    const handleReset = () => {
        setData(null);
        setProfile("");
        setSampleSize(500);
        setError(null);
        setSaveName("");
        setCurrentMapId(null);
    };

    const shareMapById = async (datasetId: string) => {
        const toastId = toast.loading("Creating public link...");
        try {
            const res = await fetch('/api/public-maps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ datasetId })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to share map");
            }

            const { publicUrl, publicId } = await res.json();

            // Update local state if this is the currently loaded map
            if (currentMapId === datasetId) {
                setSavedMaps(prev => prev.map(m => m.id === datasetId ? { ...m, publicId } : m));
            }

            navigator.clipboard.writeText(publicUrl);
            toast.success("Link copied to clipboard!", {
                id: toastId,
                description: "Map is now public",
                action: {
                    label: "Open",
                    onClick: () => window.open(publicUrl, '_blank')
                },
                duration: 5000
            });

            refreshProfile();

        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        }
    };

    const handleShare = async () => {
        if (!data) return;
        if (!token) {
            toast.error("Please log in to share maps");
            return;
        }

        const confirmShare = confirm("Sharing this map will create a public link and deduct 10 credits. Continue?");
        if (!confirmShare) return;

        // Case 1: Map is already saved (has currentMapId)
        if (currentMapId) {
            await shareMapById(currentMapId);
            return;
        }

        // Case 2: Map is unsaved (Transient). Autosave first.
        const toastId = toast.loading("Auto-saving map for sharing...");
        try {
            const autoName = `${profile || 'Map'} (Shared)`;
            const newId = crypto.randomUUID();

            const payload = {
                id: newId,
                name: autoName,
                platform,
                targetProfile: inputType === 'profile' ? profile : 'Unknown',
                dataType: inputType,
                recordCount: data.nodes.length,
                tags: ['snapshot', 'shared-autosave'],
                data: [{
                    recordType: 'graph_snapshot',
                    data: data
                }]
            };

            const saveRes = await fetch('/api/datasets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!saveRes.ok) throw new Error("Failed to auto-save map");

            // Update State
            setCurrentMapId(newId);
            const newMap: SavedMap = {
                id: newId,
                name: autoName,
                date: new Date().toLocaleDateString(),
                data: data,
                config: { profile, platform, inputType, sampleSize }
            };
            setSavedMaps(prev => [newMap, ...prev]);

            toast.dismiss(toastId);

            // Now Share
            await shareMapById(newId);

        } catch (e: any) {
            console.error(e);
            toast.error("Auto-save failed: " + e.message, { id: toastId });
        }
    };

    const handleWizardClose = useCallback(() => {
        setIsWizardOpen(false);
    }, []);

    const handleWizardMapReady = useCallback((newData: any) => {
        setData(newData);
    }, []);



    const handleDeleteJob = async (jobId: string) => {
        try {
            // Optimistic update
            const originalJobs = [...jobs];
            setJobs(jobs.filter(j => j.id !== jobId));

            const res = await fetch(`/api/jobs/${jobId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                // Revert if failed
                setJobs(originalJobs);
                toast.error("Failed to delete job");
                return;
            }
            toast.success("Job aborted & deleted");
        } catch (e) {
            console.error(e);
            toast.error("Error deleting job");
        }
    };

    useEffect(() => {
        if (data && window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    }, [data]);

    return (
        <div className="h-[100dvh] bg-[#051810] text-gray-200 font-sans selection:bg-pink-500 selection:text-white flex flex-col overflow-hidden">
            {/* Header / Navbar */}
            <header className="h-14 border-b border-emerald-900/30 bg-[#051810]/95 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-50 shrink-0 print:hidden">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 select-none">
                        <Sparkles className="h-6 w-6 text-emerald-400" />
                        <div className="font-bold text-xl tracking-tight text-white">
                            Fandom Mapper
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 md:gap-4 shrink-0">
                    <div className="hidden md:flex items-center gap-2 mr-2">
                        <Link to="/help" className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-emerald-500/10 text-emerald-500/70 hover:text-emerald-400 transition-colors mr-1" title="Help Guide">
                            <HelpCircle className="w-5 h-5" />
                        </Link>
                        <Link to="/credits" className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-emerald-500/10 text-emerald-500/70 hover:text-emerald-400 transition-colors mr-2" title="Credits & Acknowledgements">
                            <Heart className="w-5 h-5" />
                        </Link>
                        <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
                            {user?.picture && <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full border border-emerald-500/50 group-hover:border-emerald-400" />}
                            <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-emerald-400 max-w-[100px] truncate group-hover:text-emerald-300">{user?.name}</span>
                            </div>
                        </Link>
                        <button onClick={logout} className="text-[10px] text-emerald-600 hover:text-red-400 underline ml-2">LOGOUT</button>
                    </div>

                    <button
                        onClick={() => setIsActivityOpen(!isActivityOpen)}
                        className={`relative p-2 rounded-full transition-colors ${isActivityOpen ? 'bg-emerald-500/20 text-emerald-300' : 'hover:bg-emerald-500/10 text-emerald-500/70 hover:text-emerald-400'} ${isPulsing ? 'animate-pulse-thrice text-emerald-300 bg-emerald-500/20' : ''}`}
                        title="Job Queue"
                    >
                        <Activity className={`w-5 h-5 ${isPulsing ? 'text-white' : ''}`} />
                        {activeJobsCount > 0 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-[#051810]" />
                        )}
                    </button>

                    <BudgetDisplay />

                    <div className="h-6 w-px bg-emerald-900/50" />

                    <button
                        onClick={handleShare}
                        disabled={!data || loading}
                        className="hidden md:flex bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 hover:text-emerald-300 text-xs px-4 py-2 rounded-full font-bold transition-colors border border-emerald-500/30 items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        title="Share Public Link (10 Credits)"
                    >
                        <Share2 className="w-3 h-3" />
                        SHARE
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-full font-bold transition-colors shadow-[0_0_15px_rgba(5,150,105,0.3)] border border-emerald-400/20 whitespace-nowrap"
                    >
                        EXPORT PDF
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex w-full p-4 gap-4 overflow-hidden relative min-h-0">
                {/* [NEW] Dynamic Dashboard Mode REMOVED - Always Show Standard Dashboard */}
                <AnimatePresence mode="wait">

                    <motion.div
                        key="standard-dashboard"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        className="flex-1 w-full h-full relative z-10 flex overflow-hidden"
                    >
                        {/* Inner content wrapper no longer needed as motion.div handles layout */}
                        {!isSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className="absolute top-4 left-4 z-30 p-2 bg-[#1a4d2e] border border-emerald-500/30 rounded-lg text-emerald-300 hover:text-white hover:border-emerald-500/50 shadow-lg transition-all print:hidden"
                                title="Show Panel"
                            >
                                <PanelLeftOpen className="w-5 h-5" />
                            </button>
                        )}


                        {/* Left Control Panel (Sidebar) */}
                        <div className={`shrink-0 flex flex-col gap-4 h-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-[340px] translate-x-0 opacity-100' : 'w-0 -translate-x-4 opacity-0 overflow-hidden'} print:hidden`}>
                            <div className="bg-[#1a4d2e]/80 rounded-2xl p-2.5 shadow-2xl border border-emerald-500/20 flex-1 flex flex-col min-w-[340px] overflow-y-auto backdrop-blur-md relative">
                                <button
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="absolute top-4 left-4 p-1.5 hover:bg-white/10 rounded-full transition-colors text-emerald-400 hover:text-white z-10"
                                    title="Hide Panel"
                                >
                                    <PanelLeftClose className="w-4 h-4" />
                                </button>

                                {/* QUERY BUILDER - Spaced 10px below the hide button area roughly */}
                                <div className="mt-12 w-full p-4 bg-[#0a1f16] border border-emerald-500/30 rounded-xl space-y-6 flex-1 mb-[10px]">
                                    {queryStep === 1 && (
                                        <div className="flex items-center gap-3 mb-2 px-1">
                                            <Sparkles size={18} className="text-emerald-400" />
                                            <span className="text-lg font-light text-white tracking-tight">Enter Query</span>
                                        </div>
                                    )}

                                    <SidebarQueryBuilder
                                        onMapReady={handleWizardMapReady}
                                        onJobSubmitted={() => setIsActivityOpen(true)}
                                        onStepChange={setQueryStep}
                                    />
                                </div>

                                {data && !loading && (
                                    <div className="pt-4 border-t border-emerald-500/20 space-y-3 mb-[10px]">
                                        <label className="text-[10px] font-bold text-emerald-300/70">Save map</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Enter map name..."
                                                value={saveName}
                                                onChange={(e) => setSaveName(e.target.value)}
                                                className="flex-1 bg-[#0a1f16] border border-emerald-500/30 rounded px-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                                            />
                                            <button
                                                onClick={handleSaveMap}
                                                disabled={!saveName}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 rounded text-xs font-bold transition-colors disabled:opacity-50"
                                                title="Save to library"
                                            >
                                                <Save className="w-4 h-4" />
                                            </button>

                                            {/* [NEW] Export Menu replaces simple Download button */}
                                            <ExportMenu
                                                data={data}
                                                filename={saveName || `fandom_map_${Date.now()}`}
                                                dashboardRef={dashboardRef}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* 2. OPEN LIBRARY BUTTON */}
                                <button
                                    onClick={() => setIsLibraryOpen(true)}
                                    className="w-full flex items-center justify-between p-3 bg-[#0a1f16] border border-emerald-500/30 rounded-lg group hover:border-emerald-500/70 hover:bg-[#0f291e] transition-all duration-200"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-500 group-hover:text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                                            <FolderOpen size={16} />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-xs font-bold text-gray-200 group-hover:text-white">Saved Maps Library</div>
                                            <div className="text-[10px] text-emerald-500/60 group-hover:text-emerald-500/80">
                                                {savedMaps.length} maps stored
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-gray-600 group-hover:text-emerald-400 transition-colors transform group-hover:translate-x-1" />
                                </button>
                            </div>
                        </div>


                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-200 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Right Display Area */}
                        <div
                            ref={dashboardRef}
                            id="dashboard-view"
                            className="flex-1 h-full bg-[#1a4d2e]/30 border border-emerald-500/20 rounded-2xl relative overflow-hidden shadow-2xl flex flex-col transition-all print:border-0 print:shadow-none backdrop-blur-sm"
                        >
                            <div className={`absolute inset-0 z-0 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${isRightPanelOpen ? 'right-80' : 'right-0'}`}>
                                {loading ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-300 gap-4 bg-[#051810]">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 rounded-full animate-pulse"></div>
                                            <Loader2 className="w-12 h-12 animate-spin text-emerald-400 relative z-10" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-emerald-200">Connecting nodes...</p>
                                            <p className="text-xs text-emerald-400 mt-1">Analysing data points</p>
                                        </div>
                                    </div>
                                ) : data ? (
                                    <GraphErrorBoundary>
                                        <LazyFandomGraph3D
                                            // key removed to allow internal updates instead of forced remount
                                            nodes={data.nodes}
                                            links={data.links}
                                            focusedNodeId={focusedNodeId}
                                            profileImage={data.profileImage}
                                            profileFullName={data.profileFullName}
                                            onNodeClick={(id) => {
                                                setFocusedNodeId(id);
                                                setIsRightPanelOpen(true);
                                            }}
                                            visualTheme={data.analytics?.visualTheme} // [NEW] Pass Theme
                                            showLegend={false} // [FIX] Use external legend below
                                            query={data.profileFullName || profile} // [FIX] Use profileFullName as query fallback
                                            isOpen={isRightPanelOpen} // [NEW] Pass panel state for layout
                                        />
                                        <GraphLegend
                                            comparisonMetadata={data.comparisonMetadata}
                                            visualTheme={data.analytics?.visualTheme} // [NEW] Pass Theme to Legend
                                        />
                                    </GraphErrorBoundary>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-500/40 gap-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a4d2e] to-[#051810]">
                                        <div className="p-8 rounded-full bg-[#1a4d2e] border border-emerald-500/20 shadow-[0_0_50px_rgba(109,40,217,0.1)]">
                                            <Sparkles className="w-12 h-12 opacity-50 text-emerald-500" />
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold text-emerald-200">Start Your Journey</h3>
                                            <p className="text-sm text-emerald-400 mt-1">Enter a profile or hashtags/keywords to map a Fandom Universe</p>
                                        </div>
                                    </div>
                                )}
                            </div>



                            {data && !loading && data.summary && (
                                /* Hide summary on smaller screens if right panel is open to prevent overlap */
                                <div className={`absolute bottom-6 left-6 z-20 max-w-sm pointer-events-auto transition-all duration-300 ${isRightPanelOpen ? 'opacity-0 translate-y-10 md:opacity-100 md:translate-y-0 pointer-events-none md:pointer-events-auto' : 'opacity-100 translate-y-0'}`}>
                                    {showInsight ? (
                                        <div className="bg-[#051810]/80 backdrop-blur-md border border-emerald-500/30 p-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-4 relative group">
                                            <button
                                                onClick={() => setShowInsight(false)}
                                                className="absolute top-2 right-2 p-1 text-emerald-500/50 hover:text-emerald-300 hover:bg-white/5 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                            <div className="flex items-center gap-2 mb-2">
                                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">SmallWorld Insight</span>
                                            </div>
                                            <p className="text-xs text-gray-300 leading-relaxed font-light">
                                                {data.summary}
                                            </p>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setShowInsight(true)}
                                            className="bg-[#051810]/80 backdrop-blur-md border border-emerald-500/30 p-2 rounded-lg shadow-lg hover:bg-[#0a2f1f] text-emerald-400 transition-all"
                                            title="Show Insight"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {data && !loading && (
                                <div className="absolute inset-0 z-20 pointer-events-none">
                                    {/* Right Panel (Analytics) */}
                                    <LazyAnalyticsPanel
                                        data={data}
                                        focusedNodeId={focusedNodeId}
                                        onSelect={setFocusedNodeId}
                                        isOpen={isRightPanelOpen}
                                        onToggle={setIsRightPanelOpen}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div >

                </AnimatePresence >
            </main >

            {/* Saved Maps Overlay */}
            < SavedMapsModal
                isOpen={isLibraryOpen}
                onClose={() => setIsLibraryOpen(false)}
                maps={savedMaps}
                onLoad={handleLoadMap}
                onDelete={handleDeleteMap}
                currentMapId={currentMapId}
                hasMore={hasMoreMaps}
                onLoadMore={handleLoadMoreMaps}
            />

            <ActivityCenter
                isOpen={isActivityOpen}
                onClose={() => {
                    setIsActivityOpen(false);
                    setHasUserClosedActivity(true); // User explicitly closed it, don't auto-open
                }}
                jobs={jobs}
                onViewResult={handleViewResult}
                onDelete={handleDeleteJob}
                onShare={shareMapById}
            />

            {
                isWizardOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
                        <MapWizard
                            onClose={handleWizardClose}
                            onMapReady={handleWizardMapReady}
                            onJobSubmitted={() => {
                                setHasUserClosedActivity(false);
                                setIsActivityOpen(true);
                            }}
                        />
                    </div>
                )
            }

            <Toaster position="top-right" theme="dark" richColors closeButton />

            {/* [NEW] Scotty Error Screen Overlay */}
            {
                showApifyError && (
                    <ScottyErrorScreen onRetry={() => setShowApifyError(false)} />
                )
            }
        </div >
    );
};
