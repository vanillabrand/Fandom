import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { AdminUserView, PromoCode, Invoice } from '../../types/admin.js';
import { AdminPricingConfig } from './AdminPricingConfig.js';
import { AdminAnalyticsDashboard } from './AdminAnalyticsDashboard.js';
import { AccuracyMetricsDashboard } from './AccuracyMetricsDashboard.js';
import {
    Users, Clock, CreditCard, Receipt, Search, CheckCircle, XCircle,
    Edit2, Trash2, Plus, ChevronDown, ChevronUp, DollarSign, Calendar,
    AlertCircle, TrendingUp, Ban, UserCheck, Settings, Mail
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'users' | 'approvals' | 'promo-codes' | 'invoices' | 'pricing' | 'analytics' | 'accuracy';

export const AdminUserManagement = () => {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [users, setUsers] = useState<AdminUserView[]>([]);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<AdminUserView | null>(null);

    // Promo code form
    const [newPromoCode, setNewPromoCode] = useState({ code: '', value: '', maxUses: '', expiresAt: '' });

    // Invoice form
    const [newInvoice, setNewInvoice] = useState({ userId: '', amount: '', description: '', dueDate: '' });

    // Load data based on active tab
    useEffect(() => {
        if (activeTab === 'users' || activeTab === 'approvals') {
            loadUsers();
        } else if (activeTab === 'promo-codes') {
            loadPromoCodes();
        } else if (activeTab === 'invoices') {
            loadInvoices();
        }
    }, [activeTab]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (error) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const loadPromoCodes = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/promo-codes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPromoCodes(data);
            }
        } catch (error) {
            toast.error('Failed to load promo codes');
        } finally {
            setLoading(false);
        }
    };

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/invoices', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInvoices(data);
            }
        } catch (error) {
            toast.error('Failed to load invoices');
        } finally {
            setLoading(false);
        }
    };

    // User actions
    const updateUserStatus = async (googleId: string, status: 'active' | 'blocked' | 'pending') => {
        try {
            const res = await fetch(`/api/admin/users/${googleId}/status`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                toast.success(`User ${status === 'active' ? 'approved' : status}`);
                loadUsers();
                setSelectedUser(null);
            } else {
                toast.error('Failed to update status');
            }
        } catch (error) {
            toast.error('Error updating user status');
        }
    };

    const updateUserBalance = async (googleId: string, balance: number) => {
        try {
            const res = await fetch(`/api/admin/users/${googleId}/balance`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ balance })
            });
            if (res.ok) {
                toast.success('Balance updated');
                loadUsers();
            } else {
                toast.error('Failed to update balance');
            }
        } catch (error) {
            toast.error('Error updating balance');
        }
    };

    const closeUserAccount = async (googleId: string) => {
        if (!confirm('Are you sure you want to close this account? This will block the user.')) return;

        try {
            const res = await fetch(`/api/admin/users/${googleId}/close`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success('Account closed');
                loadUsers();
                setSelectedUser(null);
            } else {
                toast.error('Failed to close account');
            }
        } catch (error) {
            toast.error('Error closing account');
        }
    };

    // Promo code actions
    const createPromoCode = async () => {
        if (!newPromoCode.code || !newPromoCode.value) {
            toast.error('Code and value are required');
            return;
        }

        try {
            const res = await fetch('/api/admin/promo-codes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: newPromoCode.code.toUpperCase(),
                    value: parseInt(newPromoCode.value),
                    maxUses: parseInt(newPromoCode.maxUses) || 0,
                    expiresAt: newPromoCode.expiresAt || undefined
                })
            });
            if (res.ok) {
                toast.success('Promo code created');
                setNewPromoCode({ code: '', value: '', maxUses: '', expiresAt: '' });
                loadPromoCodes();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to create promo code');
            }
        } catch (error) {
            toast.error('Error creating promo code');
        }
    };

    const deletePromoCode = async (code: string) => {
        if (!confirm(`Delete promo code ${code}?`)) return;

        try {
            const res = await fetch(`/api/admin/promo-codes/${code}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success('Promo code deleted');
                loadPromoCodes();
            }
        } catch (error) {
            toast.error('Error deleting promo code');
        }
    };

    const togglePromoCode = async (code: string, isActive: boolean) => {
        try {
            const res = await fetch(`/api/admin/promo-codes/${code}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isActive: !isActive })
            });
            if (res.ok) {
                toast.success(isActive ? 'Promo code deactivated' : 'Promo code activated');
                loadPromoCodes();
            }
        } catch (error) {
            toast.error('Error toggling promo code');
        }
    };

    // Filter users
    const filteredUsers = users.filter(u => {
        const query = searchQuery.toLowerCase();
        return u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.googleId.toLowerCase().includes(query);
    });

    const pendingUsers = users.filter(u => u.status === 'pending');

    // Status badge component
    const StatusBadge = ({ status }: { status: string | undefined }) => {
        if (!status) return <span className="px-2 py-0.5 text-xs font-bold rounded border bg-gray-500/20 text-gray-400 border-gray-500/30">UNKNOWN</span>;

        const colors = {
            active: 'bg-green-500/20 text-green-400 border-green-500/30',
            pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
            blocked: 'bg-red-500/20 text-red-400 border-red-500/30'
        };
        return (
            <span className={`px-2 py-0.5 text-xs font-bold rounded border ${colors[status as keyof typeof colors] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                {status.toUpperCase()}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-emerald-900/30 gap-1">
                {[
                    { id: 'users', label: 'All Users', icon: Users },
                    { id: 'approvals', label: 'Pending Approvals', icon: Clock },
                    { id: 'promo-codes', label: 'Promo Codes', icon: CreditCard },
                    { id: 'invoices', label: 'Invoices', icon: Receipt },
                    { id: 'pricing', label: 'Pricing Config', icon: Settings },
                    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
                    { id: 'accuracy', label: 'Query Accuracy', icon: AlertCircle }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as Tab)}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${activeTab === tab.id
                            ? 'border-purple-500 text-purple-400'
                            : 'border-transparent text-emerald-600/50 hover:text-purple-400 hover:bg-purple-900/10 rounded-t'
                            }`}
                    >
                        <tab.icon size={14} />
                        {tab.label}
                        {tab.id === 'approvals' && pendingUsers.length > 0 && (
                            <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {pendingUsers.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                    </div>
                ) : (
                    <>
                        {/* USERS TAB */}
                        {activeTab === 'users' && (
                            <div className="space-y-4">
                                {/* Search */}
                                <div className="flex items-center gap-2 bg-[#0a1f16] border border-emerald-900/50 rounded-lg px-3 py-2">
                                    <Search size={16} className="text-emerald-500/50" />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-emerald-500/30"
                                    />
                                </div>

                                {/* Users Table */}
                                <div className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-[#051810] border-b border-emerald-900/30">
                                            <tr>
                                                <th className="text-left p-3 text-xs font-bold text-purple-400 uppercase">User</th>
                                                <th className="text-left p-3 text-xs font-bold text-purple-400 uppercase">Status</th>
                                                <th className="text-right p-3 text-xs font-bold text-purple-400 uppercase">Credits</th>
                                                <th className="text-right p-3 text-xs font-bold text-purple-400 uppercase">Usage</th>
                                                <th className="text-right p-3 text-xs font-bold text-purple-400 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.map(user => (
                                                <tr
                                                    key={user.googleId}
                                                    className="border-t border-emerald-900/20 hover:bg-purple-900/5 transition-colors cursor-pointer"
                                                    onClick={() => setSelectedUser(selectedUser?.googleId === user.googleId ? null : user)}
                                                >
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                            {user.picture && (
                                                                <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
                                                            )}
                                                            <div>
                                                                <div className="text-sm font-medium text-white">{user.name}</div>
                                                                <div className="text-xs text-emerald-500/60">{user.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <StatusBadge status={user.status} />
                                                    </td>
                                                    <td className="p-3 text-right text-sm font-mono text-emerald-400">{user.credits || 0}</td>
                                                    <td className="p-3 text-right text-sm font-mono text-emerald-400">{user.monthlyUsage || 0}</td>
                                                    <td className="p-3 text-right">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedUser(selectedUser?.googleId === user.googleId ? null : user);
                                                            }}
                                                            className="text-purple-400 hover:text-purple-300"
                                                        >
                                                            {selectedUser?.googleId === user.googleId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* User Detail Panel */}
                                {selectedUser && (
                                    <div className="bg-[#0a1f16] rounded-xl border border-purple-500/30 p-6 space-y-6">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                {selectedUser.picture && (
                                                    <img src={selectedUser.picture} alt="" className="w-12 h-12 rounded-full border-2 border-purple-500/30" />
                                                )}
                                                <div>
                                                    <h3 className="text-lg font-bold text-white">{selectedUser.name}</h3>
                                                    <p className="text-sm text-emerald-500/60">{selectedUser.email}</p>
                                                    <p className="text-xs text-emerald-500/40 font-mono">{selectedUser.googleId}</p>
                                                </div>
                                            </div>
                                            <StatusBadge status={selectedUser.status} />
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => updateUserStatus(selectedUser.googleId, 'active')}
                                                disabled={selectedUser.status === 'active'}
                                                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold flex items-center justify-center gap-2"
                                            >
                                                <UserCheck size={16} />
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => updateUserStatus(selectedUser.googleId, 'blocked')}
                                                disabled={selectedUser.status === 'blocked'}
                                                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-bold flex items-center justify-center gap-2"
                                            >
                                                <Ban size={16} />
                                                Block
                                            </button>
                                        </div>

                                        {/* Balance Amendment */}
                                        <div className="border-t border-emerald-900/30 pt-4">
                                            <label className="block text-xs font-bold text-purple-400 mb-2">AMEND BALANCE</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    defaultValue={selectedUser.credits}
                                                    id={`balance-${selectedUser.googleId}`}
                                                    className="flex-1 bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const input = document.getElementById(`balance-${selectedUser.googleId}`) as HTMLInputElement;
                                                        updateUserBalance(selectedUser.googleId, parseInt(input.value));
                                                    }}
                                                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded text-sm font-bold"
                                                >
                                                    Update
                                                </button>
                                            </div>
                                        </div>

                                        {/* View History Toggle */}
                                        <div className="border-t border-emerald-900/30 pt-4">
                                            <button
                                                onClick={() => {
                                                    const historyPanel = document.getElementById(`history-${selectedUser.googleId}`);
                                                    if (historyPanel) historyPanel.classList.toggle('hidden');
                                                    // Trigger load if opening
                                                    if (!historyPanel?.classList.contains('hidden')) {
                                                        // logic handled by component below
                                                    }
                                                }}
                                                className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-4 py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2"
                                            >
                                                <Clock size={14} />
                                                View Transaction & Query History
                                            </button>

                                            {/* Embedded History Component */}
                                            <div id={`history-${selectedUser.googleId}`} className="hidden mt-4 bg-black/20 rounded-lg p-2 max-h-[400px] overflow-y-auto">
                                                <AdminUserHistoryViewer userId={selectedUser.googleId} />
                                            </div>
                                        </div>

                                        {/* Close Account */}
                                        <div className="border-t border-emerald-900/30 pt-4">
                                            <button
                                                onClick={() => closeUserAccount(selectedUser.googleId)}
                                                className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 px-4 py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2"
                                            >
                                                <Trash2 size={14} />
                                                Close Account
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PENDING APPROVALS TAB */}
                        {activeTab === 'approvals' && (
                            <div className="space-y-4">
                                {pendingUsers.length === 0 ? (
                                    <div className="text-center py-12 text-emerald-500/50">
                                        <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                        <p>No pending approvals</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-4">
                                        {pendingUsers.map(user => (
                                            <div key={user.googleId} className="bg-[#0a1f16] rounded-xl border border-orange-500/30 p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    {user.picture && (
                                                        <img src={user.picture} alt="" className="w-10 h-10 rounded-full" />
                                                    )}
                                                    <div>
                                                        <div className="text-sm font-bold text-white">{user.name}</div>
                                                        <div className="text-xs text-emerald-500/60">{user.email}</div>
                                                        <div className="text-xs text-emerald-500/40">
                                                            Joined: {new Date(user.createdAt).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => updateUserStatus(user.googleId, 'active')}
                                                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2"
                                                    >
                                                        <CheckCircle size={16} />
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => updateUserStatus(user.googleId, 'blocked')}
                                                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2"
                                                    >
                                                        <XCircle size={16} />
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PROMO CODES TAB */}
                        {activeTab === 'promo-codes' && (
                            <div className="space-y-6">
                                {/* Create Promo Code Form */}
                                <div className="bg-[#0a1f16] rounded-xl border border-purple-500/30 p-6">
                                    <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                                        <Plus size={16} />
                                        CREATE PROMO CODE
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            placeholder="CODE"
                                            value={newPromoCode.code}
                                            onChange={(e) => setNewPromoCode({ ...newPromoCode, code: e.target.value.toUpperCase() })}
                                            className="bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white uppercase"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Credit Value"
                                            value={newPromoCode.value}
                                            onChange={(e) => setNewPromoCode({ ...newPromoCode, value: e.target.value })}
                                            className="bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Max Uses (0 = unlimited)"
                                            value={newPromoCode.maxUses}
                                            onChange={(e) => setNewPromoCode({ ...newPromoCode, maxUses: e.target.value })}
                                            className="bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                        <input
                                            type="date"
                                            placeholder="Expiry Date"
                                            value={newPromoCode.expiresAt}
                                            onChange={(e) => setNewPromoCode({ ...newPromoCode, expiresAt: e.target.value })}
                                            className="bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                    <button
                                        onClick={createPromoCode}
                                        className="mt-3 w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded text-sm font-bold"
                                    >
                                        Create Promo Code
                                    </button>
                                </div>

                                {/* Promo Codes List */}
                                <div className="space-y-3">
                                    {promoCodes.map(promo => (
                                        <div key={promo.code} className={`bg-[#0a1f16] rounded-xl border p-4 ${promo.isActive ? 'border-emerald-500/30' : 'border-gray-500/30'}`}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className="text-lg font-bold font-mono text-white">{promo.code}</span>
                                                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${promo.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                            {promo.isActive ? 'ACTIVE' : 'INACTIVE'}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                                        <div>
                                                            <div className="text-emerald-500/50 text-xs">Value</div>
                                                            <div className="text-white font-mono">{promo.value} credits</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-emerald-500/50 text-xs">Usage</div>
                                                            <div className="text-white font-mono">
                                                                {promo.currentUses} / {promo.maxUses === 0 ? '∞' : promo.maxUses}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-emerald-500/50 text-xs">Expires</div>
                                                            <div className="text-white text-xs">
                                                                {promo.expiresAt ? new Date(promo.expiresAt).toLocaleDateString() : 'Never'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => togglePromoCode(promo.code, promo.isActive)}
                                                        className={`p-2 rounded ${promo.isActive ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                                                        title={promo.isActive ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {promo.isActive ? <XCircle size={16} /> : <CheckCircle size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => deletePromoCode(promo.code)}
                                                        className="p-2 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* INVOICES TAB */}
                        {activeTab === 'invoices' && (
                            <div className="space-y-6">
                                {/* Create Invoice Form */}
                                <div className="bg-[#0a1f16] rounded-xl border border-purple-500/30 p-6">
                                    <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                                        <Plus size={16} />
                                        CREATE INVOICE
                                    </h3>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="User Google ID"
                                            value={newInvoice.userId}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, userId: e.target.value })}
                                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Amount"
                                            value={newInvoice.amount}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
                                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                        <textarea
                                            placeholder="Description"
                                            value={newInvoice.description}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
                                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white h-20 resize-none"
                                        />
                                        <input
                                            type="date"
                                            placeholder="Due Date"
                                            value={newInvoice.dueDate}
                                            onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })}
                                            className="w-full bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (!newInvoice.userId || !newInvoice.amount || !newInvoice.description) {
                                                toast.error('All fields required');
                                                return;
                                            }
                                            try {
                                                const res = await fetch('/api/admin/invoices', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Authorization': `Bearer ${token}`,
                                                        'Content-Type': 'application/json'
                                                    },
                                                    body: JSON.stringify(newInvoice)
                                                });
                                                if (res.ok) {
                                                    toast.success('Invoice created');
                                                    setNewInvoice({ userId: '', amount: '', description: '', dueDate: '' });
                                                    loadInvoices();
                                                }
                                            } catch (error) {
                                                toast.error('Error creating invoice');
                                            }
                                        }}
                                        className="mt-3 w-full bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded text-sm font-bold"
                                    >
                                        Create Invoice
                                    </button>
                                </div>

                                {/* Invoices List */}
                                <div className="space-y-3">
                                    {invoices.length === 0 ? (
                                        <div className="text-center py-12 text-emerald-500/50">
                                            <Receipt size={48} className="mx-auto mb-4 opacity-50" />
                                            <p>No invoices yet</p>
                                        </div>
                                    ) : (
                                        invoices.map(invoice => (
                                            <div key={invoice.id} className="bg-[#0a1f16] rounded-xl border border-emerald-900/30 p-4 hover:border-purple-500/30 transition-colors">
                                                {/* Header: User Info & Status */}
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        {invoice.user?.picture && (
                                                            <img src={invoice.user.picture} alt="" className="w-10 h-10 rounded-full border-2 border-purple-500/30" />
                                                        )}
                                                        <div>
                                                            <div className="text-sm font-bold text-white">{invoice.user?.name || 'Unknown User'}</div>
                                                            <div className="text-xs text-emerald-500/60">{invoice.user?.email || invoice.userId}</div>
                                                            <div className="text-xs text-emerald-500/40 font-mono">Invoice #{invoice.id.slice(0, 8)}</div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${invoice.status === 'paid' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                        invoice.status === 'sent' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                            'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                                        }`}>
                                                        {invoice.status === 'paid' && <CheckCircle size={12} />}
                                                        {invoice.status.toUpperCase()}
                                                    </span>
                                                </div>

                                                {/* Amount & Description */}
                                                <div className="bg-[#051810] rounded-lg p-3 mb-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-emerald-500/50">Amount</span>
                                                        <span className="text-2xl font-bold text-emerald-400">${invoice.amount}</span>
                                                    </div>
                                                    <div className="text-sm text-white/80">{invoice.description}</div>
                                                </div>

                                                {/* Dates */}
                                                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                                    <div>
                                                        <div className="text-emerald-500/50">Created</div>
                                                        <div className="text-white font-mono">{new Date(invoice.createdAt).toLocaleDateString()}</div>
                                                    </div>
                                                    {invoice.dueDate && (
                                                        <div>
                                                            <div className="text-emerald-500/50">Due</div>
                                                            <div className="text-white font-mono">{new Date(invoice.dueDate).toLocaleDateString()}</div>
                                                        </div>
                                                    )}
                                                    {invoice.paidAt && (
                                                        <div>
                                                            <div className="text-green-500/50">Paid</div>
                                                            <div className="text-green-400 font-mono">{new Date(invoice.paidAt).toLocaleDateString()}</div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Invoice Management Actions */}
                                                <div className="pt-3 border-t border-emerald-900/30 space-y-2">
                                                    {/* Resend Invoice Button */}
                                                    {invoice.status !== 'draft' && invoice.status !== 'paid' && (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await fetch(`/api/admin/invoices/${invoice.id}/resend`, {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Authorization': `Bearer ${token}`,
                                                                            'Content-Type': 'application/json'
                                                                        },
                                                                        body: JSON.stringify({ userId: invoice.userId })
                                                                    });
                                                                    if (res.ok) {
                                                                        toast.success('Invoice email resent!');
                                                                        loadInvoices();
                                                                    } else {
                                                                        toast.error('Failed to resend invoice');
                                                                    }
                                                                } catch (error) {
                                                                    toast.error('Error resending invoice');
                                                                }
                                                            }}
                                                            className="w-full bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-2"
                                                        >
                                                            <Mail size={14} />
                                                            Resend Invoice Email
                                                        </button>
                                                    )}

                                                    {/* Status Update Dropdown */}
                                                    {invoice.status !== 'paid' && (
                                                        <div className="flex gap-2">
                                                            <select
                                                                onChange={async (e) => {
                                                                    const newStatus = e.target.value;
                                                                    if (!newStatus) return;

                                                                    try {
                                                                        const res = await fetch(`/api/admin/invoices/${invoice.id}/status`, {
                                                                            method: 'PATCH',
                                                                            headers: {
                                                                                'Authorization': `Bearer ${token}`,
                                                                                'Content-Type': 'application/json'
                                                                            },
                                                                            body: JSON.stringify({ status: newStatus })
                                                                        });
                                                                        if (res.ok) {
                                                                            toast.success(`Invoice marked as ${newStatus}`);
                                                                            loadInvoices();
                                                                        } else {
                                                                            const data = await res.json();
                                                                            toast.error(data.error || 'Failed to update status');
                                                                        }
                                                                    } catch (error) {
                                                                        toast.error('Error updating invoice status');
                                                                    }
                                                                    e.target.value = ''; // Reset dropdown
                                                                }}
                                                                className="flex-1 bg-[#051810] border border-emerald-900/50 text-white px-3 py-2 rounded text-xs font-bold cursor-pointer"
                                                                defaultValue=""
                                                            >
                                                                <option value="" disabled>Update Status...</option>
                                                                {invoice.status === 'draft' && <option value="sent">✉️ Mark as Sent</option>}
                                                                <option value="paid">✅ Mark as Paid</option>
                                                                <option value="partial">⚠️ Partially Paid</option>
                                                                <option value="unpaid">❌ Mark as Unpaid</option>
                                                                <option value="overdue">🔴 Mark as Overdue</option>
                                                                <option value="cancelled">🚫 Cancel Invoice</option>
                                                            </select>
                                                        </div>
                                                    )}

                                                    {/* Paid Status Info */}
                                                    {invoice.status === 'paid' && (
                                                        <div className="bg-green-900/20 border border-green-500/30 rounded px-3 py-2 text-xs text-green-400 flex items-center justify-center gap-2">
                                                            <CheckCircle size={14} />
                                                            Invoice Fully Paid
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pricing Configuration Tab */}
                        {activeTab === 'pricing' && (
                            <AdminPricingConfig />
                        )}

                        {/* Analytics Tab */}
                        {activeTab === 'analytics' && (
                            <AdminAnalyticsDashboard />
                        )}

                        {/* Query Accuracy Tab */}
                        {activeTab === 'accuracy' && (
                            <AccuracyMetricsDashboard />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// Helper Component for Admin View
const AdminUserHistoryViewer = ({ userId }: { userId: string }) => {
    const { token } = useAuth();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/users/${userId}/jobs?limit=50`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setJobs(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error("Failed to load user history", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [userId, token]);

    if (loading) return <div className="text-center p-4 text-xs text-gray-500">Loading history...</div>;
    if (jobs.length === 0) return <div className="text-center p-4 text-xs text-gray-500">No activity recorded.</div>;

    return (
        <div className="space-y-2">
            {jobs.map(job => (
                <div key={job.id || job._id} className="bg-black/40 p-2 rounded border border-white/10 text-xs">
                    <div className="flex justify-between mb-1">
                        <span className="font-bold text-white max-w-[70%] truncate" title={job.metadata?.query}>
                            {job.metadata?.query || job.type}
                        </span>
                        <span className={`px-1.5 rounded text-[10px] uppercase font-bold ${job.status === 'completed' ? 'text-green-400 bg-green-900/20' :
                            job.status === 'failed' ? 'text-red-400 bg-red-900/20' : 'text-blue-400 bg-blue-900/20'
                            }`}>
                            {job.status}
                        </span>
                    </div>
                    <div className="flex justify-between text-white/50 font-mono text-[10px]">
                        <span>{new Date(job.createdAt).toLocaleString()}</span>
                        <span>{job.metadata?.estimatedCost ? `£${job.metadata.estimatedCost.toFixed(2)}` : '-'}</span>
                    </div>
                    {/* Log Peek */}
                    {job.result && (
                        <div className="mt-1 pt-1 border-t border-white/5 text-white/40 truncate">
                            {JSON.stringify(job.result).slice(0, 100)}...
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
