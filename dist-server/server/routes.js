import express from 'express';
import db from './database.js';
const router = express.Router();
// --- TRANSACTIONS ---
// GET /api/transactions
router.get('/transactions', (req, res) => {
    db.all("SELECT * FROM transactions ORDER BY date DESC", [], (err, rows) => {
        if (err)
            return res.status(500).json({ error: err.message });
        const results = rows.map(r => ({
            ...r,
            metadata: JSON.parse(r.metadata || '{}'),
            date: r.date
        }));
        res.json(results);
    });
});
// POST /api/transactions
router.post('/transactions', (req, res) => {
    const { id, date, type, cost, description, metadata } = req.body;
    const metaStr = JSON.stringify(metadata || {});
    db.run(`INSERT INTO transactions (id, date, type, cost, description, metadata) VALUES (?, ?, ?, ?, ?, ?)`, [id, date, type, cost, description, metaStr], function (err) {
        if (err)
            return res.status(500).json({ error: err.message });
        res.json({ id, status: 'success' });
    });
});
// GET /api/transactions/total
router.get('/transactions/total', (req, res) => {
    db.get("SELECT SUM(cost) as total FROM transactions", [], (err, row) => {
        if (err)
            return res.status(500).json({ error: err.message });
        res.json({ total: row.total || 0 });
    });
});
// --- DATASETS ---
// GET /api/datasets
router.get('/datasets', (req, res) => {
    db.all("SELECT * FROM datasets ORDER BY createdAt DESC", [], (err, rows) => {
        if (err)
            return res.status(500).json({ error: err.message });
        const results = rows.map(r => {
            const core = JSON.parse(r.full_json);
            return core;
        });
        res.json(results);
    });
});
// GET /api/datasets/:id
router.get('/datasets/:id', (req, res) => {
    db.get("SELECT full_json FROM datasets WHERE id = ?", [req.params.id], (err, row) => {
        if (err)
            return res.status(500).json({ error: err.message });
        if (!row)
            return res.status(404).json({ error: 'Dataset not found' });
        res.json(JSON.parse(row.full_json));
    });
});
// POST /api/datasets
router.post('/datasets', (req, res) => {
    const dataset = req.body;
    const { id, name, platform, targetProfile, dataType, createdAt, recordCount, project, tags, autoTags } = dataset;
    const fullJson = JSON.stringify(dataset);
    const tagStr = JSON.stringify([...(tags || []), ...(autoTags || [])]);
    db.run(`INSERT OR REPLACE INTO datasets (id, name, platform, targetProfile, dataType, createdAt, recordCount, project, tags, full_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, name, platform, targetProfile, dataType, createdAt, recordCount, project, tagStr, fullJson], function (err) {
        if (err)
            return res.status(500).json({ error: err.message });
        res.json({ id, status: 'saved' });
    });
});
// DELETE /api/datasets/:id
router.delete('/datasets/:id', (req, res) => {
    db.run("DELETE FROM datasets WHERE id = ?", [req.params.id], function (err) {
        if (err)
            return res.status(500).json({ error: err.message });
        db.run("DELETE FROM dataset_items WHERE dataset_id = ?", [req.params.id]);
        res.json({ status: 'deleted' });
    });
});
export default router;
