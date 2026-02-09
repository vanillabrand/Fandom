import { Job } from 'agenda';
import { getAgenda, JOB_MINER_STRUCTURE, JOB_MINER_CREATOR, JOB_MINER_TRENDS } from '../agenda.js';
import { mongoService } from '../../services/mongoService.js';

export const compositeMinerProcessor = async (job: Job) => {
    const { query, jobId, userId, sampleSize } = job.attrs.data;
    console.log(`[CompositeMiner] Dispatching Miners for Job ${jobId} ("${query}")`);

    // 1. Initialize Job State in Mongo (if not already set matching this logic)
    // We want to track the status of sub-miners
    await mongoService.updateJob(jobId, {
        progress: 5,
        result: {
            stage: 'Dispatching Composite Miners',
            status: {
                structure: 'pending',
                creators: 'pending',
                trends: 'pending'
            }
        }
    });

    const agenda = getAgenda();

    // 1.5 Extract Handle from Query (Crucial for Natural Language support)
    let targetQuery = query;
    const handleMatch = query.match(/@[\w._]+/);
    if (handleMatch) {
        targetQuery = handleMatch[0];
        console.log(`[CompositeMiner] Extracted handle "${targetQuery}" from natural language query.`);
    }

    // 2. Dispatch Sub-Miners
    // We pass the same jobId so they all write to the same place

    // Miner 1: Structure (The Graph Topology)
    await agenda.now(JOB_MINER_STRUCTURE, {
        query: targetQuery, jobId, userId, sampleSize,
        task: 'structure'
    });

    // Miner 2: Creators (Rising Stars)
    await agenda.now(JOB_MINER_CREATOR, {
        query: targetQuery, jobId, userId, sampleSize,
        task: 'creators'
    });

    // Miner 3: Trends (Content & Hashtags)
    await agenda.now(JOB_MINER_TRENDS, {
        query: targetQuery, jobId, userId, sampleSize,
        task: 'trends'
    });

    console.log(`[CompositeMiner] 🚀 Dispatched 3 Sub-Miners for Job ${jobId}`);
    // This job is now "done" with its duty of dispatching. 
    // The "Composite Job" in Mongo remains 'running' until the sub-miners finish.
};
