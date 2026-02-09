import { mongoService } from './mongoService.js';

// Use the singleton instance directly
// const mongoService = MongoService.getInstance(); // Not needed, already exported

interface AccuracyMetricsOptions {
    start: Date;
    end: Date;
}

interface AccuracyMetrics {
    totalQueries: number;
    avgQualityScore: number;
    avgConfidenceScore: number;
    successRate: number;
    avgResponseTime: number;
    intentAccuracy: {
        [intent: string]: {
            count: number;
            avgQuality: number;
            avgConfidence: number;
        };
    };
}

/**
 * Get overall accuracy metrics for completed jobs within a time range
 */
export async function getAccuracyMetrics(options: AccuracyMetricsOptions): Promise<AccuracyMetrics> {
    const { start, end } = options;

    const db = mongoService.getDb();

    // Get all completed jobs in the time range
    const jobs = await db.collection('jobs')
        .find({
            status: 'completed',
            createdAt: { $gte: start, $lte: end }
        })
        .toArray();

    if (jobs.length === 0) {
        return {
            totalQueries: 0,
            avgQualityScore: 0,
            avgConfidenceScore: 0,
            successRate: 0,
            avgResponseTime: 0,
            intentAccuracy: {}
        };
    }

    // Calculate overall metrics
    const qualityScores = jobs
        .filter(j => j.qualityScore !== undefined)
        .map(j => j.qualityScore);

    const confidenceScores = jobs
        .filter(j => j.confidenceScore !== undefined)
        .map(j => j.confidenceScore);

    const avgQualityScore = qualityScores.length > 0
        ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
        : 0;

    const avgConfidenceScore = confidenceScores.length > 0
        ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
        : 0;

    // Calculate success rate (jobs that completed successfully)
    const totalJobs = await db.collection('jobs')
        .countDocuments({
            createdAt: { $gte: start, $lte: end }
        });

    const successRate = totalJobs > 0
        ? Math.round((jobs.length / totalJobs) * 100)
        : 0;

    // Calculate average response time
    const responseTimes = jobs
        .filter(j => j.createdAt && j.updatedAt)
        .map(j => {
            const created = new Date(j.createdAt).getTime();
            const updated = new Date(j.updatedAt).getTime();
            return (updated - created) / 1000; // seconds
        });

    const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

    // Calculate intent-specific accuracy
    const intentAccuracy: AccuracyMetrics['intentAccuracy'] = {};

    jobs.forEach(job => {
        const intent = job.metadata?.plan?.intent || 'unknown';

        if (!intentAccuracy[intent]) {
            intentAccuracy[intent] = {
                count: 0,
                avgQuality: 0,
                avgConfidence: 0
            };
        }

        intentAccuracy[intent].count++;

        if (job.qualityScore !== undefined) {
            const currentTotal = intentAccuracy[intent].avgQuality * (intentAccuracy[intent].count - 1);
            intentAccuracy[intent].avgQuality = Math.round((currentTotal + job.qualityScore) / intentAccuracy[intent].count);
        }

        if (job.confidenceScore !== undefined) {
            const currentTotal = intentAccuracy[intent].avgConfidence * (intentAccuracy[intent].count - 1);
            intentAccuracy[intent].avgConfidence = Math.round((currentTotal + job.confidenceScore) / intentAccuracy[intent].count);
        }
    });

    return {
        totalQueries: jobs.length,
        avgQualityScore,
        avgConfidenceScore,
        successRate,
        avgResponseTime,
        intentAccuracy
    };
}

/**
 * Record quality feedback for a job
 */
export async function recordQualityFeedback(
    jobId: string,
    userId: string,
    feedback: {
        rating: number; // 1-5
        categories?: string[];
        comment?: string;
    }
): Promise<void> {
    const db = mongoService.getDb();

    await db.collection('query_feedback').insertOne({
        jobId,
        userId,
        feedback,
        timestamp: new Date()
    });

    console.log(`[QueryAccuracy] Recorded feedback for job ${jobId}: ${feedback.rating}/5`);
}

/**
 * Get feedback statistics
 */
export async function getFeedbackStats(options: AccuracyMetricsOptions) {
    const { start, end } = options;
    const db = mongoService.getDb();

    const feedbackDocs = await db.collection('query_feedback')
        .find({
            timestamp: { $gte: start, $lte: end }
        })
        .toArray();

    const totalFeedback = feedbackDocs.length;
    const avgRating = totalFeedback > 0
        ? feedbackDocs.reduce((sum, f) => sum + (f.feedback.rating || 0), 0) / totalFeedback
        : 0;

    // Count categories
    const categoryMap = new Map<string, number>();
    feedbackDocs.forEach(f => {
        f.feedback.categories?.forEach((cat: string) => {
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        });
    });

    const topCategories = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalFeedback,
        avgRating: Math.round(avgRating * 10) / 10,
        topCategories
    };
}
