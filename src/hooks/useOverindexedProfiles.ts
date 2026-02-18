import { useMemo } from 'react';
import { FandomData } from '../../types';
import { normalizeId } from '../utils/analytics/generalUtils';

export const useOverindexedProfiles = (data: FandomData) => {
    return useMemo(() => {
        // 1. Get nodes explicitly marked as 'overindexed' OR 'creator'/'brand' with high overindex scores
        // The user specifically asked for an "Overindexed Profiles" panel.
        // We look for nodes with group='overindexed' OR any node with 'overindexScore' data.
        const relevantNodes = data.nodes.filter(n =>
        (n.group === 'overindexed' ||
            (n.data && typeof n.data.overindexScore === 'number' && n.data.overindexScore > 1))
        );

        // Filter out the main profile AND Unknown profiles to avoid circularity and invalid data
        const filteredNodes = relevantNodes.filter(n => {
            const label = (n.label || '').toLowerCase();
            const username = (n.data?.username || '').toLowerCase();
            const id = (n.id || '').toLowerCase();
            // Exclude MAIN, main group, and any "unknown" profiles
            return n.id !== 'MAIN' &&
                n.group !== 'main' &&
                label !== 'unknown' &&
                username !== 'unknown' &&
                id !== 'unknown';
        });

        return filteredNodes.map(node => {
            // Find links targeting this node (Followers of this profile in our sample)
            const incomingLinks = data.links.filter(l => {
                const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                return normalizeId(targetId) === normalizeId(node.id);
            });

            // Resolve source profiles (The members of our audience who follow this account)
            const sources = incomingLinks.map(l => {
                const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                // We only care about sources that represent our "Audience" (usually 'user' or 'profile' group depending on data model)
                // But in this graph, usually 'main' -> 'cluster' -> 'profile' or similar. 
                // Actually, for "Overindexed", the structure is usually Main -> Cluster -> Profile.
                // Or Main -> Profile directly.
                return data.nodes.find(n => normalizeId(n.id) === normalizeId(sourceId));
            }).filter(n => n);

            const evidence = sources.map(s => {
                const handle = s?.label || 'Unknown';
                const cleanHandle = handle.replace('@', '').trim();
                return {
                    type: 'social_graph',
                    text: `Followed by ${handle}`,
                    author: handle,
                    date: 'Observed Connection', // [FIX] Required for ReasoningPanel to render header
                    url: cleanHandle !== 'Unknown' ? `https://www.instagram.com/${cleanHandle}/` : '#'
                };
            });

            return {
                id: node.id,
                username: node.label, // Label is usually the handle
                fullName: node.data?.fullName,
                profilePicUrl: node.data?.profilePicUrl || node.data?.profile_pic_url,
                profileUrl: node.data?.profileUrl || node.data?.externalUrl || node.data?.sourceUrl || node.data?.url,
                // [FIX] Ensure we pass raw score and fallback to value/val if needed
                overindexScore: node.data?.overindexScore || node.data?.frequencyScore || node.val || node.value || (evidence.length > 0 ? evidence.length : 0),
                // [CRITICAL] Sync count with node value if evidence is partial, otherwise use evidence length
                count: Math.round(node.val || node.value || evidence.length || 0),
                followersCount: node.data?.followerCount,
                category: node.group,
                provenance: {
                    source: 'Graph Topology',
                    method: 'Over-indexing Analysis',
                    evidence: evidence,
                    confidence: 1.0
                }
            };
        }).sort((a, b) => (b.overindexScore || 0) - (a.overindexScore || 0));
    }, [data.nodes, data.links]);
};
