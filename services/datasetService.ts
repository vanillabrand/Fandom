/**
 * Dataset Service (MongoDB Backend)
 * Handles dataset storage, retrieval, and fingerprint-based deduplication
 */

import {
    Dataset,
    DatasetSummary,
    DatasetSearchCriteria,
    DatasetType,
    DatasetPlatform,
    DatasetSource
} from '../types.js';

import { fetchWithRetry } from '../utils/httpUtils.js';

const API_BASE = '/api';

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('AUTH_TOKEN') : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

/**
 * Generate unique ID for datasets
 */
const generateId = (): string => {
    return `ds_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Generate auto-tags based on dataset content
 */
const generateAutoTags = (dataset: Partial<Dataset>): string[] => {
    const tags: string[] = [];
    if (dataset.platform) tags.push(dataset.platform);
    if (dataset.dataType) tags.push(dataset.dataType);
    if (dataset.recordCount) {
        if (dataset.recordCount >= 10000) tags.push('large');
        else if (dataset.recordCount >= 1000) tags.push('medium');
        else tags.push('small');
    }
    const now = new Date();
    const created = dataset.createdAt instanceof Date ? dataset.createdAt : new Date(dataset.createdAt || now);
    const daysSinceCreation = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCreation <= 7) tags.push('recent');
    else if (daysSinceCreation <= 30) tags.push('this-month');
    else tags.push('archived');
    return tags;
};

/**
 * Create a new dataset
 */
export const createDataset = async (
    data: Omit<Dataset, 'id' | 'createdAt' | 'updatedAt' | 'autoTags' | 'queriesUsedFor'>
): Promise<Dataset> => {
    const now = new Date();
    const dataset: Dataset = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        autoTags: [],
        queriesUsedFor: [],
        sources: data.sources || [],
        vectorIndex: {
            enabled: false,
            status: 'pending',
            vectorCount: 0,
            embeddingModel: 'models/text-embedding-004',
            dimensions: 0
        }
    };

    dataset.autoTags = generateAutoTags(dataset);

    const res = await fetchWithRetry(`${API_BASE}/datasets`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(dataset)
    });

    if (!res.ok) throw new Error(`Failed to create dataset: ${res.statusText}`);
    return dataset;
};

/**
 * Add new data source to an existing dataset (Composite Dataset)
 */
export const addToDataset = async (
    datasetId: string,
    newData: any[],
    newSource: DatasetSource
): Promise<Dataset> => {
    const dataset = await getDataset(datasetId);
    if (!dataset) throw new Error('Dataset not found');

    const taggedData = newData.map(item => ({
        ...item,
        recordType: newSource.type,
        _sourceId: newSource.id
    }));

    const updatedDataset: Dataset = {
        ...dataset,
        updatedAt: new Date(),
        dataType: dataset.dataType === newSource.type ? dataset.dataType : 'composite',
        recordCount: dataset.recordCount + taggedData.length,
        sources: [...(dataset.sources || []), newSource],
        data: [...dataset.data, ...taggedData],
        vectorIndex: dataset.vectorIndex ? { ...dataset.vectorIndex, status: 'pending' } : undefined
    };

    updatedDataset.autoTags = generateAutoTags(updatedDataset);

    const res = await fetchWithRetry(`${API_BASE}/datasets`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedDataset)
    });

    if (!res.ok) throw new Error(`Failed to update dataset: ${res.statusText}`);
    return updatedDataset;
};


/**
 * Get a dataset by ID
 */
export const getDataset = async (id: string): Promise<Dataset | null> => {
    try {
        const res = await fetch(`${API_BASE}/datasets/${id}`, {
            headers: getAuthHeaders()
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(res.statusText);

        const data = await res.json();
        return {
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt)
        };
    } catch (e) {
        console.error("Error fetching dataset:", e);
        return null;
    }
};

/**
 * Update an existing dataset
 */
export const updateDataset = async (
    id: string,
    updates: Partial<Omit<Dataset, 'id' | 'createdAt'>>
): Promise<Dataset | null> => {
    const existing = await getDataset(id);
    if (!existing) return null;

    const updated: Dataset = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date()
    };

    if (updates.recordCount !== undefined || updates.platform || updates.dataType) {
        updated.autoTags = generateAutoTags(updated);
    }

    const res = await fetch(`${API_BASE}/datasets`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updated)
    });

    if (!res.ok) throw new Error(`Update failed: ${res.statusText}`);
    return updated;
};

/**
 * Delete a dataset by ID
 */
export const deleteDataset = async (id: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/datasets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    return res.ok;
};

// Helper for timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

/**
 * Get all datasets with pagination support
 * @param options - Pagination options (limit, skip, platform)
 */
export const getAllDatasets = async (options?: {
    limit?: number;
    skip?: number;
    platform?: string;
    includeData?: boolean;
}): Promise<Dataset[]> => {
    try {
        const params = new URLSearchParams();
        if (options?.limit) params.append('limit', options.limit.toString());
        if (options?.skip) params.append('skip', options.skip.toString());
        if (options?.platform) params.append('platform', options.platform);
        if (options?.includeData) params.append('includeData', 'true');

        const url = `${API_BASE}/datasets${params.toString() ? '?' + params.toString() : ''}`;

        // [FIX] Add timeout (30s) to preventing hangs, but allow for Cold Starts
        const res = await fetchWithTimeout(url, { headers: getAuthHeaders() }, 30000);

        if (!res.ok) return [];
        let datasets = await res.json();

        // Fix dates
        datasets = datasets.map((d: any) => ({
            ...d,
            createdAt: new Date(d.createdAt),
            updatedAt: new Date(d.updatedAt)
        }));

        return datasets;
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.warn("Dataset fetch timed out (30000ms). Available datasets list may be incomplete.");
        } else {
            console.error("Error getting all datasets:", e);
        }
        return [];
    }
};

/**
 * Search datasets by criteria
 * (Optimized: Pushes filtering to server where possible)
 */
export const searchDatasets = async (criteria: DatasetSearchCriteria): Promise<Dataset[]> => {
    // [OPTIMIZATION] If we have specific criteria that the API supports, pass them!
    // The API supports: limit, skip, platform, tags, includeData

    // Check if we need data (default to true for search unless specified otherwise?)
    // Actually, orchestration NEEDS data.

    const options: any = {
        includeData: true, // We usually search to USE the data
        limit: 100 // Safety limit
    };

    if (criteria.platform) options.platform = criteria.platform;

    // If we have tags (e.g. Signature), pass them to server for efficient lookup
    if (criteria.tags && criteria.tags.length > 0) {
        // We can only pass one tag or a comma-separated list depending on API support
        // Our API takes ?tags=a,b and does an $in query.
        options.tags = criteria.tags.join(',');
    }

    // Server-side fetch
    // Note: This returns datasets matching platform AND tags (if provided)
    const candidates = await getAllDatasets(options);

    // Client-side refinement (for criteria NOT supported by API yet, e.g. targetProfile fuzzy match, date ranges)
    return candidates.filter(dataset => {
        if (criteria.targetProfile) {
            const searchProfile = criteria.targetProfile.toLowerCase();
            if (!dataset.targetProfile.toLowerCase().includes(searchProfile)) return false;
        }

        if (criteria.dataType && dataset.dataType !== criteria.dataType) return false;
        if (criteria.project && dataset.project !== criteria.project) return false;

        // Tags are handled by server, but we double check if strict match needed?
        // API does $in (OR). If we need AND, we filter here.
        // For signature, it's usually a single unique tag, so API is sufficient.

        if (criteria.dateFrom) {
            const from = criteria.dateFrom instanceof Date ? criteria.dateFrom : new Date(criteria.dateFrom);
            if (new Date(dataset.createdAt) < from) return false;
        }

        if (criteria.dateTo) {
            const to = criteria.dateTo instanceof Date ? criteria.dateTo : new Date(criteria.dateTo);
            if (new Date(dataset.createdAt) > to) return false;
        }

        if (criteria.query) {
            const q = criteria.query.toLowerCase();
            const searchableText = [
                dataset.name,
                dataset.targetProfile,
                dataset.project || '',
                ...dataset.tags,
                ...dataset.autoTags,
                ...dataset.queriesUsedFor
            ].join(' ').toLowerCase();

            if (!searchableText.includes(q)) return false;
        }

        // Cache min age check
        if (criteria.minAgeHours) {
            const ageHours = (Date.now() - new Date(dataset.createdAt).getTime()) / (1000 * 60 * 60);
            if (ageHours > criteria.minAgeHours) return false;
        }

        return true;
    });
};

export const findByPlatform = async (platform: DatasetPlatform): Promise<Dataset[]> => {
    return searchDatasets({ platform });
};

export const findByProfile = async (profile: string): Promise<Dataset[]> => {
    return searchDatasets({ targetProfile: profile });
};

export const findByTags = async (tags: string[]): Promise<Dataset[]> => {
    return searchDatasets({ tags });
};

export const getDatasetSummaries = async (): Promise<DatasetSummary[]> => {
    const datasets = await getAllDatasets();
    return datasets.map(d => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        targetProfile: d.targetProfile,
        dataType: d.dataType,
        recordCount: d.recordCount,
        createdAt: d.createdAt,
        tags: [...(d.tags || []), ...(d.autoTags || [])]
    }));
};

export const recordQueryUsage = async (datasetId: string, query: string): Promise<void> => {
    const dataset = await getDataset(datasetId);
    if (!dataset) return;
    const queriesUsedFor = [...new Set([...dataset.queriesUsedFor, query])];
    await updateDataset(datasetId, { queriesUsedFor });
};

export const getStorageStats = async (): Promise<any> => {
    const datasets = await getAllDatasets();
    // Re-implement stats logic if needed, simple placeholder for now
    let totalRecords = 0;
    datasets.forEach(d => totalRecords += d.recordCount);
    return {
        totalDatasets: datasets.length,
        totalRecords,
        byPlatform: {},
        byDataType: {}
    };
};

// Re-export context helper (pure function)
export const getDatasetContext = (dataset: Dataset, limit: number = 20): string => {
    let context = `Dataset: ${dataset.name} (${dataset.dataType})\n`;
    context += `Platform: ${dataset.platform}\n`;
    context += `Refers to: @${dataset.targetProfile}\n`;
    context += `Total Records: ${dataset.recordCount}\n\n`;

    context += `Sample Data (${Math.min(limit, dataset.data.length)} items):\n`;
    const sample = dataset.data.slice(0, limit);

    if (dataset.dataType === 'posts') {
        sample.forEach((item, i) => {
            // @ts-ignore
            context += `${i + 1}. [${item.timestamp}] ${item.caption?.substring(0, 100)}...\n`;
        });
    } else if (['followers', 'following', 'overindexed'].includes(dataset.dataType)) {
        sample.forEach((item, i) => {
            // @ts-ignore
            context += `${i + 1}. @${item.username || item.ownerUsername} (${item.fullName || ''}) - ${item.followerCount || 0} followers\n`;
        });
    } else {
        sample.forEach((item, i) => {
            context += `${i + 1}. ${JSON.stringify(item).substring(0, 150)}...\n`;
        });
    }
    return context;
};

export const clearAllDatasets = async (): Promise<void> => {
    // Dangerous API call - maybe skip implement or add specific route?
    console.warn("clearAllDatasets not implemented in API version");
};

export const findProfileAnalytics = async (username: string): Promise<any | null> => {
    const candidates = await searchDatasets({ query: username });
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const norm = (s: string) => (s || '').toLowerCase().replace('@', '').trim();
    const target = norm(username);

    for (const dataset of candidates) {
        const record = dataset.data.find((item: any) => {
            const itemUser = norm(item.username || item.ownerUsername || item.id);
            return itemUser === target;
        });
        if (record) return { ...record, fullName: record.fullName || record.full_name };
    }
    return null;
};

export const getBatchProfileAnalytics = async (usernames: string[]): Promise<Map<string, any>> => {
    if (!usernames || usernames.length === 0) return new Map();

    try {
        const res = await fetch(`${API_BASE}/analytics/batch-profiles`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ usernames })
        });

        if (!res.ok) {
            console.warn(`[BatchAnalytics] Failed to fetch: ${res.statusText}`);
            return new Map();
        }

        const profiles: any[] = await res.json();

        const results = new Map<string, any>();
        profiles.forEach(p => {
            const u = (p.username || p.ownerUsername || '').toLowerCase();
            if (u) {
                results.set(u, { ...p, fullName: p.fullName || p.full_name });
            }
        });

        return results;
    } catch (e) {
        console.error("Error in getBatchProfileAnalytics:", e);
        return new Map();
    }
};

/**
 * Export datasets to JSON (for backup)
 */
export const exportDatasets = async (): Promise<string> => {
    const datasets = await getAllDatasets({ limit: 1000 }); // Limit to reasonable backup size
    return JSON.stringify(datasets, null, 2);
};

/**
 * Import datasets from JSON (for restore)
 */
export const importDatasets = async (jsonString: string): Promise<number> => {
    try {
        const datasets: Dataset[] = JSON.parse(jsonString);
        let importCount = 0;

        // Serial import to avoid overwhelming server IO
        for (const dataset of datasets) {
            // New ID for import to avoid collision? Or keep same if migration?
            // Strategy: Create new
            const newDs = {
                ...dataset,
                id: undefined, // Let create generate new ID
                sources: dataset.sources || []
            };
            // @ts-ignore
            await createDataset(newDs);
            importCount++;
        }
        return importCount;
    } catch (e) {
        console.error("Import failed:", e);
        throw e;
    }
};
