import React, { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.js';
import { RefreshCw } from 'lucide-react';

export const BudgetDisplay: React.FC = () => {

    const { user, refreshProfile } = useAuth();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshProfile();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    if (!user) return null;

    return (
        <div className="flex items-center bg-[#0a2f1f]/80 border border-emerald-500/30 rounded-lg overflow-hidden h-9">
            <div className="flex items-center gap-2 px-3 h-full border-r border-emerald-500/20">
                <div className="p-0.5 bg-emerald-500/10 rounded-full">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-[8px] text-emerald-500/70 font-bold uppercase tracking-wider mb-0.5">Balance</span>
                    <span className={`text-sm font-mono font-bold leading-none ${user.balance && user.balance < 2 ? 'text-red-400' : 'text-emerald-100'}`}>
                        ${(user.balance ?? 0).toFixed(2)}
                    </span>
                </div>
            </div>

            <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`px-2 h-full flex items-center justify-center text-emerald-500 hover:text-emerald-300 hover:bg-[#13422e] transition-all border-l border-emerald-500/10 ${isRefreshing ? 'animate-spin' : ''}`}
                title="Refresh Credits"
            >
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
        </div>
    );
};
