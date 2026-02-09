import React, { useState, useEffect } from 'react';
import { Users, UserCheck, Link, Mail, Heart, MessageCircle, Instagram, ShoppingBag, Hash, Zap, Star, MapPin, AtSign, Sparkles, BrainCircuit, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProxiedImage } from '../ProxiedImage.js';

interface ProfileMetricsPanelProps {
    data: any; // The enriched profile object
    onShowReasoning?: (item: any) => void;
}

export const ProfileMetricsPanel: React.FC<ProfileMetricsPanelProps> = ({ data, onShowReasoning }) => {
    const [fadeIn, setFadeIn] = useState(true);
    const [imageLoading, setImageLoading] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);

    // Fade out and in when data changes
    useEffect(() => {
        setFadeIn(false);
        setImageLoading(true);
        setImageLoaded(false);

        const timer = setTimeout(() => {
            setFadeIn(true);
        }, 200); // 200ms fade out delay

        return () => clearTimeout(timer);
    }, [data?.id, data?.username, data?.label]); // Trigger on node change

    if (!data) return null;

    // Helper to format large numbers
    const formatNumber = (num: number) => {
        if (!num) return '0';
        if (num > 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num > 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toLocaleString();
    };

    // Extract fields
    let rawIdentifier = data.username || data.ownerUsername || data.label || 'Unknown';

    // --- PREFIX CLEANING & TYPE DETECTION ---
    const getIdentity = (raw: string, group?: string) => {
        let clean = raw;
        let type = group || 'unknown';
        let Icon = Users;

        // Strip known prefixes
        if (raw.startsWith('cr_')) { clean = raw.replace('cr_', ''); type = 'creator'; Icon = Users; }
        else if (raw.startsWith('br_')) { clean = raw.replace('br_', ''); type = 'brand'; Icon = ShoppingBag; }
        else if (raw.startsWith('pr_')) { clean = raw.replace('pr_', ''); type = 'profile'; Icon = Instagram; }
        else if (raw.startsWith('ht_')) { clean = raw.replace('ht_', ''); type = 'hashtag'; Icon = Hash; }
        else if (raw.startsWith('loc_')) { clean = raw.replace('loc_', ''); type = 'location'; Icon = MapPin; }
        else if (raw.startsWith('mn_')) { clean = raw.replace('mn_', ''); type = 'mention'; Icon = AtSign; }
        else if (raw.startsWith('over_')) { clean = raw.replace(/^over_\d+_/, ''); type = 'overindexed'; Icon = Zap; }
        else if (raw.startsWith('topic_')) { clean = raw.replace(/^topic_\d+_|^topic_/, ''); type = 'topic'; Icon = MessageCircle; }
        else if (raw.startsWith('subtopic_')) { clean = raw.replace(/^subtopic_\d+_|^subtopic_/, ''); type = 'subtopic'; Icon = Sparkles; }
        else if (raw.startsWith('t_')) { clean = raw.replace(/^t_\d+_/, ''); type = 'topic'; Icon = MessageCircle; }
        else if (raw.startsWith('c_')) { clean = raw.replace(/^c_\d+/, 'Cluster'); type = 'cluster'; Icon = Hash; }
        else if (raw.startsWith('mn_') || raw === 'MAIN') { clean = 'Main'; type = 'main'; Icon = Star; }

        // If explicit group provided, override icon mapping
        if (group === 'brand') Icon = ShoppingBag;
        if (group === 'topic') Icon = MessageCircle;
        if (group?.startsWith('topic_')) Icon = MessageCircle;
        if (group?.startsWith('subtopic_')) Icon = Sparkles;
        if (group === 'concept') Icon = BrainCircuit;
        if (group === 'cluster') Icon = Hash;
        if (group === 'creator') Icon = Users;
        if (group === 'location') Icon = MapPin;
        if (group === 'hashtag') Icon = Hash;

        return { clean, type, Icon };
    };

    const { clean: username, type: nodeType, Icon: HeaderIcon } = getIdentity(rawIdentifier, data.group);

    const fullName = data.fullName || data.full_name || '';
    const bio = data.biography || data.bio || '';
    const followers = data.followersCount || data.followerCount || data.followers || data.follower_count || 0;
    const following = data.followsCount || data.followingCount || data.following || data.following_count || 0;
    const posts = data.postsCount || data.mediaCount || data.posts || 0;
    const isVerified = data.isVerified || data.is_verified || false;
    const isPrivate = data.isPrivate || data.is_private || false;
    const profilePic = data.profilePicUrl || data.profile_pic_url || data.profile_pic_url_hd;
    const externalUrl = data.externalUrl || data.external_url;

    // Debug logging for overindexed profiles
    if (data.group === 'overindexed') {
        console.log('[ProfileMetricsPanel] Overindexed profile data:', {
            rawIdentifier,
            username,
            externalUrl,
            dataUsername: data.username,
            constructedUrl: externalUrl || `https://www.instagram.com/${username}/`
        });
    }

    // Engagement Rate Calculation
    let engagementRate = null;
    if (data.latestPosts && data.latestPosts.length > 0) {
        const totalEng = data.latestPosts.reduce((acc: number, p: any) => acc + (p.likesCount || 0) + (p.commentsCount || 0), 0);
        const avg = totalEng / data.latestPosts.length;
        engagementRate = ((avg / followers) * 100).toFixed(2);
    }

    // [SUBJECT MATTER MODE]
    const isTopic = nodeType === 'topic' || nodeType === 'subtopic' || nodeType === 'concept' || nodeType === 'overindexed' || data.isInsight || data.group?.startsWith('topic') || data.group?.startsWith('subtopic');

    if (isTopic) {
        // [FIX] Check node.value first (where occurrence count is stored), then fallback to data.value, then calculate from val
        const nodeValue = (data as any).value; // The node itself has the value property
        console.log('[Occurrence Count Debug] Topic node data:', {
            label: data.label,
            id: data.id,
            value: (data as any).value,
            val: data.val,
            group: data.group,
            allKeys: Object.keys(data)
        });
        const mentionCount = (typeof nodeValue === 'number') ? nodeValue : Math.max(1, Math.floor(((data.val || 12) - 10) / 2));
        console.log('[Occurrence Count Debug] Calculated mentionCount:', mentionCount);

        // Dynamic Topic Styles
        let badgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/30";
        let iconColor = "text-purple-400";
        let ringColor = "border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]";

        if (nodeType === 'subtopic' || nodeType?.startsWith('subtopic')) {
            badgeColor = "bg-blue-500/20 text-blue-300 border-blue-500/30";
            iconColor = "text-blue-400";
            ringColor = "border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]";
        }
        else if (nodeType === 'concept') {
            badgeColor = "bg-pink-500/20 text-pink-300 border-pink-500/30";
            iconColor = "text-pink-400";
            ringColor = "border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]";
        }
        else if (nodeType === 'overindexed') {
            badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
            iconColor = "text-emerald-400";
            ringColor = "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]";
        }

        return (
            <div className="flex flex-col gap-4 text-white">
                <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full bg-black/40 flex items-center justify-center border-2 ${ringColor}`}>
                        <HeaderIcon className={`${iconColor} w-8 h-8`} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{data.label || username}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded border uppercase flex items-center gap-1 w-fit mt-1 ${badgeColor}`}>
                            {nodeType?.replace('_', ' ')}
                        </span>
                    </div>
                </div>

                <div className="bg-black/40 p-4 rounded-lg border border-white/5 hover:border-purple-500/30 transition-colors">
                    <div className="text-3xl font-bold text-white mb-1">{mentionCount}</div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Occurrences</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                        mentions or relevance score in analysis.
                    </div>
                </div>

                {onShowReasoning && (
                    <button
                        onClick={() => {
                            console.log('[Provenance Debug] Clicked button, data:', data);
                            console.log('[Provenance Debug] Has provenance?', !!data.provenance);
                            onShowReasoning(data);
                        }}
                        className="flex items-center justify-center gap-2 w-full py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded text-purple-300 text-xs font-medium transition-colors"
                    >
                        <BrainCircuit size={14} />
                        View Provenance & Evidence
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 text-white">

            {/* --- HEADER --- */}
            <div className="flex items-start gap-4">
                <div className="relative">
                    <div className={`w-16 h-16 rounded-full overflow-hidden border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-900/40 flex items-center justify-center`}>
                        <AnimatePresence mode="wait">
                            {!imageLoaded && (
                                <motion.div
                                    key="loader"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center z-10"
                                >
                                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Profile Image with smooth motion fade */}
                        <motion.div
                            key={profilePic}
                            className="w-full h-full"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: imageLoaded ? 1 : 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            {profilePic ? (
                                <ProxiedImage
                                    src={profilePic}
                                    alt={username}
                                    className="w-full h-full object-cover"
                                    onLoad={() => setImageLoaded(true)}
                                    onError={() => setImageLoaded(true)}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <HeaderIcon className="text-emerald-400 w-8 h-8" />
                                </div>
                            )}
                        </motion.div>
                    </div>
                    {isVerified && (
                        <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border-2 border-[#051810]">
                            <UserCheck size={12} className="text-white" />
                        </div>
                    )}
                </div>


                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {/* [FIX] Clickable Profile Link */}
                        <a
                            href={externalUrl || `https://www.instagram.com/${username}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-bold truncate hover:text-emerald-400 transition-colors hover:underline decoration-emerald-500/50 underline-offset-4 block"
                        >
                            {username}
                        </a>
                        {isPrivate && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">PRIVATE</span>}
                    </div>
                    {fullName && <div className="text-sm text-gray-400 truncate">{fullName}</div>}

                    <div className="flex flex-wrap gap-2 mt-2">
                        {/* Type Badge */}
                        <span className="text-[10px] font-mono bg-white/5 text-gray-400 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1 uppercase">
                            <HeaderIcon size={8} /> {nodeType}
                        </span>

                        {data.categoryName && (
                            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                                {data.categoryName}
                            </span>
                        )}
                        {data.isBusinessAccount && (
                            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                                BUSINESS
                            </span>
                        )}
                        {/* [NEW] Over-index Score Badge */}
                        {data.overindexScore && typeof data.overindexScore === 'number' && (
                            <span className="text-[10px] font-mono bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 cursor-help flex items-center gap-1" title="Comparatively higher affinity than general audience">
                                <Zap size={8} />
                                {data.overindexScore.toFixed(1)}x
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* --- METRICS GRID --- */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 p-2 rounded-lg border border-white/5 text-center hover:border-emerald-500/30 transition-colors">
                    <div className="textlg font-bold text-white">{formatNumber(followers)}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Followers</div>
                </div>
                <div className="bg-black/40 p-2 rounded-lg border border-white/5 text-center hover:border-emerald-500/30 transition-colors">
                    <div className="textlg font-bold text-white">{formatNumber(following)}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Following</div>
                </div>
            </div>

            {/* --- BIO & LINKS --- */}
            {(bio || externalUrl) && (
                <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-sm">
                    {bio && <p className="text-gray-300 whitespace-pre-wrap leading-relaxed mb-2">{bio}</p>}

                    {externalUrl && (
                        <a href={externalUrl.startsWith('http') ? externalUrl : `https://${externalUrl}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-xs truncate mt-2 bg-black/20 p-2 rounded">
                            <Link size={12} />
                            <span className="truncate">{externalUrl}</span>
                        </a>
                    )}
                </div>
            )}

            {/* --- CONTACT INFO (Enriched) --- */}
            {(data.publicEmail || data.contactPhoneNumber || data.businessAddressJson) && (
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-bold text-gray-500 uppercase px-1">Contact Details</div>
                    {data.publicEmail && (
                        <div className="flex items-center gap-2 text-xs text-gray-300 bg-white/5 p-2 rounded">
                            <Mail size={12} className="text-gray-500" />
                            {data.publicEmail}
                        </div>
                    )}
                </div>
            )}

            {/* --- RELATED PROFILES --- */}
            {data.relatedProfiles && data.relatedProfiles.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-gray-500 uppercase px-1 flex items-center gap-2">
                        <Users size={12} />
                        Related Accounts ({data.relatedProfiles.length})
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {data.relatedProfiles.slice(0, 5).map((profile: any, idx: number) => (
                            <a
                                key={idx}
                                href={`https://www.instagram.com/${profile.username}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors group"
                            >
                                <div className="w-8 h-8 rounded-full bg-black/40 overflow-hidden flex-shrink-0 border border-white/10">
                                    {profile.profile_pic_url ? (
                                        <ProxiedImage
                                            src={profile.profile_pic_url}
                                            alt={profile.username}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                                            <Users size={12} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-gray-200 truncate group-hover:text-emerald-400 transition-colors">
                                        {profile.full_name || profile.username}
                                    </div>
                                    <div className="text-[10px] text-gray-500 truncate">@{profile.username}</div>
                                </div>
                                <ExternalLink size={12} className="text-gray-600 group-hover:text-emerald-500 opacity-0 group-hover:opacity-100 transition-all" />
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* --- RECENT POSTS GALLERY --- */}
            {data.latestPosts && data.latestPosts.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-gray-500 uppercase px-1 flex items-center gap-2">
                        <Instagram size={12} />
                        Recent Posts ({data.latestPosts.length})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {data.latestPosts.slice(0, 6).map((post: any, idx: number) => {
                            const mediaUrl = post.displayUrl || post.imageUrl || post.thumbnailUrl || post.videoCover;
                            const postUrl = post.url || post.postUrl || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : '#');
                            const isVideo = post.videoUrl || post.type === 'Video' || post.videoViewCount > 0;

                            return (
                                <a
                                    key={idx}
                                    href={postUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group relative aspect-square rounded overflow-hidden border border-white/10 hover:border-emerald-500/50 transition-all bg-black/40"
                                >
                                    {mediaUrl ? (
                                        <ProxiedImage
                                            src={mediaUrl}
                                            alt={`Post ${idx + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Instagram className="w-6 h-6 text-white/20" />
                                        </div>
                                    )}

                                    {/* Video Indicator */}
                                    {isVideo && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/30">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M5 3L19 12L5 21V3Z" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}

                                    {/* Engagement Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none">
                                        <div className="flex flex-col gap-0.5 w-full">
                                            {/* Video Views if available */}
                                            {post.videoViewCount > 0 && (
                                                <div className="flex items-center gap-1 text-[9px] text-gray-300">
                                                    <span className="opacity-70">👁</span>
                                                    {formatNumber(post.videoViewCount)}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between text-[10px] text-white w-full">
                                                <div className="flex items-center gap-1">
                                                    <Heart size={10} className={post.likesCount > 0 ? "fill-white/80" : ""} />
                                                    {formatNumber(post.likesCount)}
                                                </div>
                                                {post.commentsCount > 0 && (
                                                    <div className="flex items-center gap-1 text-gray-300">
                                                        <MessageCircle size={10} />
                                                        {formatNumber(post.commentsCount)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* --- FOOTER / ENGAGEMENT HINT --- */}
            {engagementRate && (
                <div className="flex items-center justify-between bg-gradient-to-r from-emerald-900/20 to-transparent p-2 rounded border-l-2 border-emerald-500">
                    <span className="text-xs text-emerald-400 font-medium">Avg Engagement</span>
                    <span className="text-sm font-bold text-white">{engagementRate}%</span>
                </div>
            )}

        </div>
    );
};
