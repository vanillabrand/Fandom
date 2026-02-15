// [FIX] Force rebuild v4 - Performance Optimization
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
// [REMOVED] imports for custom shapes
import { useGraphScene } from '../hooks/useGraphScene.js';
// [FIX] Removed broken import, added local types
// import { Node, Link } from '../../types.js';
import { RefreshCw } from 'lucide-react';

interface Node {
    id: string;
    label?: string;
    group?: string;
    val?: number;
    color?: string;
    x?: number;
    y?: number;
    z?: number;
    [key: string]: any;
}

interface Link {
    source: string | Node;
    target: string | Node;
    [key: string]: any;
}
import GraphLegend from './GraphLegend.js';
import { useAuth } from '../contexts/AuthContext.js';

// [PERFORMANCE] Shared Geometry Cache (Flyweight Pattern)
// Create geometries ONCE and reuse across all nodes to prevent memory bloat
const SHARED_GEOMETRIES = {
    sphere: new THREE.SphereGeometry(1, 8, 8), // [OPTIMIZED] Reduced segments
    icosahedron: new THREE.IcosahedronGeometry(1, 0),
    dodecahedron: new THREE.DodecahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 2, 8), // [OPTIMIZED] Reduced segments
    octahedron: new THREE.OctahedronGeometry(1, 0),
    tetrahedron: new THREE.TetrahedronGeometry(1, 0)
};

interface FandomGraph3DProps {
    nodes?: Node[];
    links?: Link[];
    overrideData?: any;
    highlightedLabel?: string | null;
    focusedNodeId?: string | null;
    profileImage?: string;
    profileFullName?: string;
    showLegend?: boolean;
    bloomStrength?: number;
    initialZoom?: number;
    query?: string;
    onNodeClick?: (id: string | null) => void;
    isOpen?: boolean;
    enableTour?: boolean; // [NEW] Tour support
    isEnriching?: boolean; // [NEW] For background process indicator
    visualTheme?: { // [NEW] Themed Props
        archetype?: string; // [MODIFIED] Relaxed to string to matching types.ts
        nodeTypeMapping?: Record<string, string>; // [MODIFIED] Allow dynamic string IDs
        primaryColor: string;
        textureStyle: string;
    };
}

const getNodeColor = (group: string, visualTheme?: any) => {
    // Handle undefined or empty group
    if (!group) return '#9ca3af'; // Default gray for unknown groups

    // [THEME] Use primary color from theme if available for key highlights
    const themeColor = visualTheme?.primaryColor;

    // Handle dynamic brand comparison groups
    if (group.endsWith('-brand')) {
        if (group === 'shared-brand') {
            return '#9333EA'; // Purple for shared brands
        } else if (group.includes('nike')) {
            return '#0066CC'; // Nike blue
        } else if (group.includes('mrbeast')) {
            return '#FFB800'; // MrBeast yellow
        } else {
            // Generic brand comparison colors
            const profileName = group.replace('-brand', '');
            // Generate a consistent color based on profile name
            const hash = profileName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const hue = hash % 360;
            return `hsl(${hue}, 70%, 60%)`;
        }
    }

    switch (group) {
        case 'main': return themeColor || '#ffffff'; // Apply theme to root
        case 'cluster': return '#10b981';
        case 'creator': return '#f472b6'; // Pink
        case 'brand': return '#4f46e5'; // Indigo (more distinct from brand)
        case 'media': return '#38bdf8'; // Sky
        case 'post': return '#38bdf8'; // Sky
        case 'profile': return '#9ca3af';
        case 'nonRelatedInterest': return '#f59e0b';
        case 'topic': return '#8b5cf6';
        case 'subtopic': return '#f59e0b'; // Amber for subtopic
        case 'hashtag': return '#14b8a6';
        default: return '#9ca3af';
    }
};

const FandomGraph3D: React.FC<FandomGraph3DProps> = ({
    nodes = [],
    links = [],
    overrideData,
    highlightedLabel,
    focusedNodeId = null,
    profileImage,
    profileFullName,
    showLegend = true,
    bloomStrength = 0.15,  // Reduced for less glow
    initialZoom,
    visualTheme,
    onNodeClick,
    isOpen = false,
    enableTour = false, // [NEW] Default to false
    isEnriching = false, // [NEW]
    query
}) => {
    const { token } = useAuth();
    const [fgRefState, setFgRefState] = useState<any>(null);

    const setFgRef = useCallback((instance: any) => {
        if (instance) {
            console.log("[FandomGraph3D] ForceGraph3D ref set successfully.");
            setFgRefState(instance);
        }
    }, []);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeCache = useRef<Map<string, THREE.Object3D>>(new Map()); // [NEW] Stable object cache
    const sceneInitialized = useRef(false); // [NEW] Track scene init to prevent thrashing
    const materialCache = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map()); // [PERFORMANCE] Material cache to prevent memory leaks
    const hitAreaMaterial = useRef<THREE.MeshBasicMaterial | null>(null); // [FIX] Shared hit area material
    const hitAreaGeometryCache = useRef<Map<number, THREE.SphereGeometry>>(new Map()); // [FIX] Cache hit area geometries
    const isUserInteracting = useRef(false);
    const isDragging = useRef(false); // [NEW] Track drag state to prevent focus slip
    const animationFrameIds = useRef<Set<number>>(new Set()); // [PERFORMANCE] Track all active animations for cleanup
    const lastDataHash = useRef<string>(""); // [NEW] Track data changes for reset
    const isClickingNode = useRef(false); // [NEW] Coordinate camera between click and prop change




    const [dimensions, setDimensions] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 800,
        height: typeof window !== 'undefined' ? window.innerHeight : 600
    });
    const [layoutMode, setLayoutMode] = useState<'standard' | 'grid' | 'hierarchical' | 'radial' | 'bloom'>('standard');
    const [hoverNode, setHoverNode] = useState<any | null>(null);
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set<any>());
    const [isActive, setIsActive] = useState(false); // For initial fade-in check
    const [isPhysicsReady, setPhysicsReady] = useState(false); // [FIX] Safe startup for physics
    const [isTourActive, setIsTourActive] = useState(false); // [NEW] Tour state
    const [tourIndex, setTourIndex] = useState(0); // [NEW] Tour index
    const [showDebug, setShowDebug] = useState(false); // [NEW] Debug UI Toggle

    // [DIAGNOSTIC] Check WebGL Support
    useEffect(() => {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) {
                console.error("[FandomGraph3D] WebGL NOT supported in this browser!");
            } else {
                console.log("[FandomGraph3D] WebGL supported.");
            }
        } catch (e) {
            console.error("[FandomGraph3D] Error checking WebGL:", e);
        }
    }, []);

    // [FIX] Rotation logic removed for physics stability


    // [FIX] Resize Observer with Threshold to prevent infinite loops
    const lastDims = useRef(dimensions);
    useEffect(() => {
        if (!containerRef.current) return;
        const ctr = containerRef.current;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                // [STABLE] Only update if change is significant (> 15px) to prevent layout loops
                const dx = Math.abs(width - lastDims.current.width);
                const dy = Math.abs(height - lastDims.current.height);

                if ((dx > 15 || dy > 15) && width > 32 && height > 32) {
                    console.log("[FandomGraph3D] Resize update met threshold:", width, "x", height);
                    lastDims.current = { width, height };
                    setDimensions({ width, height });
                }
            }
        });

        observer.observe(ctr);
        return () => observer.disconnect();
    }, []);



    // [DIAGNOSTIC] Monitor if rendering loop and canvas are alive
    useEffect(() => {
        let count = 0;

        const check = () => {
            if (fgRefState) {
                const canvas = containerRef.current?.querySelector('canvas');
                if (canvas && count < 5) {
                    console.log(`[FandomGraph3D] Render tick ${count} - Canvas: ${canvas.width}x${canvas.height}`);
                    count++;
                }

                // [HEALTH CHECK] If canvas is present but size is 0, something is wrong
                if (canvas && (canvas.width === 0 || canvas.height === 0)) {
                    console.warn("[FandomGraph3D] ⚠️ Canvas has 0 dimensions! Force-triggering resize.");
                    setDimensions({
                        width: window.innerWidth,
                        height: window.innerHeight
                    });
                }

                // Track Alpha safely
                if (typeof fgRefState.d3Alpha === 'function') {
                    (window as any).D3Alpha = fgRefState.d3Alpha();
                }
            }
        };
        const timer = setInterval(check, 2000); // Check every 2s
        return () => clearInterval(timer);
    }, [fgRefState]);

    // [P0] WebGL Context Management - Handle context loss/restore
    useEffect(() => {
        if (!fgRefState) return;

        const renderer = fgRefState.renderer();
        if (!renderer || !renderer.domElement) return;

        const canvas = renderer.domElement;

        const handleContextLost = (event: Event) => {
            event.preventDefault();
            console.warn('[FandomGraph3D] WebGL context lost! Attempting to restore...');

            // [P0] Explicitly dispose of all cached resources to free GPU memory
            materialCache.current.forEach(m => m.dispose());
            nodeCache.current.forEach(obj => {
                obj.traverse((child: any) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m: any) => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            });

            materialCache.current.clear();
            nodeCache.current.clear();
            hitAreaGeometryCache.current.forEach(g => g.dispose());
            hitAreaGeometryCache.current.clear();
            if (hitAreaMaterial.current) {
                hitAreaMaterial.current.dispose();
                hitAreaMaterial.current = null;
            }

            // Pause simulation
            if (fgRefState.pauseAnimation) {
                fgRefState.pauseAnimation();
            }
        };

        const handleContextRestored = () => {
            console.log('[FandomGraph3D] WebGL context restored successfully');

            // Resume simulation
            if (fgRefState.resumeAnimation) {
                fgRefState.resumeAnimation();
            }

            // [FIX] Re-initialize scene settings
            if (fgRefState.d3ReheatSimulation) {
                fgRefState.d3ReheatSimulation();
            }

            // Force a re-render by bumping state if needed, 
            // but usually reheating is enough.
        };

        const handleContextCreationError = (event: Event) => {
            console.error('[FandomGraph3D] WebGL context creation failed:', event);
        };

        // Add event listeners
        canvas.addEventListener('webglcontextlost', handleContextLost, false);
        canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
        canvas.addEventListener('webglcontextcreationerror', handleContextCreationError, false);

        // Cleanup
        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
            canvas.removeEventListener('webglcontextcreationerror', handleContextCreationError);
        };
    }, [fgRefState]);


    const activeNodes = (overrideData ? overrideData.nodes : nodes) || [];
    const activeLinks = (overrideData ? overrideData.links : links) || [];

    // Safe cloning of graph data to avoid circular reference crashes with JSON.stringify
    const graphData = useMemo(() => {
        // Clear caches when source data changes to prevent stale 3D objects
        nodeCache.current.clear();
        // Note: materialCache is NOT cleared here - materials are reusable across data changes

        // Strict Node Sanitization
        const validNodes: any[] = [];
        const validNodeIds = new Set<string>();

        activeNodes.forEach((n: any) => {
            // Must have a valid string or number ID
            if (n.id !== undefined && n.id !== null && n.id !== '') {
                const sId = String(n.id).toLowerCase();
                const isRoot = sId === 'main' || sId === 'root';

                const newNode = {
                    ...n,
                    id: isRoot ? 'MAIN' : n.id, // Standardize to MAIN internally
                    // [FIX] Ensure numeric coordinates exist to prevent D3 crash
                    x: typeof n.x === 'number' && !isNaN(n.x) ? n.x : Math.random(),
                    y: typeof n.y === 'number' && !isNaN(n.y) ? n.y : Math.random(),
                    z: typeof n.z === 'number' && !isNaN(n.z) ? n.z : Math.random()
                };
                validNodes.push(newNode);
                validNodeIds.add(String(newNode.id));
            } else {
                console.warn("[FandomGraph3D] Dropping invalid node (missing ID):", n);
            }
        });

        // Strict Link Sanitization
        const validLinks = activeLinks
            .map((l: any) => {
                if (!l) return null;
                // [FIX] Guard against null (typeof null === 'object')
                let sourceId = l.source;
                if (sourceId && typeof sourceId === 'object') sourceId = sourceId.id;

                let targetId = l.target;
                if (targetId && typeof targetId === 'object') targetId = targetId.id;

                if (!sourceId || !targetId) return null;

                // [FIX] Standardize to MAIN for link consistency
                const sIdStr = String(sourceId).toLowerCase();
                const tIdStr = String(targetId).toLowerCase();
                const finalSource = (sIdStr === 'main' || sIdStr === 'root') ? 'MAIN' : String(sourceId);
                const finalTarget = (tIdStr === 'main' || tIdStr === 'root') ? 'MAIN' : String(targetId);

                return { ...l, source: finalSource, target: finalTarget };
            })
            .filter((l: any) => {
                if (!l) return false;
                const hasSource = validNodeIds.has(l.source);
                const hasTarget = validNodeIds.has(l.target);

                if (!hasSource || !hasTarget) {
                    return false;
                }
                return true;
            });

        // [STRICT TOPOLOGY] Enforce Hub -> Cluster Only
        // 1. Identify valid clusters
        const clusterNodes = validNodes.filter(n => n.group === 'cluster');
        if (clusterNodes.length === 0) {
            // [FIX] Detect actual root ID
            const rootId = validNodeIds.has('MAIN') ? 'MAIN' : null;

            if (rootId) {
                // Fallback: Create a "General" cluster if none exist to avoid breaking graph
                const generalCluster = { id: 'c_general', group: 'cluster', label: 'General', val: 20, x: Math.random(), y: Math.random(), z: Math.random() };
                validNodes.push(generalCluster);
                clusterNodes.push(generalCluster);
                validNodeIds.add('c_general');
                // Link to the ACTUAL root
                validLinks.push({ source: rootId, target: 'c_general' });
            }
        }

        const finalLinks: any[] = [];

        // Helper to get round-robin cluster
        let clusterIndex = 0;
        const getNextCluster = () => {
            const c = clusterNodes[clusterIndex % clusterNodes.length];
            clusterIndex++;
            return c;
        };

        validLinks.forEach(link => {
            const sId = String(link.source);
            const tId = String(link.target);

            const isMainLink = sId === 'MAIN' || tId === 'MAIN' || sId === 'ROOT' || tId === 'ROOT';

            if (isMainLink) {
                const otherId = sId === 'MAIN' || sId === 'ROOT' ? tId : sId;
                const otherNode = validNodes.find(n => String(n.id) === otherId);

                if (otherNode && otherNode.group === 'cluster') {
                    // Allowed: Cluster connecting to Hub
                    finalLinks.push(link);
                } else {
                    // [RE-PARENT] Orphan node attempting to connect to Hub
                    // Redirect to a cluster instead
                    const targetCluster = getNextCluster();
                    if (targetCluster) {
                        finalLinks.push({
                            source: targetCluster.id,
                            target: otherId,
                            // Preserve original link properties if any
                            ...link
                        });
                        console.log(`[Topology] Re-parented orphan ${otherId} from MAIN to ${targetCluster.id}`);
                    }
                }
            } else {
                // Keep non-hub links as is
                finalLinks.push(link);
            }
        });

        // Replace validLinks with strict topology links
        validLinks.length = 0;
        validLinks.push(...finalLinks);

        console.log(`[FandomGraph3D] Sanitized Graph: ${validNodes.length} nodes, ${validLinks.length} links`);

        const nodeInfoMap = new Map<string, any>();
        validNodes.forEach(n => {
            nodeInfoMap.set(String(n.id), { group: n.group, label: n.label });
        });

        // [FILTER] Exclude evidence nodes from visualization to reduce clutter
        // We hide: Direct Search Results, Posts, Profile Authority, Locations, and Comments
        // We keep: 'bio' and 'concept' as they may represent distinct topics
        const hiddenTypes = new Set(['search_match', 'post', 'profile_match', 'location', 'comment']);

        const visibleNodes = validNodes.filter((n: any) => {
            const isHiddenLabel = n.label === 'Direct Search Result' ||
                n.label === 'Relevant Post' ||
                n.label === 'High Authority Profile' ||
                n.label === 'Location Match' ||
                n.label === 'User Engagement';

            const isHiddenType = n.data?.evidenceType && hiddenTypes.has(n.data.evidenceType);

            return !isHiddenLabel && !isHiddenType;
        });

        // [FILTER] Exclude links connected to hidden nodes
        const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.id));
        const visibleLinks = validLinks.filter((l: any) =>
            visibleNodeIds.has(typeof l.source === 'object' ? l.source.id : l.source) &&
            visibleNodeIds.has(typeof l.target === 'object' ? l.target.id : l.target)
        );

        console.log("[FandomGraph3D] Processing graphData. Nodes:", visibleNodes.length, "Links:", visibleLinks.length);
        return {
            nodes: visibleNodes,
            links: visibleLinks,
            nodeInfo: nodeInfoMap
        };
    }, [activeNodes, activeLinks]); // [FIX] Use objects directly to catch property changes

    useEffect(() => {
        // [FORCE CACHE DISPOSAL] on mount and data transition
        // We must dispose of old resources before clearing the maps to prevent leaks
        materialCache.current.forEach(m => m.dispose());
        nodeCache.current.forEach(obj => {
            obj.traverse((child: any) => {
                if (child.geometry && !Object.values(SHARED_GEOMETRIES).includes(child.geometry)) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m: any) => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        });

        nodeCache.current.clear();
        materialCache.current.clear();

        // [NEW] Force Camera Reset & Add Test Object
        if (fgRefState) {
            console.log("[FandomGraph3D] Resetting camera to fixed distance...");

            // Allow simulation to expand before positioning
            const timer = setTimeout(() => {
                if (fgRefState) {
                    fgRefState.cameraPosition({ x: 0, y: 100, z: 1200 }, { x: 0, y: 0, z: 0 }, 1000);
                }
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [fgRefState, graphData.nodes.length]); // [OPTIMIZED] Use primitive dependency

    // [REMOVED] Expensive debug useEffect that re-ran on every graphData/dimensions change
    // Moved to development-only initialization
    useEffect(() => {
        if (process.env.NODE_ENV === 'development' && fgRefState) {
            (window as any).FandomDebug = {
                fg: fgRefState,
                scene: fgRefState.scene(),
                camera: fgRefState.camera()
            };
        }
    }, [fgRefState]);

    useEffect(() => {
        console.log("[FandomGraph3D] Props - nodes:", nodes.length, "links:", links.length, "overrideData:", !!overrideData);
    }, [nodes, links, overrideData]);

    // [DEBUG] DIAGNOSTIC LOGS
    useEffect(() => {
        if (!graphData.nodes.length) {
            console.warn("[FandomGraph3D] ⚠️ graphData.nodes is EMPTY! Nothing to render.");
        } else {
            console.log(`[FandomGraph3D] ✅ Rendering ${graphData.nodes.length} nodes. First node:`, graphData.nodes[0]);
        }
        console.log(`[FandomGraph3D] Current Dimensions: ${dimensions.width}x${dimensions.height}`);
    }, [graphData, dimensions]);

    // [NEW] Camera Coordination - Handle external selection via focusedNodeId
    useEffect(() => {
        if (!focusedNodeId || !fgRefState || isClickingNode.current) return;

        // Give D3 a moment to update node positions if they just changed
        const timer = setTimeout(() => {
            const node = graphData.nodes.find((n: any) => String(n.id) === String(focusedNodeId));
            if (node) {
                console.log(`[FandomGraph3D] Animating camera to focused node: ${focusedNodeId}`);
                const distance = 80;
                const dist = Math.hypot(node.x, node.y, node.z);
                const newPos = dist < 1
                    ? { x: 0, y: 0, z: distance }
                    : {
                        x: node.x * (1 + distance / dist),
                        y: node.y * (1 + distance / dist),
                        z: node.z * (1 + distance / dist)
                    };

                fgRefState.cameraPosition(newPos, node, 1500);
            }
        }, 100);

        return () => clearTimeout(timer);
    }, [focusedNodeId, fgRefState, graphData.nodes]);

    // [NEW] Use the dedicated hook for scene initialization
    useGraphScene(fgRefState);

    // [FIX] Physics Re-enabled with Safety Checks + Auto-Pause for Performance
    useEffect(() => {
        if (!fgRefState) return;

        // [FIX] Delay physics update to ensure internal D3 engine is ready
        const timer = setTimeout(() => {
            try {
                // Safeguard: Check if d3Force is a function before calling
                if (typeof fgRefState.d3Force === 'function') {
                    console.log("[FandomGraph3D] Updating Physics Forces (Active Mode)...");

                    // 1. Charge (Repulsion)
                    const chargeForce = fgRefState.d3Force('charge');
                    if (chargeForce) {
                        chargeForce
                            .strength(-100)
                            .distanceMin(20)
                            .distanceMax(2000);
                    }
                }



                // 2. Links (Distance)
                if (typeof fgRefState.d3Force === 'function' && fgRefState.d3Force('link')) {
                    fgRefState.d3Force('link')
                        .distance((link: any) => {
                            // [FIX] Increase distance for Hub -> Cluster links (User Request)
                            const sId = typeof link.source === 'object' ? link.source.id : link.source;
                            const tId = typeof link.target === 'object' ? link.target.id : link.target;
                            const sInfo = (graphData as any).nodeInfo?.get(sId);
                            const tInfo = (graphData as any).nodeInfo?.get(tId);

                            const isMainConnection = sId === 'MAIN' || tId === 'MAIN' || sInfo?.group === 'main' || tInfo?.group === 'main';
                            if (isMainConnection) return 80; // [FIX] Reduced from 120 for tighter graph centering

                            const isClusterLink = sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId?.includes('c_') || tId?.includes('c_');
                            return isClusterLink ? 50 : 40;
                        })
                        .strength((link: any) => {
                            const sId = typeof link.source === 'object' ? link.source.id : link.source;
                            const tId = typeof link.target === 'object' ? link.target.id : link.target;
                            const isMainConnection = sId === 'MAIN' || tId === 'MAIN';
                            return isMainConnection ? 1.0 : 0.7; // Stronger core bonds
                        });
                }

                // [FIX] Enable physics engine via prop
                setPhysicsReady(true);

                // [PERFORMANCE] Relaxed Auto-pause physics
                let stableFrames = 0;
                const stabilityCheckInterval = setInterval(() => {
                    if (!fgRefState.d3Force) return;

                    // Don't auto-pause if user is interacting
                    if (isDragging.current || isUserInteracting.current) {
                        stableFrames = 0;
                        return;
                    }

                    const chargeNodes = fgRefState.d3Force('charge')?.nodes?.();
                    if (!chargeNodes || chargeNodes.length === 0) return;

                    // Calculate max velocity across all nodes
                    const velocities = chargeNodes.map((n: any) =>
                        Math.abs(n.vx || 0) + Math.abs(n.vy || 0) + Math.abs(n.vz || 0)
                    );

                    const maxVelocity = Math.max(...velocities);

                    // [FIX] Lower threshold for longer activity (0.5 -> 0.1)
                    if (maxVelocity < 0.1) {
                        stableFrames++;
                        if (stableFrames > 20) { // [FIX] Longer wait before pause (10 -> 20)
                            // console.log('🎯 [Performance] Physics simulation stable - pausing to save CPU');
                            fgRefState.pauseAnimation();
                            clearInterval(stabilityCheckInterval);
                        }
                    } else {
                        stableFrames = 0;
                    }
                }, 200); // Check less frequently (100 -> 200)

                return () => clearInterval(stabilityCheckInterval);

            } catch (e) {
                console.error("[FandomGraph3D] Physics Update Failed:", e);
            }
        }, 500); // 500ms Warmup

        return () => clearTimeout(timer);
    }, [fgRefState, activeNodes.length, activeLinks.length, layoutMode]);

    // [NEW] Layout Mode Effect
    useEffect(() => {
        if (!fgRefState || !graphData.nodes.length) return;

        const fg = fgRefState;
        const nodes = graphData.nodes as any[];

        console.log(`[Layout] Switching to ${layoutMode}`);

        // Reset DAG mode first (Safely)
        if (typeof fg.dagMode === 'function') {
            fg.dagMode(null);
        }

        // [FIX] Reset Camera & Reheat each time layout changes
        console.log("[Layout] Resetting camera and reheating simulation...");
        if (typeof fg.cameraPosition === 'function') {
            fg.cameraPosition({ x: 0, y: 100, z: 1200 }, { x: 0, y: 0, z: 0 }, 1000);
        }

        // [CRITICAL FIX] Verify internal engine exists before reheating to prevent 'tick' error
        // Wrap in requestAnimationFrame to ensure we don't tick during a React render phase
        requestAnimationFrame(() => {
            if (fg && typeof fg.d3ReheatSimulation === 'function') {
                try {
                    // Double check engine existence inside the frame
                    if (fg.d3Force && fg.d3Force('charge')) {
                        fg.d3ReheatSimulation();
                    }
                } catch (e) {
                    console.warn("[Layout] Failed to reheat simulation safely:", e);
                }
            }
        });

        // Reset Fixed Positions (release nodes)
        nodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });

        if (layoutMode === 'standard') {
            // Standard Forces (handled in previous effect)
            // [FIX] Increased repulsion to separate clusters and nodes
            if (fg.d3Force && fg.d3Force('charge')) {
                fg.d3Force('charge')
                    .strength(-40) // [FIX] Increased Repulsion (30 -> 40, ~33% increase)
                    .distanceMax(400); // [FIX] Limit repulsion range
            }
            // [FIX] Increase link distance to spread them out
            if (fg.d3Force('link')) {
                fg.d3Force('link')
                    .distance((link: any) => {
                        const sId = typeof link.source === 'object' ? link.source.id : link.source;
                        const tId = typeof link.target === 'object' ? link.target.id : link.target;
                        const isMain = sId === 'MAIN' || tId === 'MAIN';
                        return isMain ? 120 : (sId.includes('c_') || tId.includes('c_') ? 50 : 40);
                    }); // [FIX] Dynamic distance based on node type
            }
        }
        else if (layoutMode === 'hierarchical') {
            if (typeof fg.dagMode === 'function') {
                fg.dagMode('td'); // Top-Down
            }
            if (fg.d3Force && fg.d3Force('charge')) fg.d3Force('charge').strength(-100);
            if (typeof fg.d3ReheatSimulation === 'function') {
                try { fg.d3ReheatSimulation(); } catch (e) { }
            }
        }
        else if (layoutMode === 'grid') {
            // 3D Grid Layout
            const spacing = 80;
            const cols = Math.ceil(Math.pow(nodes.length, 1 / 3));
            nodes.forEach((node, i) => {
                const x = (i % cols) * spacing;
                const y = (Math.floor(i / cols) % cols) * spacing;
                const z = Math.floor(i / (cols * cols)) * spacing;
                node.fx = x - (cols * spacing) / 2;
                node.fy = y - (cols * spacing) / 2;
                node.fz = z - (cols * spacing) / 2;
            });
            if (typeof fg.d3ReheatSimulation === 'function') {
                try { fg.d3ReheatSimulation(); } catch (e) { }
            }
        }
        else if (layoutMode === 'radial') {
            // Concentric Spheres based on Group
            const groups = ['main', 'cluster', 'subtopic', 'brand', 'creator', 'media'];
            nodes.forEach((node, i) => {
                const groupIdx = groups.indexOf(node.group);
                const layer = groupIdx === -1 ? groups.length : groupIdx;
                const radius = 100 + (layer * 150);

                // Random angle on sphere surface
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos(2 * Math.random() - 1);

                node.fx = radius * Math.sin(phi) * Math.cos(theta);
                node.fy = radius * Math.sin(phi) * Math.sin(theta);
                node.fz = radius * Math.cos(phi);
            });
            if (typeof fg.d3ReheatSimulation === 'function') {
                try { fg.d3ReheatSimulation(); } catch (e) { }
            }
        }
        else if (layoutMode === 'bloom') {
            // "Big Bang" / Starburst
            // Main node at center, Clusters far out, others exploding
            nodes.forEach(node => {
                if (node.group === 'main') {
                    node.fx = 0; node.fy = 0; node.fz = 0;
                }
            });
            if (fg.d3Force && fg.d3Force('charge')) fg.d3Force('charge').strength(-500).distanceMax(5000);
            if (typeof fg.d3ReheatSimulation === 'function') {
                try { fg.d3ReheatSimulation(); } catch (e) { }
            }
        }

    }, [layoutMode, graphData.nodes, fgRefState]);

    // [NEW] Tour Loop Effect
    useEffect(() => {
        if (!isTourActive || !fgRefState || !graphData.nodes.length) return;

        // 1. Identify interesting nodes for the tour
        const validNodes = graphData.nodes.filter((n: any) =>
            n.group === 'cluster' ||
            n.group === 'creator' ||
            n.group === 'brand' ||
            (n.val && n.val > 5) // High value nodes
        ).sort((a: any, b: any) => (b.val || 0) - (a.val || 0)); // Sort by importance

        if (validNodes.length === 0) return;

        // 2. Select current target
        const targetNode = validNodes[tourIndex % validNodes.length];

        console.log(`[Tour] Visiting node ${tourIndex + 1}/${validNodes.length}:`, targetNode.label);

        // 3. Move Camera
        const distance = 150;
        const distRatio = 1 + distance / Math.hypot(targetNode.x, targetNode.y, targetNode.z);

        fgRefState.cameraPosition(
            { x: targetNode.x * distRatio, y: targetNode.y * distRatio, z: targetNode.z * distRatio }, // correct target
            { x: targetNode.x, y: targetNode.y, z: targetNode.z }, // lookAt
            3000 // Transition duration (3s flight)
        );

        // 4. Select Node (Trigger Analytics)
        if (onNodeClick) {
            onNodeClick(targetNode.id);
        }

        // 5. Schedule Next Step
        const timer = setTimeout(() => {
            setTourIndex(prev => prev + 1);
        }, 10000); // 10s delay

        return () => clearTimeout(timer);
    }, [isTourActive, tourIndex, graphData.nodes, fgRefState]);

    // [CLEANUP] Explicitly dispose of Three.js resources on unmount
    useEffect(() => {
        return () => {
            console.log("[FandomGraph3D] Cleaning up graph resources...");

            // 0. [CRITICAL] Cancel all active animations
            animationFrameIds.current.forEach(id => cancelAnimationFrame(id));
            animationFrameIds.current.clear();
            console.log("[FandomGraph3D] Cancelled all animation frames.");

            // 1. Stop Simulation
            if (fgRefState) {
                try {
                    console.log("[FandomGraph3D] Stopping Simulation & Animation...");
                    // [HACK] Guard against 'removeEventListener' error by nulling internal handlers before pause
                    if ((fgRefState as any)._controls) (fgRefState as any)._controls.enabled = false;

                    fgRefState.pauseAnimation();
                    // Hard stop the D3 engine
                    if (fgRefState.d3Alpha) fgRefState.d3Alpha(0);
                } catch (e) {
                    console.warn("Could not pause animation safely:", e);
                }
            }

            // 2. Dispose Caches
            // Create a Set of shared geometries for fast lookup
            const sharedGeometrySet = new Set(Object.values(SHARED_GEOMETRIES));

            nodeCache.current.forEach((obj) => {
                obj.traverse((child: any) => {
                    // Dispose geometries (but NOT shared geometries)
                    if (child.geometry && !sharedGeometrySet.has(child.geometry)) {
                        child.geometry.dispose();
                    }
                    // Materials are cached, so we don't dispose them here
                    // They'll be disposed in the material cache cleanup
                });
            });
            nodeCache.current.clear();

            nodeCache.current.clear();

            // 2b. Dispose Material Cache
            materialCache.current.forEach((material) => material.dispose());
            materialCache.current.clear();

            // 2c. Dispose Hit Area Material
            if (hitAreaMaterial.current) {
                hitAreaMaterial.current.dispose();
                hitAreaMaterial.current = null;
            }

            // 2d. Dispose Hit Area Geometries
            hitAreaGeometryCache.current.forEach((geometry) => geometry.dispose());
            hitAreaGeometryCache.current.clear();

            // 3. Clear Scene (Safe Mode)
            // We do NOT dispose the renderer here as it kills the WebGL context for future renders.
            // React & Browsers will handle the canvas and context GC.
            // 3. Clear Scene & Dispose Renderer (CRITICAL FOR LEAK PREVENTION)
            if (fgRefState) {
                const scene = fgRefState.scene();
                if (scene) {
                    // Dispose all children manually
                    scene.traverse((object: any) => {
                        if (object.geometry) object.geometry.dispose();
                        if (object.material) {
                            if (Array.isArray(object.material)) {
                                object.material.forEach((m: any) => m.dispose());
                            } else {
                                object.material.dispose();
                            }
                        }
                    });
                    scene.clear();
                }

                // const renderer = fgRefState.renderer();
                // if (renderer) {
                //     console.log("[FandomGraph3D] Disposing WebGL Renderer to prevent context leak...");
                //     renderer.dispose();

                //     // Force context loss to prevent "Too many active WebGL contexts"
                //     const gl = renderer.getContext();
                //     const looseContextExt = gl?.getExtension('WEBGL_lose_context');
                //     if (looseContextExt) {
                //         looseContextExt.loseContext();
                //     }

                //     renderer.domElement = null;
                // }
            }

            sceneInitialized.current = false; // Reset for next mount
        };
    }, []); // Run ONLY on true unmount



    /* [DEBUG] Bloom Disabled - Removed UnrealBloomPass import
    useEffect(() => {
        if (!fgRefState) return;
        const composer = fgRefState.postProcessingComposer();
        if (!composer) return;
     
        // Remove existing bloom pass if any
        // composer.passes.forEach((pass: any, index: number) => {
        //    if (pass instanceof UnrealBloomPass) {
        //        composer.passes.splice(index, 1);
        //    }
        // });
    }, [bloomStrength]);
    */

    // --- CAMERA & AUTOPILOT LOGIC ---
    const isFirstLoad = useRef(true);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

    // --- CAMERA INITIALIZATION & DATA-DRIVEN RESET ---
    useEffect(() => {
        const dataHash = `${graphData.nodes.length}-${graphData.links.length}-${query || ''}`;
        const isNewData = dataHash !== lastDataHash.current;

        if (fgRefState && (isFirstLoad.current || isNewData) && graphData.nodes.length > 0) {
            console.log("[FandomGraph3D] Data change or first load detected. Resetting camera. Nodes:", graphData.nodes.length);

            const timer = setTimeout(() => {
                if (!fgRefState) return;
                const controls = fgRefState.controls();
                if (controls) {
                    controls.enablePan = true;
                    controls.enableDamping = true;
                    controls.dampingFactor = 0.1;
                    controls.rotateSpeed = 0.5;
                    controls.target.set(0, 0, 0); // [CRITICAL] Reset look-at target to origin

                    // Initial Camera Position
                    fgRefState.cameraPosition(
                        { x: 0, y: 0, z: initialZoom || 400 }, // Back off significantly
                        { x: 0, y: 0, z: 0 },
                        isFirstLoad.current ? 2000 : 800 // Shorter transition for resets
                    );
                }
            }, 300); // Slightly shorter wait

            isFirstLoad.current = false;
            lastDataHash.current = dataHash;
            return () => clearTimeout(timer);
        }
    }, [fgRefState, graphData.nodes.length, graphData.links.length, initialZoom, query]);

    // [REMOVED] Legacy Auto-Rotation Manager (Conflicted with new 10s timer)
    // The new logic uses onPointer events on the container to manage rotation state.

    // --- FOCUS NODE LOGIC ---
    useEffect(() => {
        if (focusedNodeId && fgRefState) {
            const targetNode = graphData.nodes.find((n: any) =>
                (n.id && n.id === focusedNodeId) ||
                (n.label && typeof n.label === 'string' && n.label.toLowerCase() === focusedNodeId.toLowerCase()) ||
                (n.id && typeof n.id === 'string' && n.id.toLowerCase() === focusedNodeId.toLowerCase())
            );

            if (targetNode && targetNode.x !== undefined) {
                const distance = 200;
                const dist = Math.hypot(targetNode.x, targetNode.y, targetNode.z);

                // Handle case where node is at (0,0,0)
                const newPos = dist < 1
                    ? { x: 0, y: 0, z: distance }
                    : {
                        x: targetNode.x * (1 + distance / dist),
                        y: targetNode.y * (1 + distance / dist),
                        z: targetNode.z * (1 + distance / dist)
                    };

                fgRefState.cameraPosition(
                    newPos,
                    targetNode,
                    2000
                );
            }
        }
    }, [focusedNodeId, graphData]);

    // --- TOUR MODE LOGIC ---
    // --- TOUR MODE LOGIC ---
    useEffect(() => {
        if (!enableTour || !fgRefState || activeNodes.length === 0) return;

        console.log("[FandomGraph3D] Starting Tour Mode...");

        // Cycle through ALL nodes as requested
        const tourNodes = activeNodes;

        const interval = setInterval(() => {
            setTourIndex(prev => {
                const nextIdx = (prev + 1) % tourNodes.length;
                const targetNode = tourNodes[nextIdx];

                if (targetNode && targetNode.x !== undefined && fgRefState) {
                    // 1. Simulate Click
                    console.log(`[Tour] Visiting: ${targetNode.id}`);
                    if (onNodeClick) onNodeClick(targetNode.id); // [TOUR] Report Selection
                    // Also trigger hover visual for immediate feedback
                    handleNodeHover(targetNode, null);

                    // 2. Move Camera
                    const distance = 200; // Tour viewing distance
                    const dist = Math.hypot(targetNode.x, targetNode.y, targetNode.z);
                    const newPos = dist < 1
                        ? { x: 0, y: 0, z: distance }
                        : {
                            x: targetNode.x * (1 + distance / dist),
                            y: targetNode.y * (1 + distance / dist),
                            z: targetNode.z * (1 + distance / dist)
                        };

                    fgRefState.cameraPosition(newPos, targetNode, 2500); // 2.5s travel time
                }

                return nextIdx;
            });
        }, 9500); // 2500ms travel + 7000ms pause

        return () => clearInterval(interval);
    }, [enableTour, activeNodes, fgRefState]);




    // --- NODE RENDERING ---
    const nodeThreeObject = useCallback((node: any) => {
        // [DIAGNOSTIC] Log every 10th node to avoid spam
        if (Math.random() < 0.1) {
            console.log(`[FandomGraph3D] Rendering node: ${node.id} (${node.group}) at scale ${node.val || 'default'}`);
        }
        // [COLOR] Force Theme Color for Main, otherwise use group color
        const color = (node.group === 'main' || node.id === 'MAIN')
            ? '#ffffff' // [FIX] Always white as per user request
            : (node.color || getNodeColor(node.group, visualTheme));


        // 2. [CACHE CHECK] Return existing group if we have it to preserve simulation
        if (nodeCache.current.has(node.id)) {
            return nodeCache.current.get(node.id)!;
        }

        const group = new THREE.Group();
        group.userData = { id: node.id, group: node.group };

        // [THEME] Apply Themed Shape if available (For key nodes)
        let isThemed = false;
        // [SIMPLIFIED SCALING]
        // Significantly increased for visibility
        let rawRadius = node.val || 12;
        if (node.group === 'main' || node.id === 'MAIN') {
            rawRadius = 60;
        } else if (node.group === 'cluster') {
            rawRadius = 40;
        } else if (node.group === 'topic') {
            rawRadius = 18; // [FIX] Increased by 50% (12 -> 18)
        } else {
            rawRadius = 12; // Base size for visibility
        }
        const radius = Math.max(1, Math.min(80, rawRadius));

        // [PERFORMANCE] Use shared geometries (Flyweight Pattern)
        // Instead of creating new geometry for each node, reuse shared instances
        let baseGeometry: THREE.BufferGeometry;

        // [FEATURE] distinct geometric shapes per node type
        switch (node.group) {
            case 'cluster':
                baseGeometry = SHARED_GEOMETRIES.icosahedron;
                break;
            case 'creator':
            case 'brand':
            case 'concept':
                baseGeometry = SHARED_GEOMETRIES.dodecahedron;
                break;
            case 'media':
            case 'post':
                baseGeometry = SHARED_GEOMETRIES.cone;
                break;
            case 'subtopic':
                baseGeometry = SHARED_GEOMETRIES.octahedron;
                break;
            case 'main':
                baseGeometry = SHARED_GEOMETRIES.tetrahedron;
                break;
            default:
                baseGeometry = SHARED_GEOMETRIES.sphere;
                break;
        }

        // [NEW] Popularity Tier System - Visual differentiation by follower count
        const getPopularityTier = (node: any) => {
            const followers = node.data?.followers || node.data?.followersCount || node.data?.followerCount || 0;
            if (followers >= 1000000) return 'mega';      // 1M+ followers
            if (followers >= 100000) return 'rising';     // 100K-1M
            if (followers >= 10000) return 'emerging';    // 10K-100K
            return 'micro';                                // <10K
        };

        const tier = (node.group === 'creator' || node.group === 'brand' || node.group === 'profile')
            ? getPopularityTier(node)
            : null;


        // [PERFORMANCE] Use cached materials with emissive glow
        const flatShading = node.group !== 'main';
        // The 'tier' variable is already declared above, so we remove the redeclaration here.

        // Default settings for non-tiered nodes
        let emissiveColor = '#000000';
        let emissiveIntensity = 0;

        // Tier visuals configuration
        const tierSettings = {
            mega: { color: '#FFD700', size: radius * 3.5, opacity: 0.8, emissive: '#FFA500', intensity: 0.8 },
            rising: { color: '#FF1493', size: radius * 3.0, opacity: 0.6, emissive: '#FF69B4', intensity: 0.5 },
            emerging: { color: '#00CED1', size: radius * 2.5, opacity: 0.4, emissive: '#40E0D0', intensity: 0.3 }
        };

        if (tier && tier !== 'micro') {
            const s = tierSettings[tier];
            emissiveColor = s.emissive;
            emissiveIntensity = s.intensity;
        }

        const materialKey = `${color}-${flatShading ? 'flat' : 'smooth'}-${tier || 'default'}`;

        let shinyMaterial: THREE.MeshStandardMaterial;
        if (materialCache.current.has(materialKey)) {
            shinyMaterial = materialCache.current.get(materialKey)!;
        } else {
            shinyMaterial = new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.8,
                roughness: 0.1,
                wireframe: false,
                flatShading: flatShading,
                emissive: emissiveColor,
                emissiveIntensity: emissiveIntensity
            });
            materialCache.current.set(materialKey, shinyMaterial);
        }

        // [PERFORMANCE] Create the main mesh
        const mesh = new THREE.Mesh(baseGeometry, shinyMaterial);
        mesh.scale.setScalar(radius);
        group.add(mesh); // <--- RESTORED MESH

        // [PERFORMANCE] Memoized Glow Texture
        if (tier && tier !== 'micro') {
            // Use global cache for texture to prevent memory leak
            if (!(window as any).fandomGlowTexture) {
                const glowColor = '#FFD700';
                (window as any).fandomGlowTexture = new THREE.TextureLoader().load(
                    'data:image/svg+xml;base64,' + btoa(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
                            <defs>
                                <radialGradient id="glow">
                                    <stop offset="0%" style="stop-color:${glowColor};stop-opacity:0.6"/>
                                    <stop offset="50%" style="stop-color:${glowColor};stop-opacity:0.3"/>
                                    <stop offset="100%" style="stop-color:${glowColor};stop-opacity:0"/>
                                </radialGradient>
                            </defs>
                            <circle cx="64" cy="64" r="64" fill="url(#glow)"/>
                        </svg>
                    `)
                );
            }

            const settings = tierSettings[tier];
            if (settings) {
                const glowMaterial = new THREE.SpriteMaterial({
                    map: (window as any).fandomGlowTexture,
                    color: settings.color,
                    transparent: true,
                    opacity: settings.opacity,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });

                const glowSprite = new THREE.Sprite(glowMaterial);
                glowSprite.scale.setScalar(settings.size);
                group.add(glowSprite);

                if (tier === 'mega') {
                    group.userData.pulseAnimation = true;
                }
            }
        }

        // [REMOVED] Profile Picture Rendering as per user request to prevent crashes

        // [FIX] Transparent hit area for precise interaction 
        // [PERFORMANCE] Use shared material and cached geometry to prevent memory leak
        if (!hitAreaMaterial.current) {
            hitAreaMaterial.current = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false
            });
        }

        // Cache geometries by radius to reuse across nodes of same size
        const hitAreaRadius = radius * 1.15;
        const radiusKey = Math.round(hitAreaRadius * 100) / 100; // Round to 2 decimals for cache key

        if (!hitAreaGeometryCache.current.has(radiusKey)) {
            hitAreaGeometryCache.current.set(radiusKey, new THREE.SphereGeometry(hitAreaRadius));
        }

        const hitArea = new THREE.Mesh(
            hitAreaGeometryCache.current.get(radiusKey)!,
            hitAreaMaterial.current
        );
        group.add(hitArea);

        // Cache the entire group for performance
        nodeCache.current.set(node.id, group);

        // [FIX] Render Text Labels for Structural Nodes (Clusters ONLY - Hub hidden as per user request)
        if (node.group === 'cluster') {
            try {
                const labelText = node.label || node.id;
                // [FIX] Robust SpriteText constructor detection for CJS/ESM compatibility
                const ST: any = (SpriteText as any).default || SpriteText;

                if (typeof ST !== 'function' && typeof ST?.default === 'function') {
                    // One more layer of safety
                    const sprite = new (ST.default)(labelText);
                    applySpriteStyles(sprite, node, radius);
                    group.add(sprite);
                } else if (typeof ST === 'function') {
                    const sprite = new ST(labelText);
                    applySpriteStyles(sprite, node, radius);
                    group.add(sprite);
                } else {
                    console.error("[FandomGraph3D] SpriteText is NOT a constructor! Skipping label.");
                }
            } catch (err) {
                console.warn("[FandomGraph3D] Failed to render SpriteText label:", err);
            }
        }

        return group;
    }, [visualTheme]);

    // Helper to apply consistent styling to sprites
    const applySpriteStyles = (sprite: any, node: any, radius: number) => {
        sprite.fontFace = 'ui-sans-serif, system-ui, sans-serif';
        sprite.fontFace = 'ui-sans-serif, system-ui, sans-serif';
        sprite.fontWeight = '500'; // [FIX] Medium weight
        sprite.textHeight = (node.group === 'main' || node.id === 'MAIN') ? 6 : 4;
        sprite.color = '#ffffff';
        sprite.backgroundColor = 'rgba(0,0,0,0.6)';
        sprite.padding = 1.5;
        sprite.borderRadius = 2;
        sprite.renderOrder = 999;
        sprite.material.depthTest = false;
        sprite.material.depthWrite = false;
        // [FIX] Moved closer to center (removed 1.5x multiplier)
        sprite.position.y = -(radius + 8);
        sprite.raycast = () => null;
    };

    const transitionScale = useCallback((obj: any, targetScale: number) => {
        if (!obj) return;
        const startScale = obj.scale.x;
        const startTime = Date.now();
        const duration = 200;

        const animate = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = startScale + (targetScale - startScale) * ease;
            obj.scale.setScalar(current);

            if (progress < 1) {
                const frameId = requestAnimationFrame(animate);
                animationFrameIds.current.add(frameId); // [PERFORMANCE] Track for cleanup
            }
        };
        const initialFrameId = requestAnimationFrame(animate);
        animationFrameIds.current.add(initialFrameId); // [PERFORMANCE] Track for cleanup
    }, []);

    const handleNodeHover = useCallback((node: any | null, prevNode: any | null) => {
        if (prevNode && prevNode.__threeObj) {
            transitionScale(prevNode.__threeObj, 1.0);
        }

        // --- HIGHLIGHTING ---
        const nodes = new Set();
        const links = new Set();

        if (node) {
            nodes.add(node.id);
            activeLinks.forEach((link: any) => {
                if (link.source.id === node.id || link.target.id === node.id) {
                    links.add(link);
                    nodes.add(link.source.id);
                    nodes.add(link.target.id);
                }
            });

            if (node.__threeObj) {
                transitionScale(node.__threeObj, 1.3);
            }
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'default';
        }

        setHoverNode(node || null);
        setHighlightNodes(nodes);
        setHighlightLinks(links);
    }, [activeLinks, transitionScale]);

    // [FIX] Click vs Drag Discrimination
    const handleNodeClick = useCallback((node: any) => {
        // [FIX] Strict Drag Detection
        if (isDragging.current) {
            console.log("Click ignored due to active drag");
            return;
        }

        if (onNodeClick) onNodeClick(node.id);

        // [NEW] Node Drift Prevention: Preserve positions in locked layouts
        const isLockedLayout = layoutMode === 'grid' || layoutMode === 'radial' || layoutMode === 'hierarchical';
        if (isLockedLayout) {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
        }

        if (fgRefState) {
            // [NEW] Coordinate camera move
            isClickingNode.current = true;
            const distance = 80;
            const dist = Math.hypot(node.x, node.y, node.z);

            // [FIX] GLITCH PREVENTION: Use static target coordinates
            // Passing the raw 'node' object causes the camera to track it while it's still moving due to physics,
            // which creates the "glitching into position" effect.
            const staticTarget = { x: node.x, y: node.y, z: node.z };

            // Handle case where node is at (0,0,0) -> Fallback to predefined offset
            const newPos = dist < 1
                ? { x: 0, y: 0, z: distance }
                : {
                    x: node.x * (1 + distance / dist),
                    y: node.y * (1 + distance / dist),
                    z: node.z * (1 + distance / dist)
                };

            // [NEW] Freeze simulation briefly to ensure smooth travel
            if (fgRefState.d3AlphaTarget) fgRefState.d3AlphaTarget(0);

            fgRefState.cameraPosition(
                newPos,       // new position
                staticTarget, // [FIX] Use static coordinates for lookAt
                1200          // Slightly faster for better UX
            );

            // [NEW] Reset click flag after animation
            setTimeout(() => {
                isClickingNode.current = false;
            }, 1200);
        }
    }, [onNodeClick, fgRefState, layoutMode]);

    const handleBackgroundClick = useCallback(() => {
        // Optional: Reset view logic here
    }, []);

    // Memoize link styling functions
    const getLinkColor = useCallback((link: any) => {
        if (highlightLinks.has(link)) return '#34d399'; // Brighter on hover
        // const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
        // const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
        return 'rgba(6, 78, 59, 0.5)'; // [FIX] Uniform 50% opacity
    }, [highlightLinks]);

    const getLinkWidth = useCallback((link: any) => {
        if (highlightLinks.has(link)) return 2;
        return 1; // [FIX] Uniform 1px width
    }, [highlightLinks]);

    const getLinkCurve = useCallback((link: any) => {
        try {
            const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
            const tId = String(typeof link.target === 'object' ? link.target.id : link.target);

            // [FIX] Access nodeInfo via graphData prop
            const sInfo = (graphData as any).nodeInfo?.get(sId);
            const tInfo = (graphData as any).nodeInfo?.get(tId);

            const sGroup = sInfo?.group || '';
            const tGroup = tInfo?.group || '';

            // Core connections (Hub <-> Cluster) get strong curves
            const isMainConnection = sId === 'MAIN' || tId === 'MAIN' || sGroup === 'main' || tGroup === 'main';
            if (isMainConnection) {
                return 0.7; // Heavy visible arc
            }

            // Cluster-Cluster connections or big groups
            if (sGroup === 'cluster' || tGroup === 'cluster') {
                return 0.5;
            }

        } catch (e) { }
        return 0.15; // Subtle arc for everything else
    }, [graphData]);


    const getLinkParticles = useCallback((link: any) => {
        // [PERFORMANCE] Particles disabled for smoothness
        return 0;
        /*
        const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
        const sInfo = (graphData as any).nodeInfo?.get(sId);
        const tInfo = (graphData as any).nodeInfo?.get(tId);
        const isCore = sInfo?.group === 'main' || tInfo?.group === 'main' || sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId === 'MAIN' || tId === 'MAIN';
    
        return isCore ? 4 : 0;
        */
    }, [graphData]);

    const getLinkParticleSpeed = useCallback((link: any) => {
        const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
        const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
        const sInfo = (graphData as any).nodeInfo?.get(sId);
        const tInfo = (graphData as any).nodeInfo?.get(tId);
        const isCore = sInfo?.group === 'main' || tInfo?.group === 'main' || sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId === 'MAIN' || tId === 'MAIN';

        return isCore ? 0.005 : 0.001;
    }, [graphData]);

    const getLinkParticleColor = useCallback(() => '#10b981', []);


    // [REMOVED] Redundant ResizeObserver

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-[#051810] relative"
        >
            {/* [REMOVED] Reset Camera Button */}
            {/* [REMOVED] Debug Data Monitor */}


            {/* [NEW] Empty State Handler */}
            {
                graphData.nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                        <div className="bg-black/60 backdrop-blur border border-emerald-500/30 p-6 rounded-xl text-center">
                            <div className="text-emerald-400 font-bold mb-2">No Graph Data</div>
                            <div className="text-emerald-500/70 text-xs text-balance max-w-[200px]">
                                The analysis returned no mappable nodes. Try a different query.
                            </div>
                        </div>
                    </div>
                )
            }
            {/* [NEW] Floating Query Label */}
            {
                query && (
                    <div
                        className={`absolute top-6 left-6 z-10 pointer-events-none transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${isOpen ? 'translate-x-0' : 'translate-x-0'}`}
                        style={{
                            padding: '12px 20px',
                            background: 'rgba(5, 24, 16, 0.7)',
                            backdropFilter: 'blur(12px)',
                            border: '1px border rgba(16, 185, 129, 0.2)',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                        }}
                    >
                        <div className="text-[10px] text-emerald-500/60 uppercase tracking-[0.2em] font-bold mb-1">Active Query</div>
                        <div className="text-[9px] font-light text-white tracking-tight">{query}</div>
                    </div>
                )
            }

            <div id="force-graph-container" className="absolute inset-0 flex items-center justify-center">
                <ForceGraph3D
                    ref={setFgRef as any}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeLabel={(node: any) => node.label || node.id || ''} // SIMPLIFIED LABEL
                    nodeThreeObject={nodeThreeObject}
                    // [FIX] Refined thinner links
                    // [FIX] Dark midnight emerald links
                    linkColor={getLinkColor}
                    linkWidth={getLinkWidth}
                    linkOpacity={0.5} // [FIX] Global 50% opacity
                    enableNodeDrag={true} // [FIX] Always enable dragging for better feel
                    enablePointerInteraction={true}

                    // [FIX] Interaction & Physics Tuning
                    // nodeDragThreshold={1} // [REMOVED] Not supported in this version
                    d3AlphaDecay={0.05} // [FIX] Faster settling (default ~0.0228)
                    d3VelocityDecay={0.4} // [FIX] More friction (default 0.4 is standard, raising slightly helps stability)
                    cooldownTime={3000} // [FIX] Stop simulation after 3s if stable


                    showNavInfo={false}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                    onNodeDrag={(node: any) => {
                        // [FIX] Explicitly stop rotation to prevent camera shift while dragging
                        isDragging.current = true;

                        // Pause controls during drag to prevent competition
                        if (fgRefState) {
                            if (fgRefState.controls) fgRefState.controls.enabled = false;
                            // [PHYSICS] Keep simulation active while dragging (Safeguard check)
                            if (typeof fgRefState.d3AlphaTarget === 'function') {
                                fgRefState.d3AlphaTarget(0.3);
                            } else if (fgRefState.d3ReheatSimulation) {
                                fgRefState.d3ReheatSimulation();
                            }
                        }
                    }}
                    onNodeDragEnd={(node: any) => {
                        isDragging.current = false;
                        // Resume controls
                        // Resume controls
                        if (fgRefState) {
                            if (fgRefState.controls) fgRefState.controls.enabled = true;
                            // [PHYSICS] Let simulation cool down
                            if (typeof fgRefState.d3AlphaTarget === 'function') {
                                fgRefState.d3AlphaTarget(0);
                            }
                        }

                        // Release node position after drag
                        // [FIX] Release node position to allow physics to take over
                        // [NEW] UNLESS we are in a locked layout
                        const isLockedLayout = layoutMode === 'grid' || layoutMode === 'radial' || layoutMode === 'hierarchical';
                        if (!isLockedLayout) {
                            node.fx = null;
                            node.fy = null;
                            node.fz = null;
                        }

                        // Reheat
                        if (fgRefState && fgRefState.d3ReheatSimulation) {
                            fgRefState.d3ReheatSimulation();
                        }
                    }}
                    onBackgroundClick={handleBackgroundClick}

                    dagMode={
                        layoutMode === 'hierarchical' ? 'td' : undefined
                    }
                    dagLevelDistance={layoutMode === 'standard' ? undefined : 200}
                    // [LAYOUT] Arched Hub Connections
                    linkCurvature={getLinkCurve}
                    // [PULSE] Core Arched links get energetic particles
                    linkDirectionalParticles={getLinkParticles}
                    linkDirectionalParticleSpeed={getLinkParticleSpeed}
                    linkDirectionalParticleWidth={1.8}
                    linkDirectionalParticleColor={getLinkParticleColor}
                    backgroundColor="rgba(0,0,0,0)" // [RESTORED] Transparent
                    rendererConfig={{ alpha: true, preserveDrawingBuffer: false }} // [OPTIMIZED] Disable preserveDrawingBuffer

                    warmupTicks={50} // [FIX] Increase warmup
                    cooldownTicks={Infinity} // [FIX] Keep engine running, let our manual logic handle pause

                />
            </div>
            {/* Layout Mode Switcher */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                <div className="text-[10px] text-emerald-500/50 font-mono pointer-events-none">
                    LEFT CLICK: ROTATE • SCROLL: ZOOM • RIGHT CLICK: PAN • BG CLICK: RESET
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    <span className="text-[10px] text-emerald-500/70 font-mono uppercase tracking-wider">Layout:</span>
                    <button
                        onClick={() => {
                            const modes: typeof layoutMode[] = ['standard', 'grid', 'hierarchical', 'radial', 'bloom'];
                            const nextIdx = (modes.indexOf(layoutMode) + 1) % modes.length;
                            setLayoutMode(modes[nextIdx]);
                        }}
                        className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors"
                    >
                        Layout: {layoutMode.toUpperCase()}
                    </button>
                    {/* [NEW] TOUR TOGGLE */}
                    <button
                        onClick={() => {
                            setIsTourActive(!isTourActive);
                        }}
                        className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border rounded transition-all duration-300 flex items-center gap-2 ${isTourActive
                            ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${isTourActive ? 'bg-black animate-pulse' : 'bg-emerald-500/40'}`} />
                        TOUR: {isTourActive ? 'ON' : 'OFF'}
                    </button>
                    {/* [NEW] DEBUG DATA TOGGLE */}
                    <button
                        onClick={() => setShowDebug(true)}
                        className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors"
                    >
                        DEBUG JSON
                    </button>

                    {/* [NEW] ENRICHMENT LOZENGE */}
                    {isEnriching && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                            <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">ENRICHING...</span>
                        </div>
                    )}
                </div>
            </div>

            {/* [NEW] DEBUG DATA MODAL */}
            {
                showDebug && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
                        <div className="bg-slate-900 border border-emerald-500/30 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
                            <div className="flex items-center justify-between p-4 border-b border-emerald-500/20 bg-slate-900/50">
                                <h3 className="text-emerald-400 font-mono text-sm uppercase tracking-wider">Graph Data Debug</h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const dataStr = JSON.stringify(graphData, null, 2);
                                            navigator.clipboard.writeText(dataStr);
                                        }}
                                        className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-mono rounded hover:bg-emerald-500/30 transition-colors"
                                    >
                                        COPY JSON
                                    </button>
                                    <button
                                        onClick={() => setShowDebug(false)}
                                        className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs font-mono rounded hover:bg-red-500/30 transition-colors"
                                    >
                                        CLOSE
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-400">
                                <pre>{JSON.stringify({
                                    nodeCount: graphData.nodes.length,
                                    linkCount: graphData.links.length,
                                    nodes: graphData.nodes,
                                    links: graphData.links
                                }, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* [NEW] Legend Component - Controlled by Prop */}
            {showLegend && <GraphLegend visualTheme={visualTheme} />}
        </div>
    );
};



export default FandomGraph3D;

