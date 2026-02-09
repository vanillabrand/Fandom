import React from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { Clock, Mail, LogOut, AlertCircle } from 'lucide-react';

export const PendingApprovalScreen = () => {
    const { user, logout } = useAuth();

    // Auto detect status from user
    const status = user?.status === 'blocked' ? 'blocked' : 'pending';
    const isPending = status === 'pending';
    const isBlocked = status === 'blocked';

    return (
        <div className="min-h-screen bg-[#051810] text-gray-200 font-sans flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4">
                {/* Card */}
                <div className="bg-[#0a1f16] p-8 rounded-xl border border-emerald-900/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        {isPending ? (
                            <div className="relative">
                                <Clock size={64} className="text-emerald-500 animate-pulse" />
                                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                            </div>
                        ) : (
                            <div className="relative">
                                <AlertCircle size={64} className="text-red-500" />
                                <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl" />
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <h1 className="text-2xl font-bold text-white text-center mb-2">
                        {isPending ? 'Pending Approval' : 'Account Blocked'}
                    </h1>

                    {/* User Info */}
                    {user && (
                        <div className="flex items-center gap-3 justify-center mb-6 pb-6 border-b border-emerald-900/30">
                            <img
                                src={user.picture}
                                alt={user.name}
                                className="w-10 h-10 rounded-full border-2 border-emerald-500/30"
                            />
                            <div>
                                <div className="text-sm font-medium text-white">{user.name}</div>
                                <div className="text-xs text-emerald-500/60">{user.email}</div>
                            </div>
                        </div>
                    )}

                    {/* Message */}
                    <div className="space-y-4 mb-6">
                        {isPending ? (
                            <>
                                <p className="text-center text-emerald-500/80">
                                    Your account is currently pending approval from an administrator.
                                </p>
                                <p className="text-center text-sm text-emerald-500/60">
                                    You'll receive access to the Query Builder once your account has been approved. This usually takes 24-48 hours.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-center text-red-400">
                                    Your account has been blocked by an administrator.
                                </p>
                                <p className="text-center text-sm text-red-400/60">
                                    If you believe this is an error, please contact support.
                                </p>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                        {/* Contact Support */}
                        <a
                            href="mailto:vanillabrand@gmail.com?subject=Account Approval Request"
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <Mail size={16} />
                            Contact Support
                        </a>

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="w-full bg-[#051810] hover:bg-[#0a1f16] border border-emerald-900/50 text-emerald-400 px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </div>
                </div>

                {/* Footer Note */}
                {isPending && (
                    <p className="text-center text-xs text-emerald-500/40">
                        Thank you for your patience while we review your account.
                    </p>
                )}
            </div>
        </div>
    );
};
