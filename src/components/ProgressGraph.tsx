import React, { useEffect, useState, useMemo } from 'react';
import FandomGraph3D from './FandomGraph3D.js';
import { Job } from '../../types.js';

interface ProgressGraphProps {
    jobId: string;
    token: string;
    className?: string;
}

export const ProgressGraph: React.FC<ProgressGraphProps> = ({ jobId, token, className }) => {
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [nodeCount, setNodeCount] = useState(0);

    // Poll for data
    useEffect(() => {
        let isMounted = true;
        const pollInterval = 3000; // 3 seconds

        const fetchData = async () => {
            try {
                // 1. Get Job Info (for target profile / center node)
                // We cache this ideally, but for now fetch just to be safe or pass as prop?
                // Let's assume we can derive center from the items or job input.
                // Fetching job details:
                const jobRes = await fetch(`/api/jobs/${jobId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const job: Job = await jobRes.json();

                const targetProfile = job.metadata?.query || job.metadata?.targetProfile || "Target";

                // 2. Get Dataset Items
                const res = await fetch(`/api/jobs/${jobId}/proxy-dataset`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const items = await res.json();

                    if (items.length > 0 && isMounted) {
                        setGraphData(prev => {
                            const newNodesMap = new Map();
                            // 1. Keep all existing nodes to preserve their simulation state (x, y, z)
                            prev.nodes.forEach(n => newNodesMap.set(n.id, n));

                            const newLinks = [...prev.links];
                            const centerId = targetProfile.toLowerCase();

                            // 2. Ensure Center exists
                            if (!newNodesMap.has(centerId)) {
                                newNodesMap.set(centerId, {
                                    id: centerId,
                                    label: targetProfile,
                                    val: 20,
                                    group: 'main',
                                    color: '#10b981'
                                });
                            }

                            let addedAny = false;

                            // 3. Merge new items
                            items.forEach((item: any) => {
                                const username = item.username || item.ownerUsername;
                                if (!username) return;

                                const id = username.toLowerCase();
                                if (id === centerId) return;

                                if (!newNodesMap.has(id)) {
                                    newNodesMap.set(id, {
                                        id: id,
                                        label: username,
                                        val: item.followersCount ? Math.log10(item.followersCount) + 2 : 2,
                                        group: 'user',
                                        profilePic: item.profilePicUrl,
                                        data: item
                                    });

                                    newLinks.push({
                                        source: centerId,
                                        target: id,
                                        value: 1
                                    });
                                    addedAny = true;
                                } else {
                                    // Update existing node data if needed, but keep the object reference!
                                    const existing = newNodesMap.get(id);
                                    if (item.profilePicUrl && !existing.profilePic) {
                                        existing.profilePic = item.profilePicUrl;
                                        existing.data = { ...existing.data, ...item };
                                    }
                                }
                            });

                            if (!addedAny && prev.nodes.length === newNodesMap.size) return prev;

                            const finalNodes = Array.from(newNodesMap.values());
                            setNodeCount(finalNodes.length);
                            return {
                                nodes: finalNodes,
                                links: newLinks
                            };
                        });
                    }
                }
            } catch (e) {
                console.error("Progress graph poll failed", e);
            }
        };

        fetchData(); // Initial
        const interval = setInterval(fetchData, pollInterval);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [jobId, token]);

    return (
        <div className={`relative w-full h-full ${className}`}>
            <div className="absolute top-4 left-4 z-10 bg-black/50 p-2 rounded text-xs text-emerald-400 font-mono backdrop-blur">
                LIVE NODES: {nodeCount}
            </div>
            <FandomGraph3D
                nodes={graphData.nodes}
                links={graphData.links}
                showLegend={false}
                bloomStrength={1.5} // Strong bloom for "Matrix" feel
                query="Live Infiltration" // [NEW] Parity
                initialZoom={400} // [NEW] Closer look
            />
        </div>
    );
};
