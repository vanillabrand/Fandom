import { BaseMiner } from './baseMiner.js';
import { analyzeVisualContent } from '../../../services/geminiService.js';
import { mongoService } from '../../services/mongoService.js';
export const visualMinerProcessor = async (job) => {
    const { query, jobId, userId, datasetId } = job.attrs.data;
    console.log(`[VisualMiner] Starting for Job ${jobId} ("${query}")...`);
    try {
        await BaseMiner.updateSubTaskProgress(jobId, 'visual', 10, 'Fetching Dataset Images...');
        // 1. Fetch images from the dataset
        // We limit to 50 images for now to manage costs/rate limits
        const imageRecords = await mongoService.getDatasetImages(datasetId, 50);
        if (!imageRecords || imageRecords.length === 0) {
            console.log(`[VisualMiner] No images found for dataset ${datasetId}. Skipping visual analysis.`);
            await BaseMiner.completeSubTask(jobId, 'visual', {
                status: 'skipped',
                reason: 'No images found'
            });
            return;
        }
        const imageUrls = imageRecords.map(r => r.imageUrl);
        console.log(`[VisualMiner] Found ${imageUrls.length} images. Starting AI Analysis...`);
        await BaseMiner.updateSubTaskProgress(jobId, 'visual', 30, `Analyzing ${imageUrls.length} Images...`);
        // 2. Perform Visual Analysis
        const analysisResult = await analyzeVisualContent(imageUrls, 'full');
        await BaseMiner.updateSubTaskProgress(jobId, 'visual', 90, 'Finalizing Visual DNA...');
        // 3. Complete Task
        await BaseMiner.completeSubTask(jobId, 'visual', {
            status: 'completed',
            count: imageUrls.length,
            brands: analysisResult.brands,
            aestheticTags: analysisResult.aestheticTags,
            vibeDescription: analysisResult.vibeDescription,
            colorPalette: analysisResult.colorPalette,
            products: analysisResult.products
        });
        console.log(`[VisualMiner] ✅ Finished Job ${jobId}`);
    }
    catch (e) {
        console.error(`[VisualMiner] Failed: ${e.message}`);
        await BaseMiner.handleFailure(jobId, 'visual', e);
        // Don't throw, just allow the composite miner to proceed with partial results
    }
};
