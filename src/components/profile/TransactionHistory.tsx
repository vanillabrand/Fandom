import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Loader2, ArrowUpRight, ArrowDownLeft, Clock, Activity, CheckCircle, XCircle, FileText } from 'lucide-react';

interface Transaction {
    _id: string;
    date: string;
    type: string;
    description: string;
    cost: number;
    metadata?: any;
}

interface Job {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    metadata?: any;
    result?: any;
    error?: string;
}

export const TransactionHistory = () => {
    const { token } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [viewMode, setViewMode] = useState<'transactions' | 'queries'>('queries'); // Default to queries as requested
    const [loading, setLoading] = useState(true);
    const [expandedJob, setExpandedJob] = useState<string | null>(null);

    useEffect(() => {
        if (!token) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const [txRes, jobsRes] = await Promise.all([
                    fetch('/api/user/transactions', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/jobs?limit=50', { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                if (txRes.ok) setTransactions(await txRes.json());
                if (jobsRes.ok) setJobs(await jobsRes.json());
            } catch (err) {
                console.error("Failed to fetch history");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [token]);

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString();
        } catch { return 'Invalid Date'; }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-emerald-500 w-6 h-6" /></div>;

    return (
        <div className="space-y-4">
            {/* Toggle View */}
            <div className="flex gap-2">
                <button
                    onClick={() => setViewMode('queries')}
                    className={`px-3 py-1 text-xs font-bold uppercase rounded ${viewMode === 'queries' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-500/40 hover:text-emerald-300'}`}
                >
                    Query History
                </button>
                <button
                    onClick={() => setViewMode('transactions')}
                    className={`px-3 py-1 text-xs font-bold uppercase rounded ${viewMode === 'transactions' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-emerald-500/40 hover:text-emerald-300'}`}
                >
                    Financial Transactions
                </button>
            </div>

            {viewMode === 'queries' ? (
                <div className="space-y-2">
                    {jobs.length === 0 && <p className="text-center text-emerald-500/40 py-8 text-sm">No queries found.</p>}
                    {jobs.map((job) => (
                        <div key={job.id} className="bg-[#0a1f16] border border-emerald-900/30 rounded-lg overflow-hidden transition-all hover:border-emerald-500/30">
                            <div
                                className="p-3 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                            >
                                <div className="flex items-center gap-3">
                                    {job.status === 'completed' ? <CheckCircle size={16} className="text-emerald-500" /> :
                                        job.status === 'failed' ? <XCircle size={16} className="text-red-500" /> :
                                            <Activity size={16} className="text-blue-500 animate-pulse" />}

                                    <div>
                                        <div className="text-sm font-bold text-gray-200">
                                            {job.metadata?.query || job.type}
                                        </div>
                                        <div className="text-[10px] text-emerald-500/50 font-mono">
                                            {formatDate(job.createdAt)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {job.metadata?.estimatedCost && (
                                        <span className="text-xs font-mono text-emerald-300">£{job.metadata.estimatedCost.toFixed(2)}</span>
                                    )}
                                    <FileText size={14} className={`text-emerald-500/50 ${expandedJob === job.id ? 'rotate-180' : ''}`} />
                                </div>
                            </div>

                            {/* Detailed Log View */}
                            {expandedJob === job.id && (
                                <div className="p-3 bg-black/20 border-t border-emerald-900/30 text-xs font-mono text-emerald-500/70 whitespace-pre-wrap">
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div><span className="opacity-50">ID:</span> {job.id}</div>
                                        <div><span className="opacity-50">Type:</span> {job.type}</div>
                                        <div><span className="opacity-50">Status:</span> {job.status}</div>
                                    </div>
                                    {job.error && <div className="text-red-400 mb-2">Error: {job.error}</div>}
                                    <div className="opacity-50 mb-1">Result Summary:</div>
                                    {JSON.stringify(job.result, null, 2)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {transactions.length === 0 && <p className="text-center text-emerald-500/40 py-8 text-sm">No transactions found.</p>}
                    {transactions.map((tx) => (
                        <div key={tx._id} className="flex items-center justify-between p-3 rounded-lg bg-[#0a1f16] border border-emerald-900/30">
                            <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-md ${tx.type === 'TopUp' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                    {tx.type === 'TopUp' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                </div>
                                <div>
                                    <div className="font-medium text-gray-200 text-sm">{tx.description}</div>
                                    <div className="text-[10px] text-emerald-500/50 font-mono">{formatDate(tx.date)}</div>
                                </div>
                            </div>
                            <div className={`font-mono font-bold text-sm ${tx.type === 'TopUp' ? 'text-emerald-400' : 'text-gray-500'}`}>
                                {tx.type === 'TopUp' ? '+' : '-'}£{Math.abs(tx.cost || (tx.metadata?.amount || 0)).toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
