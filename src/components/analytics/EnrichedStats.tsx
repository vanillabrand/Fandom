import React from 'react';
import { formatNumber } from '../../utils/analytics/generalUtils.js';

interface EnrichedStatsProps {
    node: any;
}

export const EnrichedStats: React.FC<EnrichedStatsProps> = ({ node }) => {
    if (!node || !node.data) return null;

    // [FIX] Robust Count Display
    // We accept 0 as a valid number, but reject null/undefined
    // Use loose equality != null to check for both null and undefined
    const getCount = (vals: any[]) => {
        for (const v of vals) {
            const n = Number(v);
            if (!isNaN(n) && v != null) return n;
        }
        return null; // Data Missing
    };

    const followers = getCount([node.data.followersCount, node.data.followerCount, node.data.followers, node.followersCount]);
    const following = getCount([node.data.followingCount, node.data.followsCount, node.data.following, node.followingCount]);
    const posts = getCount([node.data.postsCount, node.data.mediaCount, node.data.posts, node.postsCount]);

    if (followers === null && following === null && posts === null) return null;

    return (
        <div className="grid grid-cols-3 gap-2 mb-4 bg-emerald-900/20 p-3 rounded-lg border border-emerald-500/10 backdrop-blur-sm">
            <div className="text-center group hover:bg-white/5 rounded transition-colors p-1">
                <div className="text-lg font-bold text-white break-all">
                    {followers !== null ? formatNumber(followers) : '-'}
                </div>
                <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-medium">Followers</div>
            </div>
            <div className="text-center border-l border-emerald-500/10 group hover:bg-white/5 rounded transition-colors p-1">
                <div className="text-lg font-bold text-white break-all">
                    {following !== null ? formatNumber(following) : '-'}
                </div>
                <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-medium">Following</div>
            </div>
            <div className="text-center border-l border-emerald-500/10 group hover:bg-white/5 rounded transition-colors p-1">
                <div className="text-lg font-bold text-white break-all">
                    {posts !== null ? formatNumber(posts) : '-'}
                </div>
                <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-medium">Posts</div>
            </div>
        </div>
    );
};
