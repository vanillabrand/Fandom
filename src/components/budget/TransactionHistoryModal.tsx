import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Calendar, Filter, Trash2, ArrowRight } from 'lucide-react';
import { getTransactions } from '../../../services/transactionService.js';
import { Transaction } from '../../../types.js';

interface TransactionHistoryModalProps {
    onClose: () => void;
}

type DateFilter = 'all' | 'today' | 'month' | 'year' | 'custom';

export const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({ onClose }) => {
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Filter States
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState<DateFilter>('all');
    const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

    useEffect(() => {
        const load = async () => {
            const data = await getTransactions(1000); // Load enough to support client-side filtering
            setAllTransactions(data);
            setFilteredTransactions(data);
            setLoading(false);
        };
        load();
    }, []);

    // Apply filters
    useEffect(() => {
        let result = allTransactions;

        // 1. Text Search (Description or Type)
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.description.toLowerCase().includes(q) ||
                t.type.toLowerCase().includes(q)
            );
        }

        // 2. Date Filter
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);

        switch (dateFilter) {
            case 'today':
                result = result.filter(t => new Date(t.date) >= today);
                break;
            case 'month':
                result = result.filter(t => new Date(t.date) >= thisMonth);
                break;
            case 'year':
                result = result.filter(t => new Date(t.date) >= thisYear);
                break;
            case 'custom':
                if (customDateRange.start) {
                    const start = new Date(customDateRange.start);
                    result = result.filter(t => new Date(t.date) >= start);
                }
                if (customDateRange.end) {
                    const end = new Date(customDateRange.end);
                    // Set end date to end of day
                    end.setHours(23, 59, 59, 999);
                    result = result.filter(t => new Date(t.date) <= end);
                }
                break;
            default:
                break; // 'all'
        }

        setFilteredTransactions(result);
        setCurrentPage(1);
    }, [searchQuery, dateFilter, customDateRange, allTransactions]);

    // Pagination
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

    const totalCost = filteredTransactions.reduce((sum, t) => sum + t.cost, 0);

    const clearFilters = () => {
        setSearchQuery('');
        setDateFilter('all');
        setCustomDateRange({ start: '', end: '' });
    };

    return ReactDOM.createPortal(
        // Full Screen Overlay - using Z-Max and Portal to escape parent contexts
        <div className="fixed inset-0 z-[9999] bg-[#050B14] flex flex-col w-screen h-screen animate-in fade-in duration-200">

            {/* Top Navigation Bar */}
            <div className="h-16 border-b border-emerald-500/20 flex items-center justify-between px-6 bg-[#050B14] shrink-0">
                <div className="flex items-center gap-4">
                    <div className="bg-emerald-900/20 p-2 rounded-lg border border-emerald-500/20">
                        <Filter className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Transaction History</h1>
                        <p className="text-xs text-emerald-400/60 font-mono mt-0.5">
                            Total Loaded: {allTransactions.length} • Filtered: {filteredTransactions.length}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] text-emerald-500/70 uppercase tracking-widest font-bold">Total Spend</div>
                        <div className="text-lg font-mono text-emerald-300 font-bold">${totalCost.toFixed(4)}</div>
                    </div>
                    <div className="h-8 w-px bg-emerald-500/20 mx-2 hidden sm:block"></div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-500/10 rounded-full transition-colors text-gray-400 hover:text-red-400 group flex items-center gap-2 px-4 border border-transparent hover:border-red-500/30"
                    >
                        <span className="text-sm font-medium">Close</span>
                        <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Toolbar / Filters */}
            <div className="px-6 py-4 border-b border-emerald-500/10 bg-[#0a2f1f]/20 flex flex-wrap items-center gap-4 shrink-0 transition-all">

                {/* Search */}
                <div className="relative group w-full max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/50 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#050B14] border border-emerald-500/30 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

                <div className="h-8 w-px bg-emerald-500/10 hidden sm:block"></div>

                {/* Standard Date Filters */}
                <div className="flex items-center gap-1 bg-[#050B14] p-1 rounded-lg border border-emerald-500/20">
                    {(['all', 'today', 'month', 'year'] as DateFilter[]).map(filter => (
                        <button
                            key={filter}
                            onClick={() => { setDateFilter(filter); setCustomDateRange({ start: '', end: '' }); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${dateFilter === filter
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-emerald-200 hover:bg-emerald-500/10'
                                }`}
                        >
                            {filter === 'all' ? 'All Time' : filter}
                        </button>
                    ))}
                    <button
                        onClick={() => setDateFilter('custom')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${dateFilter === 'custom'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-emerald-200 hover:bg-emerald-500/10'
                            }`}
                    >
                        <Calendar className="w-3 h-3" />
                        Custom
                    </button>
                </div>

                {/* Custom Date Range Inputs */}
                {dateFilter === 'custom' && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 ml-2">
                        <input
                            type="date"
                            value={customDateRange.start}
                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-[#051810] border border-emerald-500/30 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-400 outline-none"
                        />
                        <ArrowRight className="w-3 h-3 text-emerald-500/50" />
                        <input
                            type="date"
                            value={customDateRange.end}
                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-[#051810] border border-emerald-500/30 rounded px-2 py-1.5 text-xs text-white focus:border-emerald-400 outline-none"
                        />
                    </div>
                )}

                {/* Clear All */}
                {(searchQuery || dateFilter !== 'all') && (
                    <button
                        onClick={clearFilters}
                        className="ml-auto text-xs text-red-400/70 hover:text-red-300 flex items-center gap-1 hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-3 h-3" />
                        Clear Filters
                    </button>
                )}
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto w-full max-w-7xl mx-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500/20 scrollbar-track-transparent">
                {loading ? (
                    <div className="p-12 text-center text-emerald-500/50 animate-pulse flex flex-col items-center gap-2">
                        <ArrowRight className="w-6 h-6 animate-spin" />
                        Loading wallet history...
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center gap-4 bg-[#0a2f1f]/20 rounded-2xl border border-dashed border-emerald-500/20">
                        <div className="bg-[#051810] p-4 rounded-full border border-emerald-500/20">
                            <Search className="w-8 h-8 text-gray-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-300">No transactions found</h3>
                            <p className="text-sm text-gray-500 mt-1">Try adjusting your search or date filters.</p>
                        </div>
                        <button
                            onClick={clearFilters}
                            className="text-emerald-400 text-sm hover:underline"
                        >
                            Reset all filters
                        </button>
                    </div>
                ) : (
                    <div className="bg-[#0a2f1f]/20 rounded-xl border border-emerald-500/10 overflow-hidden shadow-xl">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#050B14] text-emerald-300/60 font-mono text-xs uppercase tracking-wider sticky top-0 bg-opacity-100 z-10 shadow-lg">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Date & Time</th>
                                    <th className="px-6 py-4 font-medium">Type</th>
                                    <th className="px-6 py-4 font-medium w-full">Description</th>
                                    <th className="px-6 py-4 font-medium text-right">Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-500/10">
                                {currentTransactions.map(t => (
                                    <tr key={t.id} className="hover:bg-emerald-500/5 transition-colors group bg-[#051810]/50 odd:bg-[#051810]/30">
                                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                                            {t.date ? new Date(t.date).toLocaleString(undefined, {
                                                year: 'numeric', month: 'short', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            }) : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wide border shadow-sm ${t.type === 'SCRAPE' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-orange-900/10' :
                                                t.type === 'AI' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-purple-900/10' :
                                                    'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-900/10'
                                                }`}>
                                                {t.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-200 group-hover:text-white transition-colors">
                                            {t.description}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-400 font-bold group-hover:text-emerald-300">
                                            ${t.cost.toFixed(4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination / Footer */}
            <div className="border-t border-emerald-500/20 bg-[#050B14] px-6 py-4 shrink-0 flex items-center justify-between">
                <div className="text-xs text-gray-500 font-mono">
                    Showing {filteredTransactions.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredTransactions.length)} of {filteredTransactions.length} entries
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white transition-colors border border-transparent hover:border-emerald-500/20"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="px-3 text-xs text-gray-300 font-mono">
                            Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-white transition-colors border border-transparent hover:border-emerald-500/20"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
