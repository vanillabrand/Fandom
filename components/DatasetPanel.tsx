import React, { useState, useEffect, useCallback } from 'react';
import {
    Database,
    Plus,
    Search,
    Trash2,
    RefreshCw,
    Download,
    Upload,
    Filter,
    ChevronRight,
    Folder,
    Calendar,
    Users,
    UserPlus,
    FileText,
    Tag,
    AlertCircle,
    CheckCircle,
    Loader2,
    X,
    Instagram
} from 'lucide-react';
import {
    Dataset,
    DatasetSummary,
    DatasetPlatform,
    DatasetType,
    ScrapeJobStatus
} from '../types.js';
import {
    getAllDatasets,
    getDatasetSummaries,
    deleteDataset,
    searchDatasets,
    getStorageStats,
    exportDatasets,
    importDatasets,
    getDataset,
    addToDataset
} from '../services/datasetService.js';
import {
    indexDataset
} from '../services/vectorService.js';
import {
    scrapeFollowers,
    scrapeFollowing,
    scrapePosts,
    estimateCost,
    getBestActor,
    validateToken
} from '../services/apifyScraperService.js';
import { createDataset } from '../services/datasetService.js';
import {
    processFollowingForOverindexing,
    saveOverindexingResults
} from '../services/overindexingService.js';

// TikTok Icon
const TikTokIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 1 0 1-.05V9.6l.06.03V2h3.41A9.66 9.66 0 0 0 17.41 6.69h2.18Z" />
    </svg>
);

// Data type icons
const DataTypeIcon = ({ type, className }: { type: DatasetType; className?: string }) => {
    switch (type) {
        case 'followers':
            return <Users className={className} />;
        case 'following':
            return <UserPlus className={className} />;
        case 'posts':
            return <FileText className={className} />;
        case 'profiles':
            return <Database className={className} />;
        case 'overindexed':
            return <Tag className={className} />;
        default:
            return <Database className={className} />;
    }
};

interface DatasetPanelProps {
    onClose?: () => void;
    onDatasetSelect?: (dataset: Dataset) => void;
}

type ViewMode = 'list' | 'detail' | 'create';
type CreateStep = 'platform' | 'profile' | 'dataType' | 'options' | 'confirm' | 'scraping';

const DatasetPanel: React.FC<DatasetPanelProps> = ({ onClose, onDatasetSelect }) => {
    // List view state
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPlatform, setFilterPlatform] = useState<DatasetPlatform | ''>('');
    const [filterDataType, setFilterDataType] = useState<DatasetType | ''>('');

    // View state
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

    // Create wizard state
    const [createStep, setCreateStep] = useState<CreateStep>('platform');
    const [newPlatform, setNewPlatform] = useState<DatasetPlatform>('instagram');
    const [newProfile, setNewProfile] = useState('');
    const [newDataType, setNewDataType] = useState<DatasetType>('followers');
    const [newLimit, setNewLimit] = useState(1000);
    const [newName, setNewName] = useState('');
    const [newProject, setNewProject] = useState('');
    const [newTags, setNewTags] = useState('');
    const [scrapeStatus, setScrapeStatus] = useState<ScrapeJobStatus | null>(null);
    const [scrapeError, setScrapeError] = useState<string | null>(null);
    const [appendMode, setAppendMode] = useState(false);
    const [indexingTarget, setIndexingTarget] = useState<string | null>(null);
    const [analyzingOverlap, setAnalyzingOverlap] = useState(false);
    const [simulateAnalysis, setSimulateAnalysis] = useState(true);

    // Stats
    const [stats, setStats] = useState<{
        totalDatasets: number;
        totalRecords: number;
        byPlatform: Record<DatasetPlatform, number>;
        byDataType: Record<DatasetType, number>;
    } | null>(null);

    // Load datasets
    const loadDatasets = useCallback(async () => {
        setLoading(true);
        try {
            const criteria: any = {};
            if (filterPlatform) criteria.platform = filterPlatform;
            if (filterDataType) criteria.dataType = filterDataType;
            if (searchQuery) criteria.query = searchQuery;

            const results = Object.keys(criteria).length > 0
                ? await searchDatasets(criteria)
                : await getDatasetSummaries();

            setDatasets(results);

            const storageStats = await getStorageStats();
            setStats(storageStats);
        } catch (err) {
            console.error('Failed to load datasets:', err);
        } finally {
            setLoading(false);
        }
    }, [filterPlatform, filterDataType, searchQuery]);

    useEffect(() => {
        loadDatasets();
    }, [loadDatasets]);

    // Handle dataset deletion
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this dataset?')) return;

        try {
            await deleteDataset(id);
            loadDatasets();
            if (selectedDataset?.id === id) {
                setSelectedDataset(null);
                setViewMode('list');
            }
        } catch (err) {
            console.error('Failed to delete dataset:', err);
        }
    };

    // Handle dataset detail view
    const handleViewDetail = async (id: string) => {
        try {
            const dataset = await getDataset(id);
            if (dataset) {
                setSelectedDataset(dataset);
                setViewMode('detail');
            }
        } catch (err) {
            console.error('Failed to load dataset:', err);
        }
    };

    // Handle export
    const handleExport = async () => {
        try {
            const json = await exportDatasets();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fandom-datasets-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export:', err);
        }
    };

    // Handle import
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const count = await importDatasets(text);
            alert(`Imported ${count} datasets`);
            loadDatasets();
        } catch (err) {
            console.error('Failed to import:', err);
            alert('Failed to import datasets');
        }
    };

    // Start dataset creation
    const startCreate = () => {
        setViewMode('create');
        setCreateStep('platform');
        setNewPlatform('instagram');
        setNewProfile('');
        setNewDataType('followers');
        setNewLimit(1000);
        setNewName('');
        setNewProject('');
        setNewTags('');
        setScrapeError(null);
        setScrapeStatus(null);
        setAppendMode(false);
    };

    // Start append to dataset
    const startAppend = (dataset: Dataset) => {
        setAppendMode(true);
        setSelectedDataset(dataset);

        // Pre-fill
        setViewMode('create');
        setCreateStep('dataType'); // Skip platform/profile as they are fixed
        setNewPlatform(dataset.platform);
        setNewProfile(dataset.targetProfile);
        setNewDataType('posts'); // Default to something different likely
        setNewLimit(100);
        setScrapeError(null);
        setScrapeStatus(null);
    };

    // Handle vector indexing
    const handleIndexDataset = async (dataset: Dataset) => {
        setIndexingTarget(dataset.id);
        try {
            await indexDataset(dataset);
            alert('Dataset indexed successfully! You can now use it for smart queries.');
            // Refresh
            const updated = await getDataset(dataset.id);
            if (updated) setSelectedDataset(updated);
            loadDatasets();
        } catch (err: any) {
            console.error('Indexing failed:', err);
            alert('Failed to index dataset: ' + err.message);
        } finally {
            setIndexingTarget(null);
        }
    };

    // Handle scraping
    const handleStartScrape = async () => {
        setCreateStep('scraping');
        setScrapeError(null);

        try {
            // Validate token first
            const tokenValid = await validateToken();
            if (!tokenValid) {
                throw new Error('Apify token is invalid or not configured');
            }

            let data: any[];

            const onProgress = (status: ScrapeJobStatus) => {
                setScrapeStatus(status);
            };

            switch (newDataType) {
                case 'followers':
                    data = await scrapeFollowers(newPlatform, newProfile, newLimit, onProgress);
                    break;
                case 'following':
                    data = await scrapeFollowing(newPlatform, newProfile, newLimit, onProgress);
                    break;
                case 'posts':
                    data = await scrapePosts(newPlatform, newProfile, newLimit, onProgress);
                    break;
                default:
                    throw new Error(`Unsupported data type: ${newDataType}`);
            }

            if (appendMode && selectedDataset) {
                // ADD TO EXISTING
                await addToDataset(selectedDataset.id, data, {
                    id: `src_${Date.now()}`,
                    type: newDataType,
                    actorId: getBestActor({ platform: newPlatform, targetProfile: newProfile, dataType: newDataType })?.actorId || 'unknown',
                    scrapedAt: new Date(),
                    recordCount: data.length,
                    params: { limit: newLimit },
                    cost: 0 // Estimate?
                });
                alert(`Added ${data.length} records to ${selectedDataset.name}!`);
            } else {
                // CREATE NEW
                const datasetName = newName || `${newProfile} ${newDataType} (${newPlatform})`;
                await createDataset({
                    name: datasetName,
                    platform: newPlatform,
                    targetProfile: newProfile,
                    dataType: newDataType,
                    recordCount: data.length,
                    project: newProject || undefined,
                    tags: newTags ? newTags.split(',').map(t => t.trim()).filter(Boolean) : [],
                    data,
                    sources: [{
                        id: `src_${Date.now()}`,
                        type: newDataType,
                        actorId: getBestActor({ platform: newPlatform, targetProfile: newProfile, dataType: newDataType })?.actorId || 'unknown',
                        scrapedAt: new Date(),
                        recordCount: data.length,
                        params: { limit: newLimit },
                        cost: 0
                    }],
                    metadata: {
                        sourceActor: getBestActor({ platform: newPlatform, targetProfile: newProfile, dataType: newDataType })?.actorId || 'unknown',
                        scrapeTimestamp: new Date(),
                        scrapeParams: { limit: newLimit },
                        estimatedCompleteness: 100
                    }
                });
                alert(`Dataset created with ${data.length} records!`);
            }

            setViewMode('list');
            loadDatasets();

        } catch (err: any) {
            console.error('Scrape failed:', err);
            setScrapeError(err.message || 'Scraping failed');
        }
    };

    // Render list view
    const renderListView = () => (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">Datasets</h2>
                    {stats && (
                        <span className="text-xs text-emerald-400/70 bg-emerald-900/30 px-2 py-0.5 rounded-full">
                            {stats.totalDatasets} datasets · {stats.totalRecords.toLocaleString()} records
                        </span>
                    )}
                </div>
                <button
                    onClick={startCreate}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Dataset
                </button>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                    <input
                        type="text"
                        placeholder="Search datasets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500"
                    />
                </div>
                <select
                    value={filterPlatform}
                    onChange={(e) => setFilterPlatform(e.target.value as DatasetPlatform | '')}
                    className="bg-[#051810] border border-emerald-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                    <option value="">All Platforms</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                </select>
                <select
                    value={filterDataType}
                    onChange={(e) => setFilterDataType(e.target.value as DatasetType | '')}
                    className="bg-[#051810] border border-emerald-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                    <option value="">All Types</option>
                    <option value="followers">Followers</option>
                    <option value="following">Following</option>
                    <option value="posts">Posts</option>
                    <option value="overindexed">Over-indexed</option>
                </select>
            </div>

            {/* Dataset List */}
            <div className="flex-1 overflow-y-auto space-y-2">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    </div>
                ) : datasets.length === 0 ? (
                    <div className="text-center py-8 text-emerald-500/50">
                        <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No datasets found</p>
                        <button
                            onClick={startCreate}
                            className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm"
                        >
                            Create your first dataset
                        </button>
                    </div>
                ) : (
                    datasets.map((dataset) => (
                        <div
                            key={dataset.id}
                            className="group bg-[#051810]/60 hover:bg-[#051810] border border-emerald-700/30 hover:border-emerald-500/50 rounded-lg p-3 cursor-pointer transition-all"
                            onClick={() => handleViewDetail(dataset.id)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg ${dataset.platform === 'instagram'
                                        ? 'bg-gradient-to-tr from-yellow-500/20 to-pink-600/20'
                                        : 'bg-white/10'
                                        }`}>
                                        {dataset.platform === 'instagram'
                                            ? <Instagram className="w-4 h-4 text-pink-400" />
                                            : <TikTokIcon className="w-4 h-4 text-white" />
                                        }
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-white group-hover:text-emerald-300 transition-colors">
                                            {dataset.name}
                                        </h3>
                                        <p className="text-xs text-emerald-500/70 mt-0.5">
                                            @{dataset.targetProfile} · {dataset.recordCount.toLocaleString()} records
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-400/60 bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                <DataTypeIcon type={dataset.dataType} className="w-3 h-3" />
                                                {dataset.dataType}
                                            </span>
                                            <span className="flex items-center gap-1 text-[10px] text-emerald-400/60">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(dataset.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(dataset.id); }}
                                        className="p-1.5 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <ChevronRight className="w-4 h-4 text-emerald-500" />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-emerald-700/30">
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadDatasets}
                        className="p-2 hover:bg-emerald-900/30 rounded-lg text-emerald-500 hover:text-emerald-400 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleExport}
                        className="p-2 hover:bg-emerald-900/30 rounded-lg text-emerald-500 hover:text-emerald-400 transition-colors"
                        title="Export All"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <label className="p-2 hover:bg-emerald-900/30 rounded-lg text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer" title="Import">
                        <Upload className="w-4 h-4" />
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                </div>
            </div>
        </div>
    );

    // Handle Over-indexing Analysis
    // Handle Over-indexing Analysis
    const handleAnalyzeOverlap = async (dataset: Dataset) => {
        setAnalyzingOverlap(true);
        try {
            let result;

            if (simulateAnalysis) {
                // Simulate analysis
                await new Promise(resolve => setTimeout(resolve, 2000));
                result = {
                    targetProfile: dataset.targetProfile,
                    platform: dataset.platform,
                    followersSampled: 50,
                    followingAnalyzed: 50 * 200,
                    calculatedAt: new Date(),
                    topCreators: [
                        { username: 'mkbhd', fullName: 'Marques Brownlee', category: 'creator', overindexScore: 8.5, percentage: 15, frequency: 7, platform: dataset.platform, followerCount: 19000000 },
                        { username: 'mrbeast', fullName: 'MrBeast', category: 'creator', overindexScore: 6.2, percentage: 12, frequency: 6, platform: dataset.platform, followerCount: 200000000 },
                        { username: 'caseyneistat', fullName: 'Casey Neistat', category: 'creator', overindexScore: 4.1, percentage: 8, frequency: 4, platform: dataset.platform, followerCount: 12000000 }
                    ],
                    topBrands: [
                        { username: 'nike', fullName: 'Nike', category: 'brand', overindexScore: 12.0, percentage: 25, frequency: 12, platform: dataset.platform, followerCount: 300000000 },
                        { username: 'gymshark', fullName: 'Gymshark', category: 'brand', overindexScore: 9.5, percentage: 18, frequency: 9, platform: dataset.platform, followerCount: 6000000 }
                    ],
                    topMedia: [
                        { username: 'complex', fullName: 'Complex', category: 'media', overindexScore: 5.5, percentage: 10, frequency: 5, platform: dataset.platform, followerCount: 10000000 }
                    ],
                    clusters: []
                };
            } else {
                // Real Analysis
                // 1. Get sample records
                const fullDataset = await getDataset(dataset.id);
                if (!fullDataset.data || fullDataset.data.length === 0) {
                    throw new Error("Dataset is empty");
                }

                // Limit to top 5 to check overlap (Proof of concept)
                // Real production usage would be 50-100
                const SAMPLE_SIZE = 5;
                const samples = fullDataset.data.slice(0, SAMPLE_SIZE);
                const followingSamples: any[][] = [];

                console.log(`Starting Overlap Analysis for ${samples.length} profiles...`);

                for (const record of samples) {
                    const username = record.username || record.ownerUsername;
                    if (!username) continue;

                    try {
                        console.log(`Scraping following for: ${username}`);
                        // Scrape 200 following per user
                        const following = await scrapeFollowing(dataset.platform, username, 200);
                        followingSamples.push(following);
                        // Brief pause to be nice to API
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (err) {
                        console.warn(`Failed to scrape following for ${username}`, err);
                    }
                }

                if (followingSamples.length === 0) {
                    throw new Error("Could not scrape any following data. Check API credits or limits.");
                }

                result = processFollowingForOverindexing(
                    dataset.targetProfile,
                    dataset.platform,
                    followingSamples
                );
            }

            await saveOverindexingResults(result as any);
            alert("Analysis complete! 'Over-indexed' dataset created. You can now explore it in the graph.");
            loadDatasets();
        } catch (e: any) {
            console.error("Analysis failed", e);
            alert(`Analysis failed: ${e.message}`);
        } finally {
            setAnalyzingOverlap(false);
        }
    };

    // Render detail view
    const renderDetailView = () => {
        if (!selectedDataset) return null;

        return (
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => { setSelectedDataset(null); setViewMode('list'); }}
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-sm"
                    >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                        Back to List
                    </button>
                    <button
                        onClick={() => handleDelete(selectedDataset.id)}
                        className="flex items-center gap-1 text-red-400 hover:text-red-300 text-sm"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                </div>

                {/* Dataset Info */}
                <div className="bg-[#051810]/60 border border-emerald-700/30 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3 mb-4">
                        <div className={`p-3 rounded-lg ${selectedDataset.platform === 'instagram'
                            ? 'bg-gradient-to-tr from-yellow-500/20 to-pink-600/20'
                            : 'bg-white/10'
                            }`}>
                            {selectedDataset.platform === 'instagram'
                                ? <Instagram className="w-6 h-6 text-pink-400" />
                                : <TikTokIcon className="w-6 h-6 text-white" />
                            }
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{selectedDataset.name}</h2>
                            <p className="text-sm text-emerald-500">@{selectedDataset.targetProfile}</p>
                        </div>
                    </div>

                    {(selectedDataset.dataType === 'followers' || selectedDataset.dataType === 'following') && (
                        <div className="flex justify-end mb-2">
                            <label className="flex items-center gap-2 text-xs text-emerald-400/80 cursor-pointer hover:text-emerald-300">
                                <input
                                    type="checkbox"
                                    checked={simulateAnalysis}
                                    onChange={(e) => setSimulateAnalysis(e.target.checked)}
                                    className="accent-emerald-500 rounded bg-[#051810] border-emerald-700/50"
                                />
                                Simulate (Save Credits)
                            </label>
                        </div>
                    )}

                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => startAppend(selectedDataset)}
                            className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Data
                        </button>
                        <button
                            onClick={() => handleIndexDataset(selectedDataset)}
                            disabled={!!indexingTarget}
                            className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                        >
                            {indexingTarget === selectedDataset.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Search className="w-4 h-4" />
                            )}
                            {selectedDataset.vectorIndex?.enabled ? 'Re-Index' : 'Index for Search'}
                        </button>
                        {(selectedDataset.dataType === 'followers' || selectedDataset.dataType === 'following') && (
                            <button
                                onClick={() => handleAnalyzeOverlap(selectedDataset)}
                                disabled={analyzingOverlap}
                                className="flex-1 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-400 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                            >
                                {analyzingOverlap ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Users className="w-4 h-4" />
                                )}
                                Analyze Overlap
                            </button>
                        )}
                    </div>

                    {/* Sources List (Composite) */}
                    {selectedDataset.sources && selectedDataset.sources.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-sm font-medium text-emerald-400 mb-2">Data Sources</h3>
                            <div className="space-y-1">
                                {selectedDataset.sources.map(source => (
                                    <div key={source.id} className="bg-[#051810] p-2 rounded border border-emerald-700/30 flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <DataTypeIcon type={source.type} className="w-3 h-3 text-emerald-500" />
                                            <span className="text-emerald-300 capitalize">{source.type}</span>
                                        </div>
                                        <span className="text-emerald-500/60">{source.recordCount} records · {new Date(source.scrapedAt).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-emerald-500/70">Data Type</span>
                            <p className="text-white capitalize">{selectedDataset.dataType}</p>
                        </div>
                        <div>
                            <span className="text-emerald-500/70">Records</span>
                            <p className="text-white">{selectedDataset.recordCount.toLocaleString()}</p>
                        </div>
                        <div>
                            <span className="text-emerald-500/70">Created</span>
                            <p className="text-white">{new Date(selectedDataset.createdAt).toLocaleString()}</p>
                        </div>
                        <div>
                            <span className="text-emerald-500/70">Updated</span>
                            <p className="text-white">{new Date(selectedDataset.updatedAt).toLocaleString()}</p>
                        </div>
                        {selectedDataset.project && (
                            <div>
                                <span className="text-emerald-500/70">Project</span>
                                <p className="text-white">{selectedDataset.project}</p>
                            </div>
                        )}
                        <div>
                            <span className="text-emerald-500/70">Completeness</span>
                            <p className="text-white">{selectedDataset.metadata.estimatedCompleteness}%</p>
                        </div>
                    </div>

                    {/* Tags */}
                    {(selectedDataset.tags.length > 0 || selectedDataset.autoTags.length > 0) && (
                        <div className="mt-4 pt-4 border-t border-emerald-700/30">
                            <span className="text-emerald-500/70 text-sm">Tags</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {selectedDataset.tags.map((tag, i) => (
                                    <span key={`user-${i}`} className="text-xs bg-emerald-600/30 text-emerald-300 px-2 py-0.5 rounded">
                                        {tag}
                                    </span>
                                ))}
                                {selectedDataset.autoTags.map((tag, i) => (
                                    <span key={`auto-${i}`} className="text-xs bg-emerald-900/30 text-emerald-400/70 px-2 py-0.5 rounded">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Data Preview */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <h3 className="text-sm font-medium text-emerald-400 mb-2">Data Preview</h3>
                    <div className="flex-1 overflow-auto bg-[#051810]/60 border border-emerald-700/30 rounded-lg p-3">
                        <pre className="text-xs text-emerald-300/80 whitespace-pre-wrap">
                            {JSON.stringify(selectedDataset.data.slice(0, 5), null, 2)}
                        </pre>
                        {selectedDataset.data.length > 5 && (
                            <p className="text-xs text-emerald-500/50 mt-2">
                                ... and {selectedDataset.data.length - 5} more records
                            </p>
                        )}
                    </div>
                </div>

                {/* Action Button */}
                {onDatasetSelect && (
                    <button
                        onClick={() => onDatasetSelect(selectedDataset)}
                        className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium transition-colors"
                    >
                        Use This Dataset
                    </button>
                )}
            </div>
        );
    };

    // Render create wizard
    const renderCreateWizard = () => (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-bold text-white">Create New Dataset</h2>
                </div>
                <button
                    onClick={() => setViewMode('list')}
                    className="p-1.5 hover:bg-emerald-900/30 rounded text-emerald-500"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-2 mb-6">
                {['platform', 'profile', 'dataType', 'options', 'confirm'].map((step, i) => (
                    <React.Fragment key={step}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${createStep === step
                            ? 'bg-emerald-600 text-white'
                            : ['platform', 'profile', 'dataType', 'options', 'confirm'].indexOf(createStep) > i
                                ? 'bg-emerald-600/30 text-emerald-400'
                                : 'bg-emerald-900/30 text-emerald-600'
                            }`}>
                            {i + 1}
                        </div>
                        {i < 4 && <div className="flex-1 h-0.5 bg-emerald-900/30" />}
                    </React.Fragment>
                ))}
            </div>

            {/* Step Content */}
            <div className="flex-1">
                {createStep === 'platform' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-emerald-400">Select Platform</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setNewPlatform('instagram')}
                                className={`p-4 rounded-lg border transition-all ${newPlatform === 'instagram'
                                    ? 'bg-gradient-to-tr from-yellow-500/20 to-pink-600/20 border-pink-500/50'
                                    : 'bg-[#051810] border-emerald-700/30 hover:border-emerald-500/50'
                                    }`}
                            >
                                <Instagram className={`w-8 h-8 mx-auto mb-2 ${newPlatform === 'instagram' ? 'text-pink-400' : 'text-emerald-500'
                                    }`} />
                                <p className="text-sm text-white">Instagram</p>
                            </button>
                            <button
                                onClick={() => setNewPlatform('tiktok')}
                                className={`p-4 rounded-lg border transition-all ${newPlatform === 'tiktok'
                                    ? 'bg-white/10 border-white/50'
                                    : 'bg-[#051810] border-emerald-700/30 hover:border-emerald-500/50'
                                    }`}
                            >
                                <TikTokIcon className={`w-8 h-8 mx-auto mb-2 ${newPlatform === 'tiktok' ? 'text-white' : 'text-emerald-500'
                                    }`} />
                                <p className="text-sm text-white">TikTok</p>
                            </button>
                        </div>
                    </div>
                )}

                {createStep === 'profile' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-emerald-400">Target Profile</h3>
                        <input
                            type="text"
                            placeholder="Username (without @)"
                            value={newProfile}
                            onChange={(e) => setNewProfile(e.target.value.replace('@', ''))}
                            className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-3 text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500"
                        />
                        <p className="text-xs text-emerald-500/70">
                            Enter the public {newPlatform} username to scrape data from
                        </p>
                    </div>
                )}

                {createStep === 'dataType' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-emerald-400">Data Type</h3>
                        <div className="space-y-2">
                            {(['followers', 'following', 'posts'] as DatasetType[]).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setNewDataType(type)}
                                    className={`w-full p-3 rounded-lg border flex items-center gap-3 transition-all ${newDataType === type
                                        ? 'bg-emerald-600/20 border-emerald-500/50'
                                        : 'bg-[#051810] border-emerald-700/30 hover:border-emerald-500/50'
                                        }`}
                                >
                                    <DataTypeIcon type={type} className="w-5 h-5 text-emerald-400" />
                                    <div className="text-left">
                                        <p className="text-sm text-white capitalize">{type}</p>
                                        <p className="text-xs text-emerald-500/70">
                                            {type === 'followers' && 'List of accounts following this profile'}
                                            {type === 'following' && 'List of accounts this profile follows'}
                                            {type === 'posts' && 'Recent posts and content from this profile'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {createStep === 'options' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-emerald-400">Options</h3>

                        <div>
                            <label className="text-xs text-emerald-500/70 mb-1 block">Record Limit</label>
                            <input
                                type="number"
                                value={newLimit}
                                onChange={(e) => setNewLimit(parseInt(e.target.value) || 100)}
                                min={100}
                                max={10000}
                                className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                            />
                            <p className="text-xs text-emerald-500/50 mt-1">
                                Estimated cost: ~{(newLimit / 1000 * 0.5).toFixed(2)} credits
                            </p>
                        </div>

                        <div>
                            <label className="text-xs text-emerald-500/70 mb-1 block">Dataset Name (optional)</label>
                            <input
                                type="text"
                                placeholder={`${newProfile} ${newDataType} (${newPlatform})`}
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-2 text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-emerald-500/70 mb-1 block">Project (optional)</label>
                            <input
                                type="text"
                                placeholder="e.g. Q4 Campaign"
                                value={newProject}
                                onChange={(e) => setNewProject(e.target.value)}
                                className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-2 text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-emerald-500/70 mb-1 block">Tags (comma-separated)</label>
                            <input
                                type="text"
                                placeholder="e.g. fashion, sports, uk"
                                value={newTags}
                                onChange={(e) => setNewTags(e.target.value)}
                                className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-2 text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                )}

                {createStep === 'confirm' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-emerald-400">Confirm & Start</h3>

                        <div className="bg-[#051810]/60 border border-emerald-700/30 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-500/70">Platform</span>
                                <span className="text-white capitalize">{newPlatform}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-500/70">Profile</span>
                                <span className="text-white">@{newProfile}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-500/70">Data Type</span>
                                <span className="text-white capitalize">{newDataType}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-500/70">Record Limit</span>
                                <span className="text-white">{newLimit.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-emerald-500/70">Est. Time</span>
                                <span className="text-white">~{Math.ceil(newLimit / 100)} min</span>
                            </div>
                        </div>

                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-yellow-200">
                                This will consume Apify credits. Ensure the profile is public and the username is correct.
                            </p>
                        </div>
                    </div>
                )}

                {createStep === 'scraping' && (
                    <div className="flex flex-col items-center justify-center py-8">
                        {scrapeError ? (
                            <>
                                <div className="p-4 bg-red-900/20 rounded-full mb-4">
                                    <AlertCircle className="w-8 h-8 text-red-400" />
                                </div>
                                <h3 className="text-lg font-medium text-white mb-2">Scraping Failed</h3>
                                <p className="text-sm text-red-400 text-center mb-4">{scrapeError}</p>
                                <button
                                    onClick={() => setCreateStep('confirm')}
                                    className="text-emerald-400 hover:text-emerald-300 text-sm"
                                >
                                    Try Again
                                </button>
                            </>
                        ) : (
                            <>
                                <Loader2 className="w-12 h-12 animate-spin text-emerald-400 mb-4" />
                                <h3 className="text-lg font-medium text-white mb-2">Scraping in Progress</h3>
                                {scrapeStatus && (
                                    <div className="text-sm text-emerald-500 text-center">
                                        <p>Status: {scrapeStatus.state}</p>
                                        <p>Records: {scrapeStatus.itemCount.toLocaleString()}</p>
                                    </div>
                                )}
                                <p className="text-xs text-emerald-500/50 mt-4">This may take a few minutes...</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            {createStep !== 'scraping' && (
                <div className="flex justify-between mt-6">
                    <button
                        onClick={() => {
                            const steps: CreateStep[] = ['platform', 'profile', 'dataType', 'options', 'confirm'];
                            const currentIndex = steps.indexOf(createStep);
                            if (currentIndex > 0) {
                                setCreateStep(steps[currentIndex - 1]);
                            } else {
                                setViewMode('list');
                            }
                        }}
                        className="px-4 py-2 text-emerald-400 hover:text-emerald-300"
                    >
                        Back
                    </button>

                    <button
                        onClick={() => {
                            const steps: CreateStep[] = ['platform', 'profile', 'dataType', 'options', 'confirm'];
                            const currentIndex = steps.indexOf(createStep);

                            // Validation
                            if (createStep === 'profile' && !newProfile.trim()) {
                                alert('Please enter a username');
                                return;
                            }

                            if (currentIndex < steps.length - 1) {
                                setCreateStep(steps[currentIndex + 1]);
                            } else {
                                handleStartScrape();
                            }
                        }}
                        disabled={createStep === 'profile' && !newProfile.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                        {createStep === 'confirm' ? 'Start Scraping' : 'Continue'}
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            {viewMode === 'list' && renderListView()}
            {viewMode === 'detail' && renderDetailView()}
            {viewMode === 'create' && renderCreateWizard()}
        </div>
    );
};

export default DatasetPanel;
