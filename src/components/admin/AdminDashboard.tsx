import React, { useEffect, useState } from 'react';
import { Shield, Check, X, Ban, Mail, Loader2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface User {
    googleId: string;
    email: string;
    name: string;
    role: string;
    status: 'active' | 'blocked' | 'pending';
    credits: number;
    monthlyUsage: number;
    createdAt: string;
}

const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [maintenanceLoading, setMaintenanceLoading] = useState<string | null>(null);

    const SUPER_ADMINS = ['vanillabrand@googlemail.com', 'vanillabrand@gmail.com'];

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);

            // Also fetch current user profile
            const meRes = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (meRes.ok) {
                const meData = await meRes.json();
                setCurrentUser(meData);
            }
        } catch (error) {
            toast.error('Admin access denied or failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleStatusUpdate = async (userId: string, status: 'active' | 'blocked') => {
        setProcessing(userId);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/admin/users/${userId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status })
            });

            if (!res.ok) throw new Error('Update failed');
            toast.success(`User set to ${status}`);
            fetchUsers(); // Refresh list
        } catch (error) {
            toast.error('Failed to update status');
        } finally {
            setProcessing(null);
        }
    };

    const handleSendInvoice = async (userId: string, cost: number) => {
        if (cost <= 0) return toast.info('No usage to invoice');

        const confirm = window.confirm(`Send invoice for $${(cost / 100).toFixed(2)}?`); // Assuming 1 credit = 1 cent? Or virtual.
        if (!confirm) return;

        setProcessing(userId);
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/admin/users/${userId}/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount: cost })
            });
            toast.success('Invoice sent');
        } catch (error) {
            toast.error('Failed to send invoice');
        } finally {
            setProcessing(null);
        }
    };

    const [historyUser, setHistoryUser] = useState<string | null>(null);
    const [userHistory, setUserHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const fetchUserHistory = async (userId: string) => {
        setHistoryUser(userId);
        setLoadingHistory(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/admin/users/${userId}/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUserHistory(data);
            } else {
                toast.error('Failed to load history');
            }
        } catch (e) {
            toast.error('Error fetching history');
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleMaintenanceClear = async (target: 'datasets' | 'queries' | 'profiles' | 'all') => {
        const labels = {
            datasets: 'ALL DATASETS, RECORDS, AND ANALYTICS',
            queries: 'ALL JOBS, EXECUTIONS, AND FINGERPRINTS',
            profiles: 'ALL PROFILE CACHE AND CACHED RECORDS',
            all: 'EVERYTHING IN THE DATABASE (EXCEPT USERS)'
        };

        const confirm = window.confirm(`⚠️ WARNING: This will PERMANENTLY DELETE ${labels[target]}. This action is irreversible. \n\nAre you absolutely sure you want to proceed?`);
        if (!confirm) return;

        const typedName = window.prompt(`FINAL CONFIRMATION: Type 'DELETE' to confirm clearing ${target}.`);
        if (typedName !== 'DELETE') {
            toast.error('Deletion cancelled: Confirmation text did not match.');
            return;
        }

        setMaintenanceLoading(target);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/admin/maintenance/clear?target=${target}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Cleanup failed');
            }

            toast.success(`Successfully cleared ${target}`);
            fetchUsers(); // Refresh to show clean state
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setMaintenanceLoading(null);
        }
    };

    const isSuperAdmin = currentUser && SUPER_ADMINS.includes(currentUser.email?.toLowerCase());

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-[#050B14] text-emerald-500">
            <Loader2 className="animate-spin w-8 h-8" />
        </div>;
    }

    return (
        <div className="min-h-screen bg-[#050B14] text-white p-8">
            <header className="mb-8 flex items-center gap-3 border-b border-emerald-900/50 pb-4">
                <Shield className="w-8 h-8 text-emerald-500" />
                <div>
                    <h1 className="text-2xl font-bold font-mono">SUPER ADMIN CONSOLE</h1>
                    <p className="text-gray-400 text-sm">User Management & Billing</p>
                </div>
            </header>

            {/* [NEW] System Maintenance Section */}
            {isSuperAdmin && (
                <section className="mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-red-500" />
                        <h2 className="text-lg font-bold font-mono text-red-400 uppercase tracking-tight">System Maintenance (IRREVERSIBLE)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-red-900/10 border border-red-900/30 p-4 rounded-xl flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-red-400 mb-1">Clear Datasets</h3>
                                <p className="text-[10px] text-gray-400 leading-tight">Removes all datasets, records, and AI analytics. Use to reset data footprint.</p>
                            </div>
                            <button
                                onClick={() => handleMaintenanceClear('datasets')}
                                disabled={!!maintenanceLoading}
                                className="mt-4 py-2 px-3 bg-red-600/20 hover:bg-red-600 text-red-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                            >
                                {maintenanceLoading === 'datasets' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'CLEAR DATASETS'}
                            </button>
                        </div>

                        <div className="bg-orange-900/10 border border-orange-900/30 p-4 rounded-xl flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-orange-400 mb-1">Clear Query Logs</h3>
                                <p className="text-[10px] text-gray-400 leading-tight">Removes all job history, Apify execution logs, and scrape fingerprints.</p>
                            </div>
                            <button
                                onClick={() => handleMaintenanceClear('queries')}
                                disabled={!!maintenanceLoading}
                                className="mt-4 py-2 px-3 bg-orange-600/20 hover:bg-orange-600 text-orange-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                            >
                                {maintenanceLoading === 'queries' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'CLEAR QUERY HISTORY'}
                            </button>
                        </div>

                        <div className="bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-xl flex flex-col justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-yellow-400 mb-1">Clear Profile Cache</h3>
                                <p className="text-[10px] text-gray-400 leading-tight">Purges the profile cache collection and all cached profile records.</p>
                            </div>
                            <button
                                onClick={() => handleMaintenanceClear('profiles')}
                                disabled={!!maintenanceLoading}
                                className="mt-4 py-2 px-3 bg-yellow-600/20 hover:bg-yellow-600 text-yellow-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                            >
                                {maintenanceLoading === 'profiles' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'PURGE PROFILE CACHE'}
                            </button>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-700 p-4 rounded-xl flex flex-col justify-between border-dashed">
                            <div>
                                <h3 className="text-sm font-bold text-white mb-1">Nuclear Reset</h3>
                                <p className="text-[10px] text-gray-400 leading-tight">Clears everything except user accounts and billing settings.</p>
                            </div>
                            <button
                                onClick={() => handleMaintenanceClear('all')}
                                disabled={!!maintenanceLoading}
                                className="mt-4 py-2 px-3 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-50"
                            >
                                {maintenanceLoading === 'all' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'NUCLEAR RESET'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            <div className="bg-[#0A1625] rounded-xl border border-emerald-500/20 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[#0F2236] text-emerald-400 text-xs uppercase tracking-wider">
                            <th className="p-4 border-b border-emerald-900">User</th>
                            <th className="p-4 border-b border-emerald-900">Status</th>
                            <th className="p-4 border-b border-emerald-900">Credits</th>
                            <th className="p-4 border-b border-emerald-900">Est. Mth Cost</th>
                            <th className="p-4 border-b border-emerald-900 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-900/30">
                        {users.map(user => (
                            <tr key={user.googleId} className="hover:bg-emerald-900/10 transition-colors">
                                <td className="p-4">
                                    <div className="font-bold text-white">{user.name}</div>
                                    <div className="text-xs text-gray-400 font-mono">{user.email}</div>
                                    {user.role === 'admin' && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-purple-900 text-purple-200 mt-1">SUPER ADMIN</span>}
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' :
                                        user.status === 'blocked' ? 'bg-red-900/50 text-red-400' :
                                            'bg-yellow-900/50 text-yellow-400'
                                        }`}>
                                        {user.status.toUpperCase()}
                                    </span>
                                </td>
                                <td className="p-4 font-mono text-emerald-200">
                                    {user.credits.toLocaleString()}
                                </td>
                                <td className="p-4 font-mono text-gray-300">
                                    {/* Mock calculation: 100 credits = $1.00 USD? */}
                                    ${(user.monthlyUsage / 100).toFixed(2)}
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    {processing === user.googleId ? (
                                        <Loader2 className="inline animate-spin w-4 h-4 text-gray-400" />
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => fetchUserHistory(user.googleId)}
                                                className="p-2 bg-purple-600/20 hover:bg-purple-600 text-purple-400 rounded-lg transition-colors"
                                                title="View History"
                                            >
                                                <div className="w-4 h-4 font-bold font-mono">H</div>
                                            </button>

                                            {user.status === 'pending' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(user.googleId, 'active')}
                                                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 rounded-lg transition-colors"
                                                    title="Approve User"
                                                >
                                                    <Check size={16} />
                                                </button>
                                            )}

                                            {user.status !== 'blocked' && user.role !== 'admin' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(user.googleId, 'blocked')}
                                                    className="p-2 bg-red-600/20 hover:bg-red-600 text-red-400 rounded-lg transition-colors"
                                                    title="Block User"
                                                >
                                                    <Ban size={16} />
                                                </button>
                                            )}

                                            {user.status === 'blocked' && (
                                                <button
                                                    onClick={() => handleStatusUpdate(user.googleId, 'active')}
                                                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 rounded-lg transition-colors"
                                                    title="Unblock"
                                                >
                                                    <Shield size={16} />
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleSendInvoice(user.googleId, user.monthlyUsage)}
                                                className="p-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 rounded-lg transition-colors"
                                                title="Send Invoice"
                                            >
                                                <DollarSign size={16} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* History Modal */}
            {historyUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-[#0A1625] border border-emerald-500/20 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-emerald-900/50 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-emerald-400">Transaction History</h2>
                            <button onClick={() => setHistoryUser(null)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {loadingHistory ? (
                                <div className="flex justify-center p-12">
                                    <Loader2 className="animate-spin w-8 h-8 text-emerald-500" />
                                </div>
                            ) : userHistory.length === 0 ? (
                                <p className="text-center text-gray-500 py-12">No transaction history found.</p>
                            ) : (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-xs uppercase text-gray-500 border-b border-gray-800">
                                            <th className="pb-3 pl-2">Date</th>
                                            <th className="pb-3">Type</th>
                                            <th className="pb-3">Query / Details</th>
                                            <th className="pb-3">Status</th>
                                            <th className="pb-3 text-right pr-2">Link</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/50">
                                        {userHistory.map((job) => (
                                            <tr key={job.id} className="hover:bg-white/5">
                                                <td className="py-3 pl-2 text-sm text-gray-400 font-mono">
                                                    {new Date(job.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="py-3 text-sm font-medium text-emerald-200">
                                                    {job.type}
                                                </td>
                                                <td className="py-3 text-sm text-gray-300 max-w-xs truncate">
                                                    {job.metadata?.query || job.metadata?.description || '-'}
                                                    {job.error && <div className="text-red-400 text-xs mt-1">{job.error}</div>}
                                                </td>
                                                <td className="py-3">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${job.status === 'completed' ? 'bg-emerald-900/50 text-emerald-400' :
                                                        job.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                                                            'bg-yellow-900/50 text-yellow-400'
                                                        }`}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-right pr-2">
                                                    {job.status === 'completed' && job.result?.datasetId && (
                                                        <a
                                                            href={`/share/${job.result.datasetId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-emerald-400 hover:underline text-sm font-medium"
                                                        >
                                                            View Map
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
