import sqlite3v from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const sqlite3 = sqlite3v.verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../fandom.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initSchema();
    }
});

function initSchema() {
    db.serialize(() => {
        // Transactions Table
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT,
            type TEXT,
            cost REAL,
            description TEXT,
            metadata TEXT
        )`);

        // Datasets Table
        db.run(`CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY,
            name TEXT,
            platform TEXT,
            targetProfile TEXT,
            dataType TEXT,
            createdAt TEXT,
            recordCount INTEGER,
            project TEXT,
            tags TEXT, 
            full_json TEXT
        )`);

        // Dataset Items Table
        db.run(`CREATE TABLE IF NOT EXISTS dataset_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataset_id TEXT,
            data TEXT,
            FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
        )`);

        // Jobs Table (Background Tasks)
        db.run(`CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            userId TEXT,
            type TEXT,
            status TEXT,
            progress INTEGER DEFAULT 0,
            result TEXT,
            error TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`);

        // Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_datasets_platform ON datasets(platform)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_datasets_profile ON datasets(targetProfile)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_dataset_items_dsid ON dataset_items(dataset_id)`);

        console.log('Schema initialized.');
    });
}

export default db;
