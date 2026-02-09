/**
 * Vector Service
 * Handles embedding generation and cosine similarity search for client-side vector database 
 */

import { GoogleGenAI } from "@google/genai";
import {
    Dataset,
    VectorIndex,
    VectorSearchResult,
    VectorMatch
} from "../types.js";

// Lazy initialization for GoogleGenAI client (sharing config with geminiService logic)
let aiClient: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!aiClient) {
        const apiKey = (typeof window !== 'undefined' && (window as any).__ENV__?.GEMINI_API_KEY)
            ? (window as any).__ENV__.GEMINI_API_KEY
            : (process.env.API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || process.env.GEMINI_API_KEY);

        if (!apiKey) {
            console.warn("VectorService: Gemini API Key missing.");
            throw new Error("API Key missing");
        }
        aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
};

const EMBEDDING_MODEL = "models/text-embedding-004";
const BATCH_SIZE = 20; // Gemini embedding batch limit

/**
 * Clean and prepare text for embedding
 */
const cleanText = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\s+/g, " ") // Collapse whitespace
        .trim()
        .substring(0, 2000); // Truncate to safe length
};

/**
 * Extract searchable text from a dataset record based on its type
 */
const extractTextFromRecord = (record: any, type: string): string => {
    const parts: string[] = [];

    if (type === 'posts') {
        if (record.caption) parts.push(record.caption);
        if (record.hashtags && Array.isArray(record.hashtags)) parts.push(record.hashtags.join(' '));
        if (record.location) parts.push(typeof record.location === 'string' ? record.location : record.location.name);
    } else if (type === 'followers' || type === 'following' || type === 'profiles' || type === 'overindexed') {
        if (record.fullName) parts.push(record.fullName);
        if (record.biography || record.bio) parts.push(record.biography || record.bio);
        if (record.category) parts.push(record.category);
    }

    return cleanText(parts.join(" "));
};

/**
 * Generate embeddings for a list of texts
 */
export const generateEmbeddings = async (texts: string[]): Promise<number[][]> => {
    try {
        const validTexts = texts.filter(t => t.length > 0);
        if (validTexts.length === 0) return [];

        console.log(`Generating embeddings for ${validTexts.length} items...`);

        // Process in batches
        const allEmbeddings: number[][] = [];
        const ai = getAiClient(); // Get client once per function call

        for (let i = 0; i < validTexts.length; i += BATCH_SIZE) {
            // Add delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests

            const batch = validTexts.slice(i, i + BATCH_SIZE);

            const result = await ai.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: batch.map(text => ({
                    parts: [{ text }]
                }))
            });

            if (result.embeddings) {
                allEmbeddings.push(...result.embeddings.map(e => e.values));
            }
        }

        return allEmbeddings;
    } catch (err) {
        console.error("Embedding generation failed:", err);
        throw err;
    }
};

/**
 * Calculate Cosine Similarity between two vectors
 * A . B / (|A| * |B|)
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Create or update vector index for a dataset
 */
export const indexDataset = async (dataset: Dataset): Promise<Dataset> => {
    // Extract texts from all records
    const texts = dataset.data.map(record =>
        extractTextFromRecord(record, dataset.dataType === 'composite' ? record.recordType : dataset.dataType)
    );

    // Identify records that need embeddings (have text but no vector)
    // For simplicity, we'll re-index everything for now, can optimize later
    // to only index new/changed items

    const embeddings = await generateEmbeddings(texts);

    // Attach vectors to records (requires modifying the data array structure to hold vectors)
    // We'll add a parallel array property `vectors` to the dataset for storage efficiency
    // or modify the `data` objects directly. Given the constraint of not updating all types deeply,
    // let's assume we update the dataset object.

    // Update dataset data with vectors attached (not ideal for storage size in JSON but ok for IndexedDB)
    // Better approach: Store distinct 'vectors' map in dataset

    // NOTE: For this implementation, we will append a hidden property `_vector` to the data objects
    dataset.data.forEach((record, i) => {
        if (embeddings[i]) {
            record._embedding = embeddings[i];
        }
    });

    const vectorIndex: VectorIndex = {
        enabled: true,
        status: 'ready',
        lastIndexedAt: new Date(),
        vectorCount: embeddings.length,
        embeddingModel: EMBEDDING_MODEL,
        dimensions: embeddings[0]?.length || 768
    };

    return {
        ...dataset,
        vectorIndex
    };
};

/**
 * Search the vector index of a dataset
 */
export const searchDataset = async (
    dataset: Dataset,
    query: string,
    topK: number = 10
): Promise<VectorSearchResult> => {
    const start = performance.now();

    if (!dataset.vectorIndex?.enabled) {
        throw new Error("Dataset is not indexed for vector search");
    }

    const ai = getAiClient(); // [FIX] Initialize client

    // Generate query embedding
    const queryResponse = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text: query }] }]
    });

    const queryVector = queryResponse.embeddings?.[0]?.values;

    if (!queryVector) {
        throw new Error("Failed to generate query embedding");
    }

    // Brute force search
    const candidates: VectorMatch[] = [];

    dataset.data.forEach((record, idx) => {
        if (record._embedding) {
            const score = cosineSimilarity(queryVector, record._embedding);
            if (score > 0.3) { // Min relevancy threshold
                candidates.push({
                    datasetId: dataset.id,
                    recordIndex: idx,
                    score,
                    text: extractTextFromRecord(record, dataset.dataType === 'composite' ? record.recordType : dataset.dataType),
                    metadata: record
                });
            }
        }
    });

    // Sort and slice
    const matches = candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    const end = performance.now();

    return {
        matches,
        totalCandidates: candidates.length,
        inferenceTime: end - start
    };
};

/**
 * Search across MULTIPLE datasets and aggregate results
 */
export const searchAllDatasets = async (
    datasets: Dataset[],
    query: string,
    topK: number = 20
): Promise<VectorMatch[]> => {
    // 1. Filter enabled datasets
    const enabledDatasets = datasets.filter(d => d.vectorIndex?.enabled && d.data?.length > 0);

    if (enabledDatasets.length === 0) return [];

    console.log(`Searching across ${enabledDatasets.length} datasets for: "${query}"`);

    // 2. Parallel Search
    const searchPromises = enabledDatasets.map(d =>
        searchDataset(d, query, topK)
            .then(res => res.matches)
            .catch(err => {
                console.warn(`Search failed for dataset ${d.id}`, err);
                return [] as VectorMatch[];
            })
    );

    const allMatches = await Promise.all(searchPromises);
    const flatMatches = allMatches.flat();

    // 3. Sort by Score & Dedup
    return flatMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, topK); // Global Top K
};

/**
 * Ensure all provided datasets have vector indices.
 * Triggers background indexing for missing ones.
 */
export const ensureVectors = async (
    datasets: Dataset[],
    onProgress?: (msg: string) => void
): Promise<void> => {
    const missing = datasets.filter(d => !d.vectorIndex || !d.vectorIndex.enabled);

    if (missing.length === 0) return;

    console.log(`Indexing ${missing.length} datasets...`);
    if (onProgress) onProgress(`Indexing ${missing.length} datasets for search...`);

    // Process sequentially to avoid rate limits? Or parallel?
    // Gemini has rate limits. Safe to do sequential or small batch.

    for (const d of missing) {
        if (!d.data || d.data.length === 0) continue;
        try {
            if (onProgress) onProgress(`Indexing: ${d.name}...`);
            // Note: In a real app, we'd save this back to storage. 
            // Here we are mutating the in-memory object (which might need to be persisted by caller)
            // Ideally this function returns the UPDATED datasets or calls a save service.
            // For now, we assume the object reference is shared and caller saves.
            const updated = await indexDataset(d);

            // Mutate original reference for immediate UI availability
            d.vectorIndex = updated.vectorIndex;
            d.data = updated.data; // Includes _embedding

            console.log(`Indexed ${d.id}`);
        } catch (e) {
            console.error(`Failed to index ${d.id}`, e);
        }
    }

    if (onProgress) onProgress("Indexing complete.");
};
