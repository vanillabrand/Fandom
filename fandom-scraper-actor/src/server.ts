import express from 'express';
import bodyParser from 'body-parser';
import { runActor } from './main.js';
import { Dataset } from 'crawlee';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;

app.get('/', (_req, res) => {
    res.send('Fandom Scraper Service is Running 🚀');
});

// Endpoint to trigger the scraper (FaaS style)
app.post('/scrape', async (req, res) => {
    console.log('[CloudRun] Received scrape request:', req.body);

    try {
        const input = req.body;
        if (!input.platform || !input.targets) {
            return res.status(400).json({ error: 'Missing platform or targets' });
        }

        // Run the actor logic
        await runActor(input);

        // Fetch results from default dataset
        const dataset = await Dataset.open();
        const data = await dataset.getData();

        // Cleanup
        await dataset.drop();

        return res.json({
            status: 'success',
            count: data.count,
            items: data.items
        });

    } catch (error: any) {
        console.error('[CloudRun] Scrape failed:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.listen(PORT, () => {
    console.log(`[CloudRun] Server listening on port ${PORT}`);
});
