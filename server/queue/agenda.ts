import { Agenda } from 'agenda';
import { BaseMiner } from './processors/baseMiner.js';

// Job Types Constants
export const JOB_MINER_COMPOSITE = 'miner-composite';
export const JOB_MINER_STRUCTURE = 'miner-structure';
export const JOB_MINER_CREATOR = 'miner-creator';
export const JOB_MINER_TRENDS = 'miner-trends';
export const JOB_MINER_VISUAL = 'miner-visual'; // [NEW] Visual Intelligence
export const JOB_MINER_SIMPLE = 'miner-simple'; // Legacy/Direct

// Job Priority (Numbers for Agenda)
export const JOB_PRIORITY = {
    LOW: 10,
    NORMAL: 0,
    HIGH: 10,
    CRITICAL: 20
};

let agenda: Agenda | null = null;

// Initialize function to start the agenda
export const startAgenda = async () => {
    const mongoConnectionString = process.env.MONGO_DB_CONNECT || process.env.MONGODB_URI;

    if (!mongoConnectionString) {
        console.error('❌ [Agenda] No MongoDB Connection String found. Job Queue will NOT start.');
        return null;
    }

    if (agenda) return agenda;

    console.log('🔌 [Agenda] Connecting to Job Queue...');

    agenda = new Agenda({
        db: { address: mongoConnectionString, collection: 'agendaJobs' },
        processEvery: '10 seconds', // Poll interval (Agenda uses polling internally)
        maxConcurrency: 20,         // Global max jobs processing at once
        defaultConcurrency: 5,      // Default max jobs per definition
    });

    // Inject Agenda into BaseMiner to resolve circular dependency for Visual Miner dispatch
    BaseMiner.setAgenda(agenda);

    // Define Processors (Imported dynamically to avoid circular deps if needed)
    await setupProcessors(agenda);

    await agenda.start();
    console.log('✅ [Agenda] Job Queue started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        await agenda!.stop();
        console.log('🛑 [Agenda] Shut down gracefully');
        process.exit(0);
    });

    return agenda;
};

// Helper to get the instance
export const getAgenda = () => {
    if (!agenda) {
        throw new Error('Agenda not initialized! Call startAgenda() first.');
    }
    return agenda;
};

import { compositeMinerProcessor } from './processors/compositeMiner.js';
import { structureMinerProcessor } from './processors/structureMiner.js';
import { creatorMinerProcessor } from './processors/creatorMiner.js';
import { trendsMinerProcessor } from './processors/trendsMiner.js';
import { visualMinerProcessor } from './processors/visualMiner.js';

async function setupProcessors(agenda: Agenda) {
    // Define the "Parent" Job
    agenda.define(JOB_MINER_COMPOSITE, { priority: 10, concurrency: 5 }, compositeMinerProcessor);

    // Define Sub-Miners
    agenda.define(JOB_MINER_STRUCTURE, { priority: 0, concurrency: 5 }, structureMinerProcessor);
    agenda.define(JOB_MINER_CREATOR, { priority: 0, concurrency: 5 }, creatorMinerProcessor);
    agenda.define(JOB_MINER_CREATOR, { priority: 0, concurrency: 5 }, creatorMinerProcessor);
    agenda.define(JOB_MINER_TRENDS, { priority: 0, concurrency: 5 }, trendsMinerProcessor);
    agenda.define(JOB_MINER_VISUAL, { priority: 0, concurrency: 2 }, visualMinerProcessor); // Lower concurrency for AI limits

    console.log('[Agenda] All Miner Processors Registered.');
}
