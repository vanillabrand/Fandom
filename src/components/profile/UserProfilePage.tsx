import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { TransactionHistory } from './TransactionHistory.js';
import { UsageTracker } from './UsageTracker.js';
import { AdminUserManagement } from '../admin/AdminUserManagement.js';
import { UsageTrendsDashboard } from '../analytics/UsageTrendsDashboard.js';
import { InsightsPanel } from '../analytics/InsightsPanel.js';
import { BenchmarkWidget } from '../analytics/BenchmarkWidget.js';
import { ROICalculator } from '../analytics/ROICalculator.js';
import { StripeCheckout } from '../payments/StripeCheckout.js';
import { InvoiceList } from '../billing/InvoiceList.js';
import { User, CreditCard, Shield, Clock, LogOut, Trash2, Mail, MessageSquare, AlertTriangle, ArrowLeft, Crown, TrendingUp, Receipt, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export const UserProfilePage = () => {
    const { user, refreshProfile, token, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'insights' | 'invoices' | 'support' | 'settings' | 'admin'>('overview');
    const [promoCode, setPromoCode] = useState('');
    const [redeeming, setRedeeming] = useState(false);
    const [showStripeCheckout, setShowStripeCheckout] = useState(false);

    // Support Form State
    const [supportSubject, setSupportSubject] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const [sendingSupport, setSendingSupport] = useState(false);

    const handleRedeem = async () => {
        if (!promoCode) return;
        setRedeeming(true);
        try {
            const res = await fetch('/api/user/redeem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code: promoCode })
            });
            const data = await res.json();

            if (res.ok) {
                toast.success(`Redeemed! +£${data.amount} added to balance.`);
                setPromoCode('');
                refreshProfile();
            } else {
                toast.error(data.error || 'Invalid code');
            }
        } catch (err) {
            toast.error('Failed to redeem code');
        } finally {
            setRedeeming(false);
        }
    };

    const handleSupportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSendingSupport(true);
        try {
            const res = await fetch('/api/support', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ subject: supportSubject, message: supportMessage, type: 'User Inquiry' })
            });

            if (res.ok) {
                toast.success('✅ Support request sent! We\'ll respond within 24 hours.');
                setSupportSubject('');
                setSupportMessage('');
                setActiveTab('overview');
            } else {
                throw new Error('Failed to send');
            }
        } catch (err) {
            toast.error('Failed to send message. Please try again.');
        } finally {
            setSendingSupport(false);
        }
    };

    const handleCloseAccount = async () => {
        const confirmDelete = confirm("Are you sure you want to PERMANENTLY delete your account? This cannot be undone.");
        if (!confirmDelete) return;

        const doubleCheck = prompt("Type 'DELETE' to confirm account closure:");
        if (doubleCheck !== 'DELETE') return;

        try {
            const res = await fetch('/api/user/me', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                toast.success('Account closed.');
                logout();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to close account');
            }
        } catch (err) {
            toast.error('Error closing account');
        }
    };

    if (!user) return <div className="p-8 text-center text-emerald-500/50">Please log in to view profile.</div>;

    return (
        <div className="min-h-screen bg-[#051810] text-gray-200 font-sans flex flex-col items-center py-8 px-4">

            <div className="w-full max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4">

                {/* Back Link */}
                <Link to="/" className="inline-flex items-center gap-2 text-emerald-500 hover:text-emerald-400 transition-colors text-sm font-bold uppercase tracking-wide mb-2">
                    <ArrowLeft size={16} /> Back to Dashboard
                </Link>

                {/* Compact Header */}
                <div className="flex items-center gap-5 bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                    <img src={user.picture} alt={user.name} className="w-16 h-16 rounded-full border-2 border-emerald-500/30 shadow-md z-10" />

                    <div className="flex-1 z-10">
                        <h1 className="text-2xl font-bold text-white tracking-tight">{user.name}</h1>
                        <p className="text-emerald-500/60 font-mono text-xs">{user.email}</p>
                    </div>

                    <div className="flex gap-3 z-10">
                        <div className="bg-[#050B14]/50 px-3 py-1.5 rounded-lg border border-emerald-500/20 text-right">
                            <div className="text-[9px] uppercase text-emerald-500 font-bold tracking-wider">Balance</div>
                            <div className="text-lg font-mono text-emerald-300 leading-none">£{(user.credits || 0).toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-emerald-900/30 gap-1">
                    {['overview', 'history', 'insights', 'invoices', 'support', 'settings', ...(user.role === 'admin' ? ['admin'] : [])].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1 ${activeTab === tab
                                ? (tab === 'admin' ? 'border-purple-500 text-purple-400' : 'border-emerald-500 text-emerald-400')
                                : (tab === 'admin' ? 'text-purple-600/50 hover:text-purple-400' : 'text-emerald-600/50 hover:text-emerald-400') + ' border-transparent hover:bg-emerald-900/10 rounded-t'
                                }`}
                        >
                            {tab === 'admin' && <Crown size={12} />}
                            {tab === 'insights' && <TrendingUp size={12} />}
                            {tab === 'invoices' && <Receipt size={12} />}
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="min-h-[300px]">
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Usage Tracker */}
                            <div>
                                <UsageTracker />
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                {/* Top Up with Card */}
                                <div className="bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30">
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <CreditCard size={16} className="text-emerald-500" />
                                        Top Up with Card
                                    </h3>
                                    <button
                                        onClick={() => setShowStripeCheckout(true)}
                                        className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white px-4 py-3 text-sm font-bold rounded transition-all flex items-center justify-center gap-2"
                                    >
                                        <CreditCard size={18} />
                                        Add Funds via Credit Card
                                    </button>
                                    <p className="text-xs text-emerald-500/40 mt-3">Secure payment powered by Stripe • £10-£1000</p>
                                </div>

                                {/* Promo Code */}
                                <div className="bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30">
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <Sparkles size={16} className="text-purple-400" />
                                        Redeem Code
                                    </h3>
                                    <div className="flex gap-2">
                                        <input
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                            placeholder="ENTER CODE"
                                            className="flex-1 bg-[#051810] border border-emerald-900/50 rounded px-3 py-2 text-sm text-white font-mono uppercase placeholder-emerald-800/50 focus:border-purple-500 outline-none transition-colors"
                                        />
                                        <button
                                            onClick={handleRedeem}
                                            disabled={!promoCode || redeeming}
                                            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-xs font-bold transition-all"
                                        >
                                            {redeeming ? '...' : 'Redeem'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-purple-400/40 mt-2">Enter promotional codes to add credits to your balance.</p>
                                </div>

                                {/* Stats */}
                                <div className="bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30 flex flex-col gap-3">
                                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                                        <Clock size={16} className="text-blue-400" />
                                        <h3>Status</h3>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs border-b border-emerald-900/30 pb-2">
                                            <span className="text-emerald-500/60">Account Type</span>
                                            <span className={`font-bold ${user.role === 'admin' ? 'text-purple-400' : 'text-emerald-300'}`}>
                                                {user.role === 'admin' ? 'Super Admin' : 'Standard'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-emerald-500/60">Joined</span>
                                            <span className="text-emerald-300 font-mono">{new Date().getFullYear()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <TransactionHistory />
                    )}

                    {activeTab === 'insights' && (
                        <div className="space-y-6">
                            {/* Usage Trends Chart */}
                            <UsageTrendsDashboard />

                            {/* Insights & Benchmarks Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InsightsPanel />
                                <BenchmarkWidget />
                            </div>

                            {/* ROI Calculator */}
                            <ROICalculator />
                        </div>
                    )}

                    {activeTab === 'invoices' && (
                        <InvoiceList />
                    )}

                    {activeTab === 'support' && (
                        <div className="bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                <Mail size={16} className="text-emerald-500" /> Contact Support
                            </h3>
                            <form onSubmit={handleSupportSubmit} className="space-y-3">
                                <input
                                    value={supportSubject}
                                    onChange={(e) => setSupportSubject(e.target.value)}
                                    placeholder="Subject"
                                    className="w-full bg-[#051810] border border-emerald-900/50 rounded p-2 text-sm text-white outline-none focus:border-emerald-500"
                                    required
                                />
                                <textarea
                                    value={supportMessage}
                                    onChange={(e) => setSupportMessage(e.target.value)}
                                    className="w-full bg-[#051810] border border-emerald-900/50 rounded p-2 text-sm text-white h-24 outline-none focus:border-emerald-500 resize-none"
                                    placeholder="How can we help?"
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={sendingSupport}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-sm transition-colors flex justify-center items-center gap-2"
                                >
                                    {sendingSupport ? 'Sending...' : <><MessageSquare size={14} /> Send Message</>}
                                </button>
                            </form>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-4">
                            {/* Legal Section */}
                            <div className="bg-[#0a1f16] p-5 rounded-xl border border-emerald-900/30">
                                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                                    <Shield size={16} className="text-emerald-500" /> Legal
                                </h3>
                                <Link to="/legal/terms" className="text-sm text-emerald-400 hover:text-emerald-300 underline font-medium">
                                    Terms of Service
                                </Link>
                            </div>
                            <div className="bg-red-950/20 p-5 rounded-xl border border-red-500/20">
                                <h3 className="text-sm font-bold text-red-500 mb-2 flex items-center gap-2">
                                    <AlertTriangle size={16} /> Danger Zone
                                </h3>
                                <p className="text-xs text-red-400/60 mb-4">
                                    Deleting your account is permanent.
                                </p>
                                <button
                                    onClick={handleCloseAccount}
                                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 px-4 py-2 rounded text-xs font-bold transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={14} /> Close Account
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'admin' && user.role === 'admin' && (
                        <AdminUserManagement />
                    )}
                </div>
            </div>

            {/* Stripe Checkout Modal */}
            {showStripeCheckout && (
                <StripeCheckout
                    onSuccess={(newBalance) => {
                        setShowStripeCheckout(false);
                        refreshProfile();
                        toast.success(`Balance updated! New balance: £${newBalance.toFixed(2)}`);
                    }}
                    onCancel={() => setShowStripeCheckout(false)}
                />
            )}
        </div>
    );
};
