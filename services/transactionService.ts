/**
 * Transaction Service
 * Handles API interactions for budget transactions (SQlite Backend)
 */

import { Transaction } from '../types.js';

const API_BASE = '/api';
import { fetchWithRetry } from '../utils/httpUtils.js';

/**
 * Add a new transaction
 */
export const addTransaction = async (
    t: Omit<Transaction, 'id' | 'date'>
): Promise<Transaction> => {
    try {
        const payload = {
            ...t,
            id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            date: new Date().toISOString()
        };

        const res = await fetchWithRetry(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return {
            ...payload,
            date: new Date(payload.date)
        } as Transaction;
    } catch (err) {
        console.error("Failed to save transaction:", err);
        // Fallback? Or just throw
        throw err;
    }
};

/**
 * Get all transactions (descending by date)
 */
export const getTransactions = async (limit: number = 50): Promise<Transaction[]> => {
    try {
        const res = await fetch(`${API_BASE}/transactions`);
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);

        let data = await res.json();

        // Convert date strings back to Date objects
        data = data.map((t: any) => ({
            ...t,
            date: new Date(t.date)
        }));

        if (limit > 0) return data.slice(0, limit);
        return data;
    } catch (err) {
        console.error("Failed to fetch transactions:", err);
        return [];
    }
};

/**
 * Get total spent
 */
export const getTotalSpent = async (): Promise<number> => {
    try {
        const res = await fetch(`${API_BASE}/transactions/total`);
        if (!res.ok) return 0;
        const data = await res.json();
        return data.total || 0;
    } catch (err) {
        // console.warn("Failed to fetch total spent (backend offline?)");
        return 0;
    }
};
