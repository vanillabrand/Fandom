
export interface EvidenceItem {
    type: string;
    text: string;
    url: string;
    date: string;
    author: string;
    displayUrl?: string;
    videoUrl?: string;
    children?: any;
    postType?: string;
    videoViewCount?: number;
    mediaUrl?: string;
    isDirect?: boolean;
    sourceId?: string;
}

export const getEvidence = (target: any): EvidenceItem[] => {
    if (!target) return [];

    const evidence: EvidenceItem[] = [];
    // [OPTIMIZED] Use server-hydrated posts directly
    const posts = target.data?.latestPosts || target.latestPosts;

    if (posts && Array.isArray(posts)) {
        posts.forEach((post: any) => {
            // [FIX] Ensure post and post.url exist before accessing
            if (!post) return;

            const authorHandle = post.ownerUsername || post.username || post.author || target.label || 'Unknown';
            // Ensure we link to the post if possible, otherwise the author
            let finalUrl = post.url || post.permalink || post.postUrl;

            if (!finalUrl && post.shortCode) {
                finalUrl = `https://www.instagram.com/p/${post.shortCode}/`;
            }

            // Fallback to profile link if no post link
            if (!finalUrl || finalUrl === '#') {
                const cleanAuthor = authorHandle.replace('@', '').trim();
                if (cleanAuthor !== 'Unknown') {
                    finalUrl = `https://www.instagram.com/${cleanAuthor}/`;
                } else {
                    finalUrl = '#';
                }
            }

            evidence.push({
                type: 'post',
                text: post.caption || post.text || 'No caption',
                url: finalUrl,
                date: post.date || post.timestamp || 'Recent',
                author: authorHandle,
                displayUrl: post.displayUrl || post.imageUrl,
                videoUrl: post.videoUrl,
                children: post.children,
                postType: post.type, // 'Image', 'Video', 'Sidecar'
                videoViewCount: post.videoViewCount
            });
        });
    }

    // 2. Structural Evidence (AI Reasoning)
    if (target.data && target.data.evidence) {
        // If AI evidence is just a string, we can't do much with URL
        // But if it's an object, we might extract more
        evidence.push({
            type: 'insight',
            text: typeof target.data.evidence === 'string' ? target.data.evidence : JSON.stringify(target.data.evidence),
            url: '#', // Contextual insight usually doesn't have a direct link
            date: 'AI Analysis',
            author: 'System'
        });
    }

    // [NEW] Add pre-calculated evidence from backend provenance
    const provEvidence = target.provenance?.evidence || target.data?.provenance?.evidence;
    if (provEvidence && Array.isArray(provEvidence)) {
        provEvidence.forEach((ev: any) => {
            // Deduplicate if already added (by URL)
            if (!evidence.some(existing => existing.url === ev.url)) {
                // [Refinement] Ensure backend evidence also follows the rules if possible
                // But assume backend provides correct URLs usually.
                evidence.push(ev);
            }
        });
    }

    return evidence;
};
