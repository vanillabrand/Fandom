import React from 'react';
import { Trophy, TrendingUp, Users, Heart, MessageCircle, HelpCircle, ExternalLink } from 'lucide-react';
import { ProxiedImage } from '../ProxiedImage.js';

// --- LEADERBOARD WIDGET ---
interface LeaderboardItem {
    rank: number;
    label: string;
    value: string | number;
    subValue?: string;
    img?: string;
    provenance?: any;
    username?: string;
    platform?: string;
    profileUrl?: string;
}

// [FIX] Accept onShowReasoning prop
export const LeaderboardWidget: React.FC<{ data: any[]; onShowReasoning?: (item: any) => void }> = ({ data, onShowReasoning }) => {
    // Transform data if needed, assuming generic structure for now
    const items: LeaderboardItem[] = data.map((d, i) => {
        // Use actual username for URL construction, full name for display
        const actualUsername = d.username || d.ownerUsername || d.handle;
        const displayName = d.fullName || d.name || d.label || actualUsername;
        const platform = d.platform || 'instagram'; // Default to Instagram

        // [PRIORITY] Construct profile URL - prioritize scraped data
        // 1. Check scraped profileUrl FIRST (from dataset)
        // 2. Check externalUrl and url fields
        // 3. Only construct from username as LAST RESORT
        let profileUrl = d.profileUrl || d.externalUrl || d.url;
        if (!profileUrl && actualUsername) {
            console.warn(`[SmartWidgets] No scraped profileUrl for ${displayName}, constructing from username`);
            const cleanUsername = actualUsername.replace('@', '');
            if (platform === 'tiktok') {
                profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
            } else {
                profileUrl = `https://www.instagram.com/${cleanUsername}/`;
            }
        } else if (profileUrl) {
            console.log(`[SmartWidgets] Using scraped profileUrl for ${displayName}: ${profileUrl}`);
        }

        return {
            rank: i + 1,
            label: displayName,
            value: d.value || d.followers || d.followerCount || 0,
            subValue: d.details || d.category || d.bio?.slice(0, 30),
            img: d.img || d.profilePicUrl || d.profilePicUrlHD,
            provenance: d.provenance,
            username: actualUsername,
            platform: platform,
            profileUrl: profileUrl
        };
    }).slice(0, 5); // Top 5

    return (
        <div className="space-y-2">
            {items.map((item) => (
                <div key={item.rank} className="flex items-center gap-3 bg-[#020617]/50 p-2 rounded border border-white/5 hover:bg-white/5 transition-colors group">
                    <div className={`
                        w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0
                        ${item.rank === 1 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                            item.rank === 2 ? 'bg-zinc-400/20 text-zinc-300 border border-zinc-400/50' :
                                item.rank === 3 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/50' :
                                    'bg-gray-800 text-gray-500'}
                    `}>
                        {item.rank}
                    </div>

                    {item.img && <ProxiedImage src={item.img} alt={item.label} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-gray-200 truncate">{item.label}</span>
                            {item.profileUrl && (
                                <a
                                    href={item.profileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-500/50 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"
                                    title="View profile"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ExternalLink size={10} />
                                </a>
                            )}
                        </div>
                        {item.subValue && <div className="text-[10px] text-gray-500 truncate">{item.subValue}</div>}
                    </div>

                    <div className="text-right shrink-0">
                        <div className="text-xs font-mono text-emerald-400">{typeof item.value === 'number' ? item.value.toLocaleString() : item.value}</div>
                        {/* [NEW] Reasoning Button */}
                        {item.provenance && onShowReasoning && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onShowReasoning(item);
                                }}
                                className="ml-auto mt-1 text-emerald-500/50 hover:text-emerald-400 transition-colors"
                                title="View data provenance"
                            >
                                <HelpCircle size={10} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};


// --- PULSE (SENTIMENT/STATS) WIDGET ---
export const PulseWidget: React.FC<{ data: any }> = ({ data }) => {
    // Expecting object like { sentimentScore: 0.8, engagementRate: '5.2%', activeDiscussions: 12 }
    const sentiment = data.sentimentScore || 0;
    const mood = sentiment > 0.5 ? 'Positive' : sentiment < -0.5 ? 'Negative' : 'Neutral';
    const moodColor = sentiment > 0.5 ? 'text-emerald-400' : sentiment < -0.5 ? 'text-rose-400' : 'text-blue-400';

    return (
        <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 bg-gradient-to-r from-emerald-900/20 to-blue-900/20 p-3 rounded border border-white/5 flex items-center justify-between">
                <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">Community Vibe</div>
                    <div className={`text-lg font-bold ${moodColor}`}>{mood}</div>
                </div>
                <ActivityGraph sentiment={sentiment} />
            </div>

            <div className="bg-[#020617] p-2 rounded border border-white/5">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                    <Heart size={10} /> Engagement
                </div>
                <div className="text-sm font-mono text-white">{data.engagementRate || '0%'}</div>
            </div>

            <div className="bg-[#020617] p-2 rounded border border-white/5">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                    <MessageCircle size={10} /> Activity
                </div>
                <div className="text-sm font-mono text-white">{data.activeDiscussions || 0}</div>
            </div>
        </div>
    );
};

const ActivityGraph = ({ sentiment }: { sentiment: number }) => (
    <div className="h-8 w-16 flex items-end gap-0.5 opacity-50">
        {[40, 70, 45, 90, 60, 80, 50].map((h, i) => (
            <div key={i} className={`flex-1 rounded-t-sm ${sentiment > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ height: `${h}%` }}></div>
        ))}
    </div>
);


// --- CONTENT GRID (MINI) ---
export const ContentGridWidget: React.FC<{ data: any[] }> = ({ data }) => {
    return (
        <div className="grid grid-cols-3 gap-1">
            {data.slice(0, 9).map((item, i) => {
                const isVideo = item.videoUrl || item.type === 'Video';
                const mediaSrc = item.thumbnailUrl || item.displayUrl || item.imageUrl;

                return (
                    <a
                        key={i}
                        href={item.url || item.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square bg-gray-800 rounded overflow-hidden relative group block"
                    >
                        {mediaSrc ? (
                            <ProxiedImage src={mediaSrc} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-[9px] p-1 text-center bg-[#0a1625]">
                                {item.caption ? item.caption.substring(0, 10) : 'No Media'}
                            </div>
                        )}

                        {/* Play Icon Overlay */}
                        {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/30">
                                    {/* Simple Play Icon SVG directly to avoid import issues if Lucide Play isn't imported */}
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M5 3L19 12L5 21V3Z" />
                                    </svg>
                                </div>
                            </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-1 text-[8px] text-white">
                                <Heart size={8} className="fill-white" /> {item.likesCount || item.likes || 0}
                            </div>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
