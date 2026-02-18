import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FandomData } from '../../types.js';
import { TrendingUp, Users, ShoppingBag, Hash, ChevronDown, ChevronUp, ExternalLink, PanelRightClose, PanelRightOpen, Palette, HelpCircle, Network, Image, Globe, Instagram, AlertCircle, BrainCircuit, Video, Heart } from 'lucide-react';
import VisualDNAWidget from './VisualDNAWidget.js';
import { ReasoningPanel } from './dashboard/ReasoningPanel.js';
import { ProxiedImage } from './ProxiedImage.js';
import { MediaPreview } from './MediaPreview.js';
import { EnrichedStats } from './analytics/EnrichedStats.js';
import { MediaGallery } from './analytics/MediaGallery.js';
import { getEvidence } from '../utils/analytics/evidenceUtils.js';
import { normalizeId } from '../utils/analytics/generalUtils.js';
import { useOverindexedProfiles } from '../hooks/useOverindexedProfiles.js';

interface AnalyticsPanelProps {
    data: FandomData;
    focusedNodeId: string | null;
    onSelect: (id: string | null) => void;
    isOpen: boolean;
    onToggle: (isOpen: boolean) => void;
}

const AccordionItem = ({
    title,
    icon: Icon,
    children,
    isOpen,
    onToggle,
    colorClass
}: {
    title: string;
    icon: any;
    children: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    colorClass: string;
}) => {
    return (
        <div className="border-b border-emerald-500/10 last:border-0 border-t-0 bg-transparent">
            <button
                onClick={onToggle}
                className={`w-full flex items-center justify-between p-4 transition-colors duration-200 ${isOpen ? 'bg-emerald-500/5 sticky top-0 z-10 backdrop-blur-md' : 'hover:bg-white/5'}`}
            >
                <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${colorClass} drop-shadow-md`} />
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">{title}</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
            </button>

            {isOpen && (
                <div className="p-4 bg-black/20 animate-fade-in-up">
                    {children}
                </div>
            )}
        </div>
    );
};


// [UNIFIED] Frontend ID Normalization (Matches JobOrchestrator)


const profileGroups = ['main', 'creator', 'brand', 'profile', 'user', 'overindexed']; // [FIX] Exclude structural nodes (topic, subtopic, etc.) so they use Topic/Cluster header layout

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ data, focusedNodeId, onSelect, isOpen, onToggle }) => {
    // [CRITICAL FIX] Stabilize data references to prevent infinite render loops
    // The `data` prop may get a new reference on every parent render, causing all
    // useMemo hooks below to recompute infinitely and crash the browser
    // [FIX] Filter out "Unknown" profiles before rendering
    const stableNodes = useMemo(() => {
        const nodes = data.nodes || [];
        return nodes.filter(node => {
            const label = (node.label || '').toLowerCase();
            const username = ((node as any).username || '').toLowerCase();
            const id = (node.id || '').toLowerCase();
            // Exclude nodes with "unknown" as label, username, or id
            return label !== 'unknown' && username !== 'unknown' && id !== 'unknown';
        });
    }, [data.nodes?.length, data.nodes?.[0]?.id]);
    const stableLinks = useMemo(() => data.links || [], [data.links?.length, data.links?.[0]?.source]);

    // Ensure analytics exists with fallbacks
    // [FIX] explicit cast to any to allow new properties like overindexing without TS error
    const analytics = data.analytics || {} as any;
    const geoData = analytics.visualAnalysis?.geoData || [];

    // State lifted to parent
    // State lifted to parent
    const [expandedSection, setExpandedSection] = useState<string | null>('visuals'); // [FIX] Default to Visual DNA instead of provenance
    const scrollRef = useRef<HTMLDivElement>(null);

    // [NEW] Scroll to top when a new node/item is selected
    useEffect(() => {
        if (focusedNodeId && scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [focusedNodeId]);





    /* LEGACY LOGIC
    const _legacy_getEvidence = (target: any) => {
        if (!data || !target || !analytics) return [];
        const keyword = (target.name || target.label || '').toLowerCase();
        const username = keyword.replace('@', ''); // Remove @ prefix for username search
        // const evidence: any[] = [];
    
        // console.log('[Evidence Search] Searching for:', keyword, 'Username:', username);
        // console.log('[Evidence Search] Dataset has', data.data?.length || 0, 'records');
        // console.log('[Evidence Search] Target:', target);
    
        // 0. Direct Evidence (from Node Data)
        if (target.data && (target.data.originalPost || target.data.context)) {
            evidence.push({
                type: 'post',
                text: target.data.originalPost || target.data.context,
                url: target.data.postUrl || '#',
                date: 'Direct Match',
                author: target.data.author || 'Unknown'
            });
        }
    
        // 1. Search Top Content (Posts)
        if (analytics.topContent && Array.isArray(analytics.topContent)) {
            analytics.topContent.forEach((post: any) => {
                if (
                    post.description?.toLowerCase().includes(keyword) ||
                    post.title?.toLowerCase().includes(keyword) ||
                    post.author?.toLowerCase().includes(username) ||
                    (post.hashtags && post.hashtags.some((h: string) => h.toLowerCase().includes(keyword)))
                ) {
                    // Construct accurate URL
                    let postUrl = '#';
                    if (post.url && post.url.startsWith('http')) {
                        postUrl = post.url;
                    } else if (post.shortCode) {
                        postUrl = `https://www.instagram.com/p/${post.shortCode}/`;
                    } else if (post.webVideoUrl && post.webVideoUrl.startsWith('http')) {
                        postUrl = post.webVideoUrl;
                    } else if (post.author) {
                        postUrl = `https://www.instagram.com/${post.author.replace('@', '')}/`;
                    }
    
                    evidence.push({
                        type: 'post',
                        text: (post.description || '').slice(0, 150) || (post.title || '').slice(0, 150) || 'Post content',
                        url: postUrl,
                        date: post.timestamp ? new Date(post.timestamp).toLocaleDateString() : 'Recent',
                        author: post.author || 'Unknown'
                    });
                }
            });
        }
    
        // 2. Search Nodes (Bios) - Find the creator's profile
        const node = data.nodes.find(n =>
            n.label?.toLowerCase() === keyword ||
            n.label?.toLowerCase() === username ||
            n.id === target.name ||
            n.id === target.name
        ) as any;
    
        if (node && node.data) {
            if (node.data.biography || node.data.bio) {
                evidence.push({
                    type: 'bio',
                    text: (node.data.biography || node.data.bio || '').slice(0, 150),
                    url: node.data.externalUrl || `https://instagram.com/${username}`,
                    date: 'Profile Bio',
                    author: username
                });
            }
        }
    
        // [NEW] 1. Check for specific media/posts attached to this node (from Backend Hydration)
        const directPosts = target.data?.latestPosts || target.latestPosts;
        if (directPosts && Array.isArray(directPosts)) {
            console.log(`[Evidence] Found ${directPosts.length} direct posts for ${target.label}`);
            directPosts.forEach((post: any) => {
                evidence.push({
                    type: (post.type === 'Video' || post.videoUrl || post.isVideo) ? 'video' : 'post',
                    text: (post.caption || post.text || '').toString().slice(0, 150),
                    url: post.url || post.postUrl || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : '#'),
                    mediaUrl: post.displayUrl || post.mediaUrl || post.thumbnailUrl || post.imageUrl || post.image || post.display_url,
                    date: post.timestamp ? new Date(post.timestamp).toLocaleDateString() : 'Recent',
                    author: post.ownerUsername || target.label || 'Unknown',
                    isDirect: true
                });
            });
        }
    
        // 3. Search Raw Dataset Records - Find profile records matching username
        if (data.data && Array.isArray(data.data)) {
            // First, look for the creator's own profile record
            const profileRecord = data.data.find((record: any) =>
                record.username?.toLowerCase() === username ||
                record.ownerUsername?.toLowerCase() === username
            );
    
            if (profileRecord && (profileRecord.biography || profileRecord.bio)) {
                evidence.push({
                    type: 'bio',
                    text: (profileRecord.biography || profileRecord.bio).slice(0, 150),
                    url: profileRecord.url || profileRecord.externalUrl || `https://instagram.com/${username}`,
                    date: 'Profile Record',
                    author: username
                });
            }
    
            // AGGRESSIVE search - check EVERY field in EVERY record
            console.log('[Evidence Search] Searching through', data.data.length, 'raw records');
    
            data.data.forEach((record: any, idx: number) => {
                if (evidence.length >= 20) return; // Stop after 20
    
                let matchFound = false;
                let matchText = '';
                let matchType = 'post';
    
                // Search ALL possible text fields
                const searchFields = [
                    'caption', 'text', 'description', 'biography', 'bio',
                    'fullText', 'title', 'content', 'username', 'ownerUsername',
                    'displayName', 'fullName', 'name'
                ];
    
                for (const field of searchFields) {
                    const value = record[field];
                    if (value && typeof value === 'string') {
                        const lowerValue = value.toLowerCase();
                        if (lowerValue.includes(keyword) || lowerValue.includes(username)) {
                            matchFound = true;
                            matchText = value;
                            matchType = (field === 'biography' || field === 'bio') ? 'bio' : 'post';
                            if (idx < 3) console.log('[Evidence Search] Match found in field:', field, 'Text:', value.slice(0, 50));
                            break;
                        }
                    }
                }
    
                // Also check hashtags array
                if (!matchFound && record.hashtags && Array.isArray(record.hashtags)) {
                    if (record.hashtags.some((h: string) => h.toLowerCase().includes(keyword))) {
                        matchFound = true;
                        matchText = record.caption || record.text || `Post with hashtag matching ${keyword}`;
                        matchType = 'post';
                    }
                }
    
                if (matchFound && matchText) {
                    // Construct accurate URL from record data
                    let recordUrl = '#';
                    if (record.url && record.url.startsWith('http')) {
                        recordUrl = record.url;
                    } else if (record.postUrl && record.postUrl.startsWith('http')) {
                        recordUrl = record.postUrl;
                    } else if (record.shortCode) {
                        recordUrl = `https://www.instagram.com/p/${record.shortCode}/`;
                    } else if (record.webVideoUrl && record.webVideoUrl.startsWith('http')) {
                        recordUrl = record.webVideoUrl;
                    } else if (record.username || record.ownerUsername) {
                        const user = (record.username || record.ownerUsername).replace('@', '');
                        recordUrl = `https://www.instagram.com/${user}/`;
                    }
    
                    evidence.push({
                        type: matchType,
                        text: matchText.slice(0, 150),
                        url: recordUrl,
                        date: record.timestamp ? new Date(record.timestamp).toLocaleDateString() :
                            record.createdAt ? new Date(record.createdAt).toLocaleDateString() :
                                record.date || 'Recent',
                        author: record.username || record.ownerUsername || record.author || record.displayName || 'Unknown'
                    });
                }
            });
        }
    
        // 4. Search for hashtag mentions
        if (keyword.startsWith('#') || keyword.startsWith('ht_')) {
            const hashtagName = keyword.replace(/^(#|ht_)/, '');
            if (data.data && Array.isArray(data.data)) {
                data.data
                    .filter((record: any) => {
                        const hashtags = record.hashtags || [];
                        return hashtags.some((h: string) => h.toLowerCase().includes(hashtagName));
                    })
                    .slice(0, 5)
                    .forEach((record: any) => {
                        evidence.push({
                            type: 'post',
                            text: (record.caption || record.text || '').slice(0, 150) || `Post with #${hashtagName}`,
                            url: record.url || record.postUrl || '#',
                            date: record.timestamp ? new Date(record.timestamp).toLocaleDateString() : 'Recent',
                            author: record.username || record.ownerUsername || 'Unknown'
                        });
                    });
            }
        }
    
        console.log('[Evidence Search] Found', evidence.length, 'evidence items before dedup');
    
        // Remove duplicates based on text similarity
        const uniqueEvidence = evidence.filter((ev, idx, arr) =>
            arr.findIndex(e => e.text === ev.text && e.author === ev.author) === idx
        );
    
        console.log('[Evidence Search] After dedup:', uniqueEvidence.length, 'unique items');
    
        // CRITICAL: If no evidence found, return sample records from dataset
        // User wants to see ACTUAL DATA for every item, not "no matches found"
        if (uniqueEvidence.length === 0 && data.data && Array.isArray(data.data) && data.data.length > 0) {
            console.log('[Evidence Search] No matches found, returning sample records');
    
            // Take up to 5 random sample records from the dataset
            const sampleSize = Math.min(5, data.data.length);
            const samples = [];
            const step = Math.floor(data.data.length / sampleSize);
    
            for (let i = 0; i < sampleSize; i++) {
                const record = data.data[i * step];
                if (record) {
                    const text = record.caption || record.text || record.description ||
                        record.biography || record.bio ||
                        `${record.username || record.ownerUsername || 'User'}'s content`;
    
                    samples.push({
                        type: (record.biography || record.bio) ? 'bio' : 'post',
                        text: text.slice(0, 150),
                        url: record.url || record.postUrl || record.externalUrl || '#',
                        date: record.timestamp ? new Date(record.timestamp).toLocaleDateString() :
                            record.createdAt ? new Date(record.createdAt).toLocaleDateString() :
                                'Sample Data',
                        author: record.username || record.ownerUsername || record.displayName || 'Unknown',
                        note: 'Representative sample from dataset'
                    });
                }
            }
    
            return samples;
        }
    
        return uniqueEvidence.slice(0, 10); // Return first 10
    };
    */

    const handleShowReasoning = useCallback((item: any, type: string) => {
        // [FIX] Ensure the item is selected so data propagates
        if (item && item.id) {
            onSelect(item.id);
        }
        // Just switch to the provenance tab
        setExpandedSection('provenance');
        // [UX] Scroll to BOTTOM to see the provenance
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
        }, 100);
    }, [onSelect]);

    const toggleSection = useCallback((section: string) => {
        setExpandedSection(prev => prev === section ? null : section);
    }, []);

    // IMPORTANT: All hooks must be called before any conditional returns
    // Logic to determine what to show - use useMemo to ensure updates
    const activeNode = React.useMemo(() => {
        return focusedNodeId ? data.nodes.find(n => n.id === focusedNodeId) : null;
    }, [focusedNodeId, data.nodes]);



    const getInstagramUrl = React.useCallback((item: any) => {
        // [PRIORITY 1] Scraped Profile URL (HIGHEST PRIORITY - from dataset)
        if (item.profileUrl && item.profileUrl.startsWith('http')) return item.profileUrl;

        // [PRIORITY 2] Direct URL fields from scraped data
        if (item.url && item.url.startsWith('http')) return item.url;
        if (item.externalUrl && item.externalUrl.startsWith('http')) return item.externalUrl;

        // [PRIORITY 3] Check nested data object for scraped URLs
        if (item.data) {
            if (item.data.profileUrl && item.data.profileUrl.startsWith('http')) return item.data.profileUrl;
            if (item.data.url && item.data.url.startsWith('http')) return item.data.url;
            if (item.data.externalUrl && item.data.externalUrl.startsWith('http')) return item.data.externalUrl;
        }

        // [PRIORITY 4] Look up Node in Graph and check for scraped URLs
        const targetName = item.name || item.label || '';
        const cleanTarget = normalizeId(targetName);
        const match = data.nodes.find(n => {
            const nId = normalizeId(n.id);
            const nLabel = normalizeId(n.label || '');
            return nId === cleanTarget || nLabel === cleanTarget;
        }) as any;

        if (match && match.data) {
            // Check node's scraped URLs FIRST
            if (match.data.profileUrl && match.data.profileUrl.startsWith('http')) return match.data.profileUrl;
            if (match.data.url && match.data.url.startsWith('http')) return match.data.url;
            if (match.data.externalUrl && match.data.externalUrl.startsWith('http')) return match.data.externalUrl;
        }

        // [PRIORITY 5 - FALLBACK] Construct from username (LAST RESORT)
        // Only use this if NO scraped URL is available
        console.warn(`[URL] No scraped URL found for ${item.name || item.label}, constructing from username`);

        if (item.username) {
            const cleanUsername = item.username.replace('@', '').trim();
            return `https://www.instagram.com/${cleanUsername}/`;
        }

        if (match && match.data && match.data.username) {
            const cleanUsername = match.data.username.replace('@', '').trim();
            return `https://www.instagram.com/${cleanUsername}/`;
        }

        if (match) {
            const cleanHandle = normalizeId(match.username || match.label || match.id);
            return `https://www.instagram.com/${cleanHandle}/`;
        }

        // [PRIORITY 6 - ABSOLUTE FALLBACK] Generate from name
        const cleanHandle = normalizeId(targetName);
        return `https://www.instagram.com/${cleanHandle}/`;
    }, [data.nodes]);

    // Hashtag Nodes
    const hashtagNodes = React.useMemo(() => {
        return data.nodes.filter(n =>
            n.group === 'hashtag' ||
            (n.group === 'topic' && !n.id.includes('_ev_')) || // [FIX] Exclude evidence
            n.label?.startsWith('#') ||
            n.id?.startsWith('ht_') ||
            (n.id?.startsWith('topic_') && !n.id.includes('_ev_')) ||
            n.group?.startsWith('hashtag')
        ).sort((a, b) => (b.val || b.value || 0) - (a.val || a.value || 0));
    }, [data.nodes]);

    // [NEW] Robust Overindexed Profiles Derivation
    const derivedOverindexedProfiles = useOverindexedProfiles(data);

    // [NEW] Intent Detection
    const isOverIndexing = React.useMemo(() => {
        const intent = (analytics as any).intent || '';
        const query = (analytics.searchQuery || '').toLowerCase();
        return intent === 'over_indexing' ||
            intent === 'overindexing' ||
            query.includes('overindex') ||
            query.includes('over-index');
    }, [analytics]);

    // [NEW] Dynamic Title for Creators Section
    const creatorsTitle = "Rising Popularity"; // Default for non-overindexing intent

    // [NEW] Fallback: Derive Creators/Brands from nodes if analytics missing
    const fallbackCreators = React.useMemo(() => {
        let creators: any[] = [];

        if (analytics.creators && analytics.creators.length > 0) {
            // [SORTING] Sort by overindexScore or affinity if available, and sanitize frequency
            creators = analytics.creators.map((c: any) => ({
                ...c,
                frequency: Math.round(c.frequency || c.rawCount || c.count || 0)
            })).sort((a: any, b: any) => {
                const scoreA = (a.overindexScore || a.affinity || a.affinityPercent || 0);
                const scoreB = (b.overindexScore || b.affinity || b.affinityPercent || 0);
                if (scoreA !== scoreB) return scoreB - scoreA;
                return (b.frequency || b.val || 0) - (a.frequency || a.val || 0);
            });
        } else if (analytics.overindexing && analytics.overindexing.topCreators && analytics.overindexing.topCreators.length > 0) {
            // Sort by overindexScore if available, and sanitize frequency
            creators = analytics.overindexing.topCreators.map((c: any) => ({
                ...c,
                frequency: Math.round(c.frequency || c.rawCount || c.val || 0)
            })).sort((a: any, b: any) => {
                // [NEW] Prioritize Affinity Percent
                const affA = parseFloat(a.affinityPercent || '0');
                const affB = parseFloat(b.affinityPercent || '0');
                if (affA !== affB) return affB - affA;

                const scoreA = a.overindexScore || 0;
                const scoreB = b.overindexScore || 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                return (b.frequency || 0) - (a.frequency || 0);
            });
        } else {
            creators = (data.nodes || [])
                .filter(n => n.group === 'creator' || n.group === 'influencer' || n.group === 'user')
                // Don't include the main target profile
                .filter(n => n.id !== 'MAIN' && n.group !== 'main')
                .map(n => ({
                    username: n.label,
                    frequency: Math.round(n.val || n.value || 0),
                    category: 'creator', // Fallback
                    percentage: 0, // Fallback
                    overindexScore: n.data?.overindexScore || 0, // [NEW] Pass score
                    platform: 'instagram', // Fallback
                    // Mock analytics structure from node data
                    // [NEW] Pass through rich AI data
                    citation: n.data.citation,
                    searchQuery: n.data.searchQuery,
                    sourceUrl: n.data.sourceUrl,
                    evidence: n.data.evidence,
                    provenance: n.data.provenance,
                    ...n.data
                }));
        }

        // [NEW] Supplement with Related Profiles from Raw Data (Explicit Fallback)
        // If we have access to the raw scraped records, extracting 'relatedProfiles' is a high-quality signal
        if ((data as any).data && Array.isArray((data as any).data)) {
            const rawData = (data as any).data;
            const seenInRaw = new Set<string>();

            rawData.forEach((record: any) => {
                if (record.relatedProfiles && Array.isArray(record.relatedProfiles)) {
                    record.relatedProfiles.forEach((rp: any) => {
                        const rawId = rp.id || rp.username;
                        if (!rawId) return;

                        const id = normalizeId(rawId);
                        // Prevent duplicates within this loop and check if already in main list (optimization)
                        if (!seenInRaw.has(id)) {
                            // Check if this profile is already in our 'creators' list to avoid redundant processing
                            const exists = creators.some(c =>
                                (c.id && normalizeId(c.id) === id) ||
                                (c.username && normalizeId(c.username) === normalizeId(rp.username))
                            );

                            if (!exists) {
                                creators.push({
                                    id: rp.id,
                                    username: rp.username || rp.full_name,
                                    full_name: rp.full_name,
                                    firstName: rp.full_name ? rp.full_name.split(' ')[0] : '',
                                    frequency: 1, // Default weight (already integer)
                                    category: 'related_profile',
                                    percentage: 0,
                                    overindexScore: 0,
                                    platform: 'instagram',
                                    profilePicUrl: rp.profile_pic_url,
                                    isVerified: rp.is_verified,
                                    provenance: {
                                        source: 'Raw Dataset',
                                        method: 'Related Profile',
                                        evidence: [{
                                            type: 'dataset',
                                            text: `Appears in related profiles of ${record.username || record.ownerUsername}`,
                                            url: `https://www.instagram.com/${(rp.username || '').replace('@', '')}/`
                                        }],
                                        confidence: 0.8
                                    }
                                });
                                seenInRaw.add(id);
                            }
                        }
                    });
                }
            });
        }

        // [DEDUPLICATION] Ensure unique creators by username/id (Final Safety Check)
        return creators.filter((c, index, self) =>
            index === self.findIndex((t) => (
                (t.id && c.id && normalizeId(t.id) === normalizeId(c.id)) ||
                (t.username && c.username && normalizeId(t.username) === normalizeId(c.username)) ||
                (t.label && c.label && normalizeId(t.label) === normalizeId(c.label))
            ))
        ).map(creator => {
            if (creator.provenance && creator.provenance.evidence && creator.provenance.evidence.length > 0) {
                return creator;
            }

            // Derive evidence from Graph Topology
            const creatorId = normalizeId(creator.id || creator.username || creator.label || '');
            const node = data.nodes.find(n => normalizeId(n.id) === creatorId || (n.label && normalizeId(n.label) === creatorId));

            if (!node) return creator;

            // Find incoming links (Audience members who follow this creator)
            const incomingLinks = data.links.filter(l => {
                const targetId = normalizeId(typeof l.target === 'object' ? (l.target as any).id : l.target);
                return targetId === normalizeId(node.id);
            });

            // Map links to source profiles
            const evidence = incomingLinks.map(l => {
                const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                const sourceNode = data.nodes.find(n => normalizeId(n.id) === normalizeId(sourceId));
                if (!sourceNode) return null;

                const handle = sourceNode.label || 'Unknown';
                const cleanHandle = handle.replace('@', '').trim();

                return {
                    type: 'social_graph',
                    text: `Followed by ${handle}`, // Data source specific reference
                    author: handle,
                    url: cleanHandle !== 'Unknown' ? `https://www.instagram.com/${cleanHandle}/` : '#',
                    sourceId: sourceNode.id
                };
            }).filter(e => e !== null);

            return {
                ...creator,
                provenance: {
                    source: 'Graph Topology',
                    method: 'Link Analysis',
                    evidence: evidence, // [CRITICAL] This populates the "Data Provenance" list
                    confidence: 1.0
                }
            };
        }).sort((a, b) => (b.overindexScore || 0) - (a.overindexScore || 0));
    }, [analytics.creators, analytics.overindexing, stableNodes, stableLinks]);


    const fallbackBrands = React.useMemo(() => {
        const brands: any[] = [];
        const seenIds = new Set<string>();

        // 1. Analytics Brands (AI detected)
        if (analytics.brands && analytics.brands.length > 0) {
            analytics.brands.forEach((b: any) => {
                const id = normalizeId(b.id);
                const username = normalizeId(b.username || b.name || b.label);

                // [FIX] Check both ID and Username for duplicates
                if ((id && seenIds.has(id)) || (username && seenIds.has(username))) {
                    return;
                }

                brands.push(b);
                if (id) seenIds.add(id);
                if (username) seenIds.add(username);
            });
        }

        // 2. Overindexed Brands (Graph detected)
        if (analytics.overindexing && analytics.overindexing.topBrands) {
            analytics.overindexing.topBrands.forEach((b: any) => {
                const id = normalizeId(b.id);
                const username = normalizeId(b.username || b.name || b.label);

                if ((id && seenIds.has(id)) || (username && seenIds.has(username))) {
                    return;
                }

                brands.push(b);
                if (id) seenIds.add(id);
                if (username) seenIds.add(username);
            });
        }

        // 3. Fallback to Graph Nodes (Raw)
        stableNodes
            .filter(n => n.group === 'brand' || n.group === 'company')
            .forEach(n => {
                const id = normalizeId(n.id);
                const label = normalizeId(n.label);

                // [FIX] Strict Deduplication against AI results
                if ((id && seenIds.has(id)) || (label && seenIds.has(label))) {
                    return; // Skip if either ID or Label has been seen
                }

                brands.push({
                    id: n.id,
                    username: n.label,
                    name: n.label, // Ensure name is set for consistency
                    frequency: n.val || n.value || 0,
                    category: 'brand',
                    percentage: 0,
                    overindexScore: n.data?.overindexScore || 0,
                    // [NEW] Pass through rich AI data
                    citation: n.data?.citation,
                    searchQuery: n.data?.searchQuery,
                    sourceUrl: n.data?.sourceUrl,
                    evidence: n.data?.evidence,
                    provenance: n.data?.provenance || { source: 'Graph', method: 'Raw Node' },
                    ...n.data
                });

                if (id) seenIds.add(id);
                if (label) seenIds.add(label);
            });

        const sortedBrands = brands.sort((a, b) => {
            const scoreA = (a.overindexScore || a.affinity || a.affinityPercent || 0);
            const scoreB = (b.overindexScore || b.affinity || b.affinityPercent || 0);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return (b.frequency || b.val || 0) - (a.frequency || a.val || 0);
        });

        // [FIX] Final Deduplication Pass on Sorted List
        // This ensures distinct visual entries even if source IDs mismatched
        const finalSeen = new Set<string>();
        return sortedBrands.filter(b => {
            const displayKey = normalizeId(b.username || b.name || b.label || b.id);
            if (displayKey && finalSeen.has(displayKey)) {
                return false;
            }
            if (displayKey) finalSeen.add(displayKey);
            return true;
        });
    }, [stableNodes, analytics.brands, analytics.overindexing]);

    // [NEW] Robust Cluster Derivation (Always derive from graph as source of truth)
    const derivedClusters = React.useMemo(() => {
        const clusterNodes = stableNodes.filter(n => n.group === 'cluster');

        return clusterNodes.map(node => {
            // NEW: Graph-based clustering evidence
            const nodeId = normalizeId(node.id);
            const stableNodes = data.nodes;
            const stableLinks = data.links;

            const memberLinks = stableLinks.filter(l => {
                const targetId = normalizeId(typeof l.target === 'object' ? (l.target as any).id : l.target);
                const sourceId = normalizeId(typeof l.source === 'object' ? (l.source as any).id : l.source);
                return targetId === nodeId || sourceId === nodeId;
            });

            const memberNodes = memberLinks.map(l => {
                const targetId = normalizeId(typeof l.target === 'object' ? (l.target as any).id : l.target);
                const sourceId = normalizeId(typeof l.source === 'object' ? (l.source as any).id : l.source);
                const otherId = targetId === nodeId ? sourceId : targetId;
                return data.nodes.find(n => normalizeId(n.id) === otherId);
            }).filter(n => n && profileGroups.includes(n.group) && n.group !== 'main');

            // Unique members list
            const uniqueMembers = Array.from(new Set(memberNodes.map(m => m!.id)))
                .map(id => memberNodes.find(m => m!.id === id)!);

            // Construct provenance evidence
            const evidence = uniqueMembers.map(s => {
                const handle = s?.label || 'Unknown';
                const cleanHandle = handle.replace('@', '').trim();
                return {
                    type: 'profile',
                    text: `Cluster member: ${handle}`,
                    author: handle,
                    url: cleanHandle !== 'Unknown' ? `https://www.instagram.com/${cleanHandle}/` : '#'
                };
            });

            return {
                name: node.label,
                // [FIX] Prioritize actual graph membership count over static AI 'val'
                count: uniqueMembers.length || node.val || node.value || 0,
                keywords: node.data?.keywords || [],
                provenance: {
                    source: 'Graph Topology',
                    method: 'Clustering',
                    evidence: evidence,
                    confidence: 1.0
                },
                id: node.id
            };
        }).sort((a, b) => b.count - a.count);
    }, [data.nodes, data.links]);

    // [NEW] Robust Topics Derivation with Provenance & Deduplication
    const derivedTopics = React.useMemo(() => {
        const topics: any[] = [];
        const seenIds = new Set<string>();

        // 1. AI Topics
        if (analytics.topics && analytics.topics.length > 0) {
            analytics.topics.forEach((t: any) => {
                const id = normalizeId(t.id || t.name || t.label);
                if (!seenIds.has(id)) {
                    topics.push(t);
                    seenIds.add(id);
                }
            });
        }

        // 2. Graph Topics (Fallback/Supplement)
        (data.nodes || [])
            .filter(n => n.group === 'topic' || n.group === 'concept')
            .forEach(n => {
                const id = normalizeId(n.id || n.label);
                // Deduplicate
                if (!seenIds.has(id)) {
                    topics.push({
                        id: n.id,
                        name: n.label,
                        label: n.label,
                        val: n.val || n.value || 0,
                        description: n.data?.description,
                        ...n.data
                    });
                    seenIds.add(id);
                }
            });

        // Enrich with Provenance from Graph
        return topics.map(topic => {
            if (topic.provenance && topic.provenance.evidence && topic.provenance.evidence.length > 0) {
                return topic;
            }

            // Match to graph node
            const topicId = normalizeId(topic.id || topic.name || topic.label || '');
            const node = stableNodes.find(n => normalizeId(n.id) === topicId || (n.label && normalizeId(n.label) === topicId));

            if (!node) return topic;

            // Find incoming links (People talking about this topic)
            const incomingLinks = stableLinks.filter(l => {
                const targetId = normalizeId(typeof l.target === 'object' ? (l.target as any).id : l.target);
                return targetId === normalizeId(node.id);
            });
            const incomingCount = incomingLinks.length;

            const evidence = incomingLinks.map(l => {
                const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                const sourceNode = stableNodes.find(n => normalizeId(n.id) === normalizeId(sourceId));
                if (!sourceNode) return null;
                if (sourceNode.group === 'main' || sourceNode.group === 'cluster') return null; // Filter out structural nodes

                const handle = sourceNode.label || 'Unknown';
                const cleanHandle = handle.replace('@', '').trim();

                return {
                    type: 'social_graph',
                    text: `Discussed by ${handle}`,
                    author: handle,
                    url: cleanHandle !== 'Unknown' ? `https://www.instagram.com/${cleanHandle}/` : '#',
                    sourceId: sourceNode.id
                };
            }).filter(e => e !== null);

            return {
                ...topic,
                provenance: {
                    source: 'Graph Topology',
                    method: 'Topic Co-occurrence',
                    evidence: evidence,
                    confidence: 1.0
                }
            };
        }).sort((a, b) => (b.val || b.value || 0) - (a.val || a.value || 0));

    }, [data.nodes, data.links, analytics.topics, stableNodes, stableLinks]);

    // [NEW] Robust Overindexed Profiles Derivation





    // [NEW] Robust Top Content Derivation (Mining by Engagement)
    const derivedTopContent = React.useMemo(() => {
        let content: any[] = [];

        // 1. Source from Analytics
        if (analytics.topContent && analytics.topContent.length > 0) {
            content = [...analytics.topContent];
        }
        // 2. Source from Nodes (if they represent posts)
        else {
            content = (data.nodes || [])
                .filter(n => (n as any).group === 'content' || (n as any).group === 'post' || (n.data && (n.data.postUrl || n.data.mediaUrl)))
                .map(n => ({
                    id: n.id,
                    displayUrl: n.data.displayUrl || n.data.imageUrl || n.data.thumbnailUrl,
                    videoUrl: n.data.videoUrl,
                    type: n.data.type || 'Image',
                    author: n.data.author || n.label,
                    // Metrics
                    likesCount: n.data.likesCount || n.data.likeCount || 0,
                    commentsCount: n.data.commentsCount || n.data.commentCount || 0,
                    videoViewCount: n.data.videoViewCount || n.data.viewCount || 0,
                    ...n.data
                }));
        }

        // [MINING] Sort by Engagement Score
        // Score = (Likes * 1) + (Comments * 2) + (Views * 0.1)
        return content.sort((a, b) => {
            const likesA = (a.likesCount || a.likeCount || 0);
            const commentsA = (a.commentsCount || a.commentCount || 0);
            const viewsA = (a.videoViewCount || a.viewCount || a.playCount || 0);
            const scoreA = likesA + (commentsA * 2) + (viewsA * 0.1);

            const likesB = (b.likesCount || b.likeCount || 0);
            const commentsB = (b.commentsCount || b.commentCount || 0);
            const viewsB = (b.videoViewCount || b.viewCount || b.playCount || 0);
            const scoreB = likesB + (commentsB * 2) + (viewsB * 0.1);

            return scoreB - scoreA;
        });
    }, [data.nodes, analytics.topContent]);

    // Resolve Profile Details to show
    // If a node is selected and it's a profile, use its data. Otherwise use default main profile.
    // [NEW] Robust Overindexed Profiles Derivation

    // [MOVED BACK] Robust item selection across all lists
    const selectedItem = React.useMemo(() => {
        if (!focusedNodeId) return null;

        // 1. Graph Nodes
        const node = data.nodes.find(n => n.id === focusedNodeId);
        if (node) return { ...node, group: node.group, label: node.label, data: node.data };

        // 2. Analytic Lists
        const creator = fallbackCreators.find(c => c.id === focusedNodeId || c.username === focusedNodeId);
        if (creator) return { ...creator, group: creator.category || 'creator', label: creator.username || creator.name, data: creator };

        const brand = fallbackBrands.find(b => b.id === focusedNodeId || b.username === focusedNodeId);
        if (brand) return { ...brand, group: brand.category || 'brand', label: brand.username || brand.name, data: brand };

        const cluster = derivedClusters.find(c => c.id === focusedNodeId || c.name === focusedNodeId);
        if (cluster) return { ...cluster, group: 'cluster', label: cluster.name, data: cluster };

        const topic = (analytics.topics || []).find((t: any) => t.id === focusedNodeId || t.name === focusedNodeId || t.label === focusedNodeId);
        if (topic) return { ...topic, group: 'topic', label: topic.label || topic.name, data: topic };

        const subtopic = (analytics.subtopics || []).find((s: any) => s.id === focusedNodeId || s.name === focusedNodeId || s.label === focusedNodeId);
        if (subtopic) return { ...subtopic, group: 'subtopic', label: subtopic.label || subtopic.name, data: subtopic };

        const hashtagNode = hashtagNodes.find(h => h.id === focusedNodeId);
        if (hashtagNode) return { ...hashtagNode, group: 'hashtag', label: hashtagNode.label, data: hashtagNode.data };

        const post = derivedTopContent.find((p: any) => p.id === focusedNodeId || p.url === focusedNodeId);
        if (post) return { ...post, group: 'content', label: post.author || 'Post', data: post };

        return null;
    }, [focusedNodeId, data.nodes, fallbackCreators, fallbackBrands, derivedClusters, analytics, hashtagNodes]);

    const isTopic = React.useMemo(() => {
        if (!selectedItem) return false;
        const group = (selectedItem as any).group || '';
        const result = !profileGroups.includes(group);
        return result;
    }, [selectedItem, profileGroups]);

    // [OPTIMIZED] Create Node Map for O(1) lookup
    const nodeMap = React.useMemo(() => {
        const map = new Map();
        data.nodes.forEach(n => map.set(normalizeId(n.id), n));
        return map;
    }, [data.nodes]);

    // Find mentions if topic (Optimized)
    const mentions = React.useMemo(() => {
        if (!isTopic || !selectedItem) return [];

        const itemId = normalizeId((selectedItem as any).id || (selectedItem as any).username || (selectedItem as any).name || '');
        if (!itemId) return [];

        const uniqueMemberIds = new Set<string>();
        const members: any[] = [];

        // [FIX] Define groups that should be counted as "members" or visible sub-nodes
        // This includes profiles AND structural nodes (sub-clusters) but excludes evidence/junk
        const countableGroups = new Set([...profileGroups, 'topic', 'subtopic', 'cluster', 'emerging_subculture']);

        // Single pass through links O(L)
        data.links.forEach(l => {
            const targetId = normalizeId(typeof l.target === 'object' ? (l.target as any).id : l.target);
            const sourceId = normalizeId(typeof l.source === 'object' ? (l.source as any).id : l.source);

            if (targetId === itemId || sourceId === itemId) {
                const otherId = targetId === itemId ? sourceId : targetId;
                // Filter out root and duplicates immediately
                if (otherId !== 'main' && otherId !== 'core' && otherId !== 'main' && !uniqueMemberIds.has(otherId)) {
                    const node = nodeMap.get(otherId);
                    // Use countableGroups instead of just profileGroups
                    if (node && countableGroups.has(node.group) && node.group !== 'main') {
                        uniqueMemberIds.add(otherId);
                        members.push(node);
                    }
                }
            }
        });

        return members;
    }, [isTopic, selectedItem, data.links, nodeMap, profileGroups]);

    // [NEW] Active Provenance Logic
    const activeProvenance = React.useMemo(() => {
        // If no item selected, return Global Dataset Provenance
        if (!selectedItem) {
            return {
                provenance: {
                    source: 'Dataset',
                    method: 'Global Analysis',
                    confidence: 1.0,
                    evidence: [],
                    citation: 'Aggregation of all available data points.'
                },
                label: 'Global Dataset'
            };
        }

        // If item has explicit provenance, use it
        const baseProv = (selectedItem as any).provenance || (selectedItem as any).data?.provenance || {};

        // Enrich with evidence found via getEvidence()
        // Note: We need to be careful calling getEvidence inside useMemo if getEvidence is not pure or depends on props.
        // getEvidence depends on 'data' prop which is in dependency array.
        const evidence = getEvidence(selectedItem);

        // Enhance provenance with graph evidence if Topic
        if (isTopic && mentions.length > 0) {
            const richEvidence = mentions.map(m => {
                const bio = m.data?.biography || m.data?.bio || '';
                const topPost = m.data?.latestPosts?.[0]?.caption || '';
                const snippet = bio ? `Bio: ${bio.slice(0, 100)}...` : (topPost ? `Post: ${topPost.slice(0, 100)}...` : 'Connected to topic');

                return {
                    type: 'member_context',
                    text: snippet,
                    author: m.label,
                    url: `https://instagram.com/${(m.label || '').replace('@', '')}`,
                    date: 'Recent'
                };
            });

            return {
                ...selectedItem,
                provenance: {
                    ...baseProv,
                    method: baseProv.method || 'Topic Aggregation',
                    source: baseProv.source || 'Graph Clusters',
                    evidence: [...(baseProv.evidence || []), ...evidence, ...richEvidence]
                }
            };
        }

        return {
            ...selectedItem,
            provenance: {
                ...baseProv,
                evidence: [...(baseProv.evidence || []), ...evidence]
            }
        };

    }, [selectedItem, isTopic, mentions, data]);


    // [FIX] Memoize displayProfile to prevent object churn and infinite render loops
    const displayProfile = React.useMemo(() => {
        if (isTopic || !selectedItem) return data.profileDetails;

        const baseData = (selectedItem as any).data || {};
        const topLevel = selectedItem as any;

        return {
            ...baseData,
            ...topLevel,
            username: topLevel.username || topLevel.handle || baseData.username || topLevel.label?.replace('@', '') || '',
            profilePicUrlHD: topLevel.profilePicUrlHD || topLevel.profilePicUrl || topLevel.profile_pic_url || baseData.profilePicUrl || topLevel.profilePic || '',
            fullName: topLevel.fullName || topLevel.name || topLevel.label || '',
            biography: topLevel.biography || topLevel.bio || baseData.biography || baseData.bio || '',
            followerCount: topLevel.followerCount || topLevel.followersCount || topLevel.followers || baseData.followerCount || baseData.followersCount || baseData.followers || 0,
            followingCount: topLevel.followingCount || topLevel.followsCount || topLevel.following || baseData.followingCount || baseData.following || baseData.followsCount || 0,
            postCount: topLevel.postCount || topLevel.mediaCount || topLevel.postsCount || topLevel.posts || baseData.postCount || baseData.mediaCount || baseData.postsCount || 0,
            isVerified: topLevel.isVerified || topLevel.verified || baseData.isVerified || false,
            externalUrl: topLevel.externalUrl || topLevel.external_url || baseData.externalUrl || ''
        };
    }, [selectedItem, isTopic, data.profileDetails]);

    const displayFullName = (!isTopic && selectedItem) ? (selectedItem as any).label : (data.profileFullName || "User");

    // [FIX] Disabled high-frequency logging
    /*
    React.useEffect(() => {
        if (selectedItem && !isTopic) {
            console.log('[AnalyticsPanel] Selected profile node:', selectedItem);
            console.log('[AnalyticsPanel] Mapped displayProfile:', displayProfile);
        }
    }, [selectedItem, isTopic, displayProfile]);
    */

    // NOW we can do conditional returns after all hooks are called
    // REFACTOR: Instead of conditional return, we render consistent structure with CSS transitions

    return (
        <>
            {/* Open Button - Only visible when closed */}
            <div className={`absolute top-4 right-4 z-10 pointer-events-auto transition-opacity duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <button
                    onClick={() => onToggle(true)}
                    className="p-2 bg-[#1a4d2e] border border-emerald-500/30 rounded-lg text-emerald-300 hover:text-white hover:border-emerald-500/50 shadow-lg transition-all cursor-pointer"
                >
                    <PanelRightOpen className="w-5 h-5" />
                </button>
            </div>

            {/* Panel Content Wrapper */}
            <div className={`absolute top-0 right-0 bottom-0 w-80 bg-[#051810]/80 backdrop-blur-2xl border-l border-white/5 shadow-2xl z-10 flex flex-col pointer-events-auto transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                <div className="flex items-center justify-between p-4 border-b border-emerald-500/20 bg-[#1a4d2e]/50">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xs font-light text-white tracking-wide flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            {isTopic ? 'Topic Analysis' : 'Profile Analytics'}
                        </h2>
                        {!isTopic && (
                            <button
                                onClick={() => handleShowReasoning(selectedItem || activeNode || { data: data.profileDetails, label: data.profileFullName, group: 'main' }, 'Main Profile Analysis')}
                                className="text-emerald-500/50 hover:text-emerald-300 transition-colors flex items-center gap-1 text-[10px]"
                                title="View Data Provenance (How this was researched)"
                            >
                                <HelpCircle size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            try {
                                console.log('[AnalyticsPanel] Hiding panel');
                                onToggle(false);
                            } catch (error) {
                                console.error('[AnalyticsPanel] Error hiding panel:', error);
                            }
                        }}
                        className="text-emerald-400 hover:text-white transition-colors"
                    >
                        <PanelRightClose className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-600 scrollbar-track-transparent bg-[#051810]"
                >


                    {/* VISUALIZATION: TOPIC vs PROFILE */}

                    {isTopic && selectedItem ? (
                        <div className="p-4 border-b border-emerald-500/20 bg-[#1a4d2e]/20">
                            {/* TOPIC HEADER */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider
                                        ${((selectedItem as any).group === 'topic' || (selectedItem as any).group.startsWith('topic_')) ? 'bg-purple-500/20 text-purple-300' :
                                                ((selectedItem as any).group === 'subtopic' || (selectedItem as any).group.startsWith('subtopic_')) ? 'bg-blue-500/20 text-blue-300' :
                                                    (selectedItem as any).group === 'concept' ? 'bg-pink-500/20 text-pink-300' :
                                                        (selectedItem as any).group === 'overindexed' ? 'bg-orange-500/20 text-orange-300' :
                                                            'bg-emerald-500/20 text-emerald-300'}
                                    `}>
                                            {(selectedItem as any).group}
                                        </span>
                                    </div>

                                    {/* [FIX] Show Data Provenance for Clusters OR if provenance exists */}
                                    {((selectedItem as any).group === 'cluster' || (selectedItem as any).provenance || (selectedItem as any).data?.provenance) && (
                                        <button
                                            onClick={() => {
                                                // [FIX] Dynamically generate provenance from members if not present
                                                const baseProv = (selectedItem as any).provenance || (selectedItem as any).data?.provenance || {};
                                                const richEvidence = mentions.map(m => {
                                                    const bio = m.data?.biography || m.data?.bio || '';
                                                    const topPost = m.data?.latestPosts?.[0]?.caption || '';
                                                    const snippet = bio ? `Bio: ${bio.slice(0, 100)}...` : (topPost ? `Post: ${topPost.slice(0, 100)}...` : 'Connected to topic');

                                                    return {
                                                        type: 'member_context',
                                                        text: snippet,
                                                        author: m.label,
                                                        url: `https://instagram.com/${(m.label || '').replace('@', '')}`,
                                                        date: 'Recent'
                                                    };
                                                });

                                                const richItem = {
                                                    ...(selectedItem as any),
                                                    provenance: {
                                                        source: 'Graph Clusters',
                                                        method: 'Topic Aggregation',
                                                        evidence: [...(baseProv.evidence || []), ...richEvidence],
                                                        confidence: 1.0
                                                    }
                                                };
                                                handleShowReasoning(richItem, 'Topic Composition');
                                            }}
                                            className="text-emerald-500/50 hover:text-emerald-300 transition-colors flex items-center gap-1 text-[10px]"
                                            title="View Contributing Data (Bios, Posts)"
                                        >
                                            <HelpCircle size={12} />
                                            <span className="uppercase tracking-wider font-bold">Data Provenance</span>
                                        </button>
                                    )}
                                </div>
                                <h3 className="text-xs font-light text-white leading-tight break-words">
                                    {(selectedItem as any).label}
                                </h3>
                            </div>

                            {/* [FIX] STATS & MEMBERS - Only for Clusters */}
                            {(selectedItem as any).group === 'cluster' && (
                                <>
                                    <div className="mb-4">
                                        <div className="bg-[#051810]/50 rounded p-3 text-center border border-emerald-500/10">
                                            <div className="text-[10px] text-emerald-500/70 uppercase tracking-widest mb-1">Occurrences</div>
                                            <div className="text-xl font-bold text-white">
                                                {mentions.length > 0 ? mentions.length : ((selectedItem as any).frequency || (selectedItem as any).count || (selectedItem as any).val || 0)}
                                            </div>
                                            <div className="text-[8px] text-emerald-500/40 uppercase tracking-widest mt-1">Number of sub-nodes</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest">Members</div>
                                        {mentions.length > 0 ? (
                                            <div className="space-y-1">
                                                {mentions.slice(0, 10).map((m: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="flex items-center gap-2 p-2 rounded bg-white/5 hover:bg-white/10 cursor-pointer transition-colors border border-transparent hover:border-emerald-500/30"
                                                        onClick={() => onSelect(m.id)}
                                                    >
                                                        <div className="w-6 h-6 rounded-full bg-emerald-800 flex items-center justify-center text-[10px] font-bold text-emerald-200">
                                                            {(m.label || '').substring(0, 1).toUpperCase()}
                                                        </div>
                                                        <span className="text-xs text-gray-200 truncate flex-1">{m.label}</span>
                                                        <ExternalLink className="w-3 h-3 text-emerald-500/50" />
                                                    </div>
                                                ))}
                                                {mentions.length > 10 && (
                                                    <div className="text-[10px] text-center text-emerald-500/50 pt-1">
                                                        + {mentions.length - 10} more
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-500 italic">No members found.</div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        /* PROFILE HEADER (Standard) */
                        displayProfile && (
                            <div className="p-4 border-b border-emerald-500/20 bg-[#1a4d2e]/20">
                                <div className="flex items-start gap-4 mb-3">
                                    {displayProfile.profilePicUrlHD && (
                                        <div className="relative">
                                            <ProxiedImage
                                                src={displayProfile.profilePicUrlHD || displayProfile.profilePicUrl}
                                                alt="Profile"
                                                className="w-16 h-16 rounded-full border-2 border-emerald-400 shadow-lg object-cover"
                                            />
                                            {displayProfile.isVerified && (
                                                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5 border-2 border-[#051810]">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0 max-w-[calc(100%-10px)]">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-bold text-white mb-1 truncate pr-2" title={displayFullName}>
                                                {displayFullName}
                                            </h3>
                                            {(selectedItem && ((selectedItem as any).provenance || (selectedItem as any).data?.provenance)) && (
                                                <button
                                                    onClick={() => handleShowReasoning(selectedItem, 'Profile Analysis')}
                                                    className="text-emerald-500/50 hover:text-emerald-300 transition-colors flex items-center gap-1 text-[10px]"
                                                    title="Show Source Evidence"
                                                >
                                                    <HelpCircle size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-300 leading-snug line-clamp-3 mb-2 font-light break-words pr-2">
                                            {displayProfile.biography || "No biography available."}
                                        </p>

                                        <a
                                            href={getInstagramUrl(selectedItem || activeNode || {})}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors mt-1 min-w-0 max-w-full"
                                            title={getInstagramUrl(selectedItem || activeNode || {})}
                                        >
                                            <Instagram size={12} className="shrink-0" />
                                            <span className="font-mono truncate block max-w-full">
                                                {(() => {
                                                    const fullUrl = getInstagramUrl(selectedItem || activeNode || {});
                                                    try {
                                                        // Extract display text from actual URL
                                                        const url = new URL(fullUrl);
                                                        return url.hostname + url.pathname;
                                                    } catch {
                                                        // Fallback if URL parsing fails
                                                        return fullUrl.replace('https://', '').replace('http://', '');
                                                    }
                                                })()}
                                            </span>
                                        </a>

                                        {displayProfile.externalUrl && (
                                            <a
                                                href={displayProfile.externalUrl.startsWith('http') ? displayProfile.externalUrl : `https://${displayProfile.externalUrl}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1.5 text-[10px] text-sky-400 hover:text-sky-300 hover:underline transition-colors mt-0.5 max-w-full"
                                            >
                                                <ExternalLink size={12} />
                                                <span className="font-mono truncate max-w-[150px]">
                                                    {new URL(displayProfile.externalUrl.startsWith('http') ? displayProfile.externalUrl : `https://${displayProfile.externalUrl}`).hostname}
                                                </span>
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* [FIX] 21+ Restricted Badge for zero-count profiles */}
                                {displayProfile.followerCount === 0 && displayProfile.followingCount === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-6 bg-red-900/20 rounded-lg border-2 border-red-500/30">
                                        <div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mb-3 shadow-lg shadow-red-500/50">
                                            <span className="text-3xl font-bold text-red-400">21+</span>
                                        </div>
                                        <p className="text-xs text-red-300/80 text-center leading-relaxed max-w-[200px]">
                                            This profile may be age-restricted or private. Instagram policy prevents data access.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="mb-4">
                                        <EnrichedStats node={{ data: displayProfile }} />
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {/* [NEW] Recent Media Gallery - For ANY active node with content */}
                    {selectedItem && (
                        <AccordionItem
                            title="Recent Media"
                            icon={ShoppingBag} // Layout grid icon would be better but reusing existing import
                            colorClass="text-sky-400"
                            isOpen={expandedSection === 'media'}
                            onToggle={() => toggleSection('media')}
                        >
                            <MediaGallery items={getEvidence(selectedItem)} />
                        </AccordionItem>
                    )}



                    {/* 1. Clusters (Robust) */}
                    {derivedClusters.length > 0 && (
                        <AccordionItem
                            title={`Fandom Clusters (${derivedClusters.length})`}
                            icon={Hash}
                            colorClass="text-emerald-400"
                            isOpen={expandedSection === 'clusters'}
                            onToggle={() => toggleSection('clusters')}
                        >
                            <div className="space-y-3">
                                {derivedClusters.map((cluster, idx) => (
                                    <div
                                        key={idx}
                                        style={{ animationDelay: `${idx * 50}ms` }}
                                        onClick={() => onSelect(cluster.id || cluster.name)}
                                        className="group p-3 rounded-lg bg-[#1a4d2e]/20 border border-white/5 hover:border-emerald-500/50 hover:bg-[#1a4d2e]/40 transition-all cursor-pointer animate-fade-in-up"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-medium text-gray-200 group-hover:text-emerald-300 transition-colors">{cluster.name || 'Unnamed Cluster'}</span>
                                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded">
                                                {cluster.count >= 1000 ? `${Math.floor(cluster.count / 1000)}k` : cluster.count}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                            {(cluster.keywords || []).slice(0, 3).map((kw: string, k: number) => (
                                                <span key={k} className="text-[9px] px-1.5 py-0.5 bg-emerald-900/30 text-emerald-300 rounded border border-emerald-700/30">
                                                    {kw}
                                                </span>
                                            ))}
                                            {/* Reasoning Icon - Always Show */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleShowReasoning(cluster, 'Clustering');
                                                }}
                                                className="ml-auto text-emerald-500/30 hover:text-emerald-400 transition-colors"
                                                title="View Cluster Members (Provenance)"
                                            >
                                                <HelpCircle size={10} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AccordionItem>
                    )}




                    {/* Hashtags (New) */}
                    {hashtagNodes.length > 0 && (
                        <AccordionItem
                            title="Trending Hashtags"
                            icon={Hash}
                            colorClass="text-emerald-400"
                            isOpen={expandedSection === 'hashtags'}
                            onToggle={() => toggleSection('hashtags')}
                        >
                            <div className="space-y-2">
                                {hashtagNodes.slice(0, 10).map((hashtag, idx) => (
                                    <div
                                        key={idx}
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                        onClick={() => onSelect(hashtag.id)}
                                        className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group animate-fade-in-up"
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="text-emerald-400 font-bold">#</span>
                                            <span className="text-xs text-gray-300 group-hover:text-emerald-300 transition-colors truncate">
                                                {hashtag.label.replace(/^#/, '')}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                            {hashtag.val || hashtag.value || 0}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </AccordionItem>
                    )}


                    {/* [NEW] 1.5 Topics Analysis */}
                    {derivedTopics.length > 0 && (
                        <AccordionItem
                            title="Trending Topics"
                            icon={Hash}
                            colorClass="text-purple-400"
                            isOpen={expandedSection === 'topics'}
                            onToggle={() => toggleSection('topics')}
                        >
                            <div className="space-y-2">
                                {derivedTopics.slice(0, 20).map((topic: any, idx: number) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleShowReasoning(topic, 'Topic Analysis')}
                                        className="p-2 rounded hover:bg-white/5 cursor-pointer group flex items-start justify-between"
                                    >
                                        <div className="flex-1 min-w-0 mr-2">
                                            <div className="text-sm font-medium text-gray-200 group-hover:text-purple-300 transition-colors truncate">
                                                {topic.label || topic.name}
                                            </div>
                                            {(topic.keywords || topic.description) && (
                                                <div className="text-[10px] text-gray-500 line-clamp-1">
                                                    {topic.description || (typeof topic.keywords === 'string' ? topic.keywords : (topic.keywords || []).join(', '))}
                                                </div>
                                            )}
                                            {/* Provenance Indicator */}
                                            {topic.provenance && (
                                                <div className="text-[9px] text-purple-400/50 mt-0.5 flex items-center gap-1">
                                                    <span className="w-1 h-1 rounded-full bg-purple-500"></span>
                                                    Verified in Graph
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleShowReasoning(topic, 'Topic Analysis');
                                            }}
                                            className="ml-auto text-purple-500/30 hover:text-purple-400 transition-colors flex-shrink-0"
                                            title="View Topic Contributors (Provenance)"
                                        >
                                            <HelpCircle size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </AccordionItem>
                    )}

                    {/* [NEW] 1.6 Subtopics / Subcultures */}
                    {analytics.subtopics && analytics.subtopics.length > 0 && (
                        <AccordionItem
                            title="Emerging Subcultures"
                            icon={Network}
                            colorClass="text-indigo-400"
                            isOpen={expandedSection === 'subtopics'}
                            onToggle={() => toggleSection('subtopics')}
                        >
                            <div className="space-y-2">
                                {analytics.subtopics.slice(0, 20).map((sub: any, idx: number) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleShowReasoning(sub, 'Subculture Analysis')}
                                        className="p-2 rounded hover:bg-white/5 cursor-pointer group flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                            <span className="text-sm text-gray-300 group-hover:text-indigo-300">{sub.label || sub.name}</span>
                                        </div>
                                        {sub.provenance && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleShowReasoning(sub, 'Subculture Analysis');
                                                }}
                                                className="text-indigo-500/50 hover:text-indigo-300"
                                            >
                                                <HelpCircle size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </AccordionItem>
                    )}

                    {/* [NEW] 1.7 Top Content / Posts */}
                    {derivedTopContent.length > 0 && (
                        <AccordionItem
                            title="Top Content"
                            icon={Image}
                            colorClass="text-sky-400"
                            isOpen={expandedSection === 'content'}
                            onToggle={() => toggleSection('content')}
                        >
                            <div className="grid grid-cols-2 gap-2">
                                {derivedTopContent.slice(0, 10).map((post: any, idx: number) => {
                                    // [FIX] Normalize media fields for MediaPreview
                                    const normalizedPost = {
                                        ...post,
                                        displayUrl: post.displayUrl || post.imageUrl || post.thumbnailUrl || post.display_url,
                                        videoUrl: post.videoUrl || post.webVideoUrl || post.video_url,
                                        type: (post.type === 'Video' || post.isVideo || post.webVideoUrl || post.videoUrl) ? 'Video' : 'Image'
                                    };

                                    // Calculate score for display
                                    const likes = (post.likesCount || post.likeCount || 0);

                                    // Use Proxied Media Logic
                                    const proxyUrl = (url: string) => {
                                        if (!url) return '';
                                        if (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) {
                                            return `/api/proxy-image?url=${encodeURIComponent(url)}`;
                                        }
                                        return url;
                                    };

                                    return (
                                        <a
                                            key={idx}
                                            href={post.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="relative aspect-square rounded-lg overflow-hidden bg-black/20 group"
                                        >
                                            {/* Media Content */}
                                            {normalizedPost.type === 'Video' ? (
                                                <video
                                                    src={proxyUrl(normalizedPost.videoUrl)}
                                                    poster={proxyUrl(normalizedPost.displayUrl)}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                    muted
                                                    loop
                                                    playsInline
                                                    onMouseEnter={(e) => e.currentTarget.play().catch(() => { })}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.pause();
                                                        e.currentTarget.currentTime = 0;
                                                    }}
                                                />
                                            ) : (
                                                <img
                                                    src={proxyUrl(normalizedPost.displayUrl)}
                                                    alt="Content"
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = '/placeholder-image.png';
                                                    }}
                                                />
                                            )}

                                            {/* Top Overlay: Type Indicator */}
                                            <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 z-10">
                                                {normalizedPost.type === 'Video' ? (
                                                    <Video size={10} className="text-white" />
                                                ) : (
                                                    <Image size={10} className="text-white" />
                                                )}
                                            </div>

                                            {/* Bottom Overlay: Likes & Author */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-2">
                                                <div className="flex items-center gap-1.5 text-white mb-0.5">
                                                    <Heart size={10} className="fill-red-500 text-red-500" />
                                                    <span className="text-[10px] font-bold">
                                                        {likes >= 1000 ? (likes / 1000).toFixed(1) + 'K' : likes}
                                                    </span>
                                                </div>
                                                <div className="text-[9px] text-gray-300 truncate">
                                                    @{(() => {
                                                        let author = post.ownerUsername || post.author || 'unknown';
                                                        if (author === 'AI Selection' || author === 'AI_Selection') {
                                                            author = post.ownerUsername || post.username || 'Unknown';
                                                        }
                                                        return author.replace('@', '');
                                                    })()}
                                                </div>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        </AccordionItem>
                    )}


                    {/* Scrollable Content */}


                    {/* [NEW] 2. Visual DNA (Robust) */}
                    {
                        (() => {
                            const vData = analytics.visual || analytics.visualAnalysis || activeNode?.data;
                            if (!vData) return false;
                            const vd = vData.visualIdentity || vData;
                            return (vd.aestheticTags?.length > 0 || vd.aesthetics?.length > 0 || vd.vibeDescription || vd.colorPalette?.length > 0);
                        })() && (
                            <AccordionItem
                                title="Visual DNA"
                                icon={Palette}
                                colorClass="text-pink-400"
                                isOpen={expandedSection === 'visuals'}
                                onToggle={() => toggleSection('visuals')}
                            >
                                <VisualDNAWidget
                                    data={analytics.visual || analytics.visualAnalysis || activeNode?.data}
                                    className="border-none shadow-none bg-transparent p-0"
                                />
                            </AccordionItem>
                        )
                    }

                    {/* 2. Top Creators (Rising Popularity) - Show ONLY if intent is NOT over-indexing */}
                    {
                        !isOverIndexing && fallbackCreators.length > 0 && (
                            <AccordionItem
                                title={creatorsTitle}
                                icon={Users}
                                colorClass="text-blue-400"
                                isOpen={expandedSection === 'creators'}
                                onToggle={() => toggleSection('creators')}
                            >
                                <div className="space-y-2">
                                    {fallbackCreators.slice(0, 20).map((creator: any, idx: number) => (
                                        <div
                                            key={idx}
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                            onClick={() => onSelect(creator.id || creator.username)} // Handle derived vs analytic objects
                                            className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group animate-fade-in-up"
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {(creator.profilePicUrl || creator.profile_pic_url) ? (
                                                    <ProxiedImage
                                                        src={creator.profilePicUrl || creator.profile_pic_url}
                                                        alt={creator.username}
                                                        className="w-8 h-8 rounded-full object-cover border border-blue-500/30 shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center text-[10px] font-bold text-blue-300 border border-blue-500/20 shrink-0">
                                                        {(creator.username || creator.name || '?').substring(0, 1).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <a
                                                        href={creator.profileUrl || creator.url || creator.sourceUrl || `https://www.instagram.com/${(creator.username || creator.name || '').replace('@', '')}/`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-sm font-medium text-gray-200 group-hover:text-blue-300 transition-colors truncate hover:underline"
                                                    >
                                                        {(() => {
                                                            const name = creator.username || creator.name || creator.fullName || creator.label || creator.id || 'Unknown';
                                                            return name.startsWith('@') ? name : `@${name}`;
                                                        })()}
                                                    </a>
                                                    <span
                                                        className="text-[9px] text-blue-400/70 font-mono cursor-help border-b border-dotted border-blue-400/30"
                                                        title="Relevance Score: Indicates how much more likely this audience is to interact with this account compared to others. Higher multiplier = higher relevance."
                                                    >
                                                        {creator.affinityPercent > 0 ? (
                                                            <span title={`Found in ${creator.rawCount || creator.frequency || 0} of source profiles`}>
                                                                {creator.affinityPercent}% of audience <span className="opacity-50">({creator.rawCount || creator.frequency})</span>
                                                            </span>
                                                        ) : (
                                                            `${Math.round((creator.overindexScore || creator.overindex_score || creator.frequencyScore || creator.frequency || 1) * 10) / 10}x relevant`
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center pl-2">
                                                {creator.provenance && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShowReasoning(creator, 'Creator Analysis');
                                                        }}
                                                        className="p-1.5 text-blue-500/30 hover:text-blue-400 transition-colors rounded-full hover:bg-blue-500/10"
                                                        title="Why this creator?"
                                                    >
                                                        <HelpCircle size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionItem>
                        )
                    }

                    {/* 3. Top Brands (Enriched) */}
                    {
                        fallbackBrands.length > 0 && (
                            <AccordionItem
                                title="Top Brands"
                                icon={ShoppingBag}
                                colorClass="text-orange-400"
                                isOpen={expandedSection === 'brands'}
                                onToggle={() => toggleSection('brands')}
                            >
                                <div className="space-y-2">
                                    {fallbackBrands.slice(0, 20).map((brand: any, idx: number) => (
                                        <div
                                            key={idx}
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                            onClick={() => onSelect(brand.id || brand.username)}
                                            className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group animate-fade-in-up"
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {(brand.profilePicUrl || brand.profile_pic_url) ? (
                                                    <ProxiedImage
                                                        src={brand.profilePicUrl || brand.profile_pic_url}
                                                        alt={brand.username}
                                                        className="w-8 h-8 rounded-full object-cover border border-orange-500/30 shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-orange-900/50 flex items-center justify-center text-[10px] font-bold text-orange-300 border border-orange-500/20 shrink-0">
                                                        {(brand.username || brand.name || '?').substring(0, 1).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <a
                                                        href={brand.profileUrl || brand.url || brand.sourceUrl || `https://www.instagram.com/${(brand.username || brand.name || '').replace('@', '')}/`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-sm font-medium text-gray-200 group-hover:text-orange-300 transition-colors truncate hover:underline"
                                                    >
                                                        {(() => {
                                                            const name = brand.username || brand.name || brand.fullName || brand.label || brand.id || 'Unknown';
                                                            return name.startsWith('@') ? name : `@${name}`;
                                                        })()}
                                                    </a>
                                                    <span
                                                        className="text-[9px] text-orange-400/70 font-mono cursor-help border-b border-dotted border-orange-400/30"
                                                        title="Relevance Score: Indicates brand affinity within this audience dataset. Higher multiplier = higher relevance."
                                                    >
                                                        {brand.affinityPercent > 0 ? (
                                                            <span title={`Found in ${brand.rawCount || brand.frequency || 0} of source profiles`}>
                                                                {brand.affinityPercent}% of audience <span className="opacity-50">({brand.rawCount || brand.frequency})</span>
                                                            </span>
                                                        ) : (
                                                            `${Math.round((brand.overindexScore || brand.overindex_score || brand.frequencyScore || brand.frequency || 1) * 10) / 10}x relevant`
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center pl-2">
                                                {brand.provenance && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleShowReasoning(brand, 'Brand Analysis');
                                                        }}
                                                        className="p-1.5 text-orange-500/30 hover:text-orange-400 transition-colors rounded-full hover:bg-orange-500/10"
                                                        title="Why this brand?"
                                                    >
                                                        <HelpCircle size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionItem>
                        )
                    }

                    {/* 3.4. Geographic Distribution (NEW) */}
                    {
                        geoData && geoData.length > 0 && (
                            <AccordionItem
                                title="Geographic Distribution"
                                icon={Globe}
                                isOpen={expandedSection === 'geo'}
                                onToggle={() => setExpandedSection(expandedSection === 'geo' ? null : 'geo')}
                                colorClass="text-blue-400"
                            >
                                <div className="space-y-3">
                                    {geoData.slice(0, 8).map((loc: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/5 group hover:border-blue-500/30 transition-colors">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-400">
                                                    {idx + 1}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-gray-200 truncate">{loc.location}</div>
                                                    <div className="text-[9px] text-gray-500">{loc.count} mentions</div>
                                                </div>
                                            </div>
                                            <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500/50"
                                                    style={{ width: `${Math.min(100, (loc.count / (geoData[0]?.count || 1)) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionItem>
                        )
                    }

                    {/* 3.5. Over-indexed Accounts - Show ONLY if intent IS over-indexing */}
                    {
                        isOverIndexing && derivedOverindexedProfiles.length > 0 && (
                            <AccordionItem
                                title={`Over-indexed Profiles (${derivedOverindexedProfiles.length})`}
                                icon={TrendingUp}
                                colorClass="text-yellow-400"
                                isOpen={expandedSection === 'overindexed'}
                                onToggle={() => toggleSection('overindexed')}
                            >
                                <div className="space-y-2">
                                    {derivedOverindexedProfiles.slice(0, 20).map((account: any, idx: number) => (
                                        <div
                                            key={idx}
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                            onClick={() => handleShowReasoning(account, 'Rising Popularity')}
                                            className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group animate-fade-in-up"
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {(account.profilePicUrl) ? (
                                                    <ProxiedImage
                                                        src={account.profilePicUrl}
                                                        alt={account.username}
                                                        className="w-8 h-8 rounded-full object-cover border border-yellow-500/30 shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-yellow-900/50 flex items-center justify-center text-[10px] font-bold text-yellow-300 border border-yellow-500/20 shrink-0">
                                                        {(account.username || account.name || '?').substring(0, 1).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <a
                                                        href={account.profileUrl || `https://www.instagram.com/${(account.username || account.name || '').replace('@', '')}/`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-sm font-medium text-gray-200 group-hover:text-yellow-300 transition-colors truncate hover:underline"
                                                    >
                                                        {account.username || account.name || 'Unknown'}
                                                    </a>
                                                    <span className="text-[9px] text-gray-500" title="Number of source profiles linking to this account">
                                                        {account.count} sources
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {account.overindexScore > 0 && (
                                                    <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded font-mono">
                                                        {account.overindexScore >= 10 ? Math.round(account.overindexScore) : Number(account.overindexScore).toFixed(1)}x
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShowReasoning(account, 'Over-indexing Analysis');
                                                    }}
                                                    className="p-1.5 text-yellow-500/30 hover:text-yellow-400 transition-colors rounded-full hover:bg-yellow-500/10"
                                                    title="View Provenance (Who follows?)"
                                                >
                                                    <HelpCircle size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </AccordionItem>
                        )
                    }

                    {/* 5. Subtopics & Subcultures */}
                    {
                        (() => {
                            // Find all subtopic and concept nodes from the graph
                            const subtopics = data.nodes.filter(n =>
                            (n.group === 'subtopic' ||
                                n.group?.startsWith('subtopic_') ||
                                n.group === 'concept')
                            ).sort((a, b) => (b.val || b.value || 0) - (a.val || a.value || 0)); // Sort by size/occurrence

                            if (subtopics.length === 0) return null;

                            return (
                                <AccordionItem
                                    title="Subtopics & Subcultures"
                                    icon={Hash}
                                    colorClass="text-purple-400"
                                    isOpen={expandedSection === 'subtopics'}
                                    onToggle={() => toggleSection('subtopics')}
                                >
                                    <div className="space-y-2">
                                        {subtopics.slice(0, 15).map((subtopic, idx) => (
                                            <div
                                                key={idx}
                                                style={{ animationDelay: `${idx * 30}ms` }}
                                                onClick={() => handleShowReasoning(subtopic, 'Subculture Analysis')}
                                                className="flex items-center justify-between p-2 rounded hover:bg-white/5 cursor-pointer group animate-fade-in-up"
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${subtopic.group === 'concept' ? 'bg-pink-400' : 'bg-purple-400'
                                                        }`}></span>
                                                    <span className="text-xs text-gray-300 group-hover:text-purple-300 transition-colors truncate">
                                                        {subtopic.label}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionItem>
                            );
                        })()
                    }

                    {/* [MOVING] Data Provenance (Now at Bottom) */}
                    {activeProvenance && (
                        <AccordionItem
                            title="Data Provenance"
                            icon={BrainCircuit}
                            colorClass="text-emerald-400"
                            isOpen={expandedSection === 'provenance'}
                            onToggle={() => toggleSection('provenance')}
                        >
                            <div className="p-0">
                                <ReasoningPanel
                                    item={activeProvenance}
                                    dataset={data.data || []}
                                    className="border-none bg-transparent p-0"
                                    onClose={() => { }}
                                    hideHeader={true}
                                />
                            </div>
                        </AccordionItem>
                    )}
                </div >
            </div >
        </>
    );
};

export default AnalyticsPanel;
