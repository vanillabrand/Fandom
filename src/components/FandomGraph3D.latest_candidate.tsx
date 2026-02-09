// [FIX] Force rebuild v3 - Diagnostic Mode
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { forceCollide } from 'd3-force-3d';
// [REMOVED] imports for custom shapes
import { useGraphScene } from '../hooks/useGraphScene.js';
import { Node, Link } from '../../types.js';
import GraphLegend from './GraphLegend.js';
import { useAuth } from '../contexts/AuthContext.js';

// [PERFORMANCE] Shared Geometry Cache (Flyweight Pattern)
// Create geometries ONCE and reuse across all nodes to prevent memory bloat
const SHARED_GEOMETRIES = {
    sphere: new THREE.SphereGeometry(1, 16, 16),
    icosahedron: new THREE.IcosahedronGeometry(1, 0),
    dodecahedron: new THREE.DodecahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 2, 16),
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
    visualTheme?: { // [NEW] Themed Props
        archetype?: string; // [MODIFIED] Relaxed to string to matching types.ts
        nodeTypeMapping?: Record<string, string>; // [MODIFIED] Allow dynamic string IDs
        // models removed as per user request
        primaryColor: string;
        textureStyle: string;
    };
}

const getNodeColor = (group: string) => {
    // Handle undefined or empty group
    if (!group) return '#9ca3af'; // Default gray for unknown groups

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
        case 'main': return '#ffffff';
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
    const textureCache = useRef<Map<string, THREE.Texture>>(new Map()); // [NEW] Texture cache
    const materialCache = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map()); // [PERFORMANCE] Material cache to prevent memory leaks
    const hitAreaMaterial = useRef<THREE.MeshBasicMaterial | null>(null); // [FIX] Shared hit area material
    const hitAreaGeometryCache = useRef<Map<number, THREE.SphereGeometry>>(new Map()); // [FIX] Cache hit area geometries
    const rotationTimer = useRef<NodeJS.Timeout | null>(null);
    const isUserInteracting = useRef(false);
    const isDragging = useRef(false); // [NEW] Track drag state to prevent focus slip
    const rotationFrameId = useRef<number | null>(null);


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

    // [FIX] Manual Rotation Loop
    const animateRotation = useCallback(() => {
        const fg = fgRefState;
        if (!fg) return;

        // 1. Camera Orbit
        if (fg && !isUserInteracting.current) {
            const camPos = fg.cameraPosition();
            const controls = fg.controls();
            const target = controls.target;

            // Relative position to target
            const relX = camPos.x - target.x;
            const relZ = camPos.z - target.z;

            const dist = Math.sqrt(relX * relX + relZ * relZ);
            const currentAngle = Math.atan2(relX, relZ);
            const newAngle = currentAngle + 0.001;

            const newX = target.x + dist * Math.sin(newAngle);
            const newZ = target.z + dist * Math.cos(newAngle);

            fg.cameraPosition(
                { x: newX, y: camPos.y, z: newZ },
                target,
                0
            );
        }

        // [NEW] Starfield & Hero Object Animation (Always Rotate)
        if (fg) {
            const scene = fg.scene();

            // Starfield
            const starfield = scene.getObjectByName('starfield');
            if (starfield) {
                starfield.rotation.y += 0.0003;
                starfield.rotation.x += 0.0001;
            }

            // [HERO SPIN] Micro-rotate the 3D nodes
            // We traverse the scene to find our tagged meshes
            scene.traverse((obj: any) => {
                if (obj.userData && obj.userData.isHero) {
                    obj.rotation.y += (obj.userData.spinSpeed || 0.01);
                    obj.rotation.x += (obj.userData.spinSpeed || 0.01) * 0.5;
                }
            });
        }

        rotationFrameId.current = requestAnimationFrame(animateRotation);
    }, [fgRefState]);

    // [NEW] Dynamic Visuals Loop: Distance-Aware Bloom & Post-Count Pulse
    // [REMOVED] updateDynamicVisuals loop as distance-fading is disabled.

    const startRotation = useCallback((delayMs = 1000) => {
        if (isDragging.current) return; // [FIX] Don't rotate if we are dragging a node
        isUserInteracting.current = false;
        if (rotationTimer.current) clearTimeout(rotationTimer.current);

        // Cancel any existing loop to prevent double-speed
        if (rotationFrameId.current) cancelAnimationFrame(rotationFrameId.current);

        rotationTimer.current = setTimeout(() => {
            if (!isUserInteracting.current) {
                animateRotation();
            }
        }, delayMs);
    }, [animateRotation]);

    const stopRotation = useCallback(() => {
        isUserInteracting.current = true;
        if (rotationTimer.current) clearTimeout(rotationTimer.current);
        if (rotationFrameId.current) cancelAnimationFrame(rotationFrameId.current);
    }, []);

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
                // Track Alpha safely
                if (typeof fgRefState.d3Alpha === 'function') {
                    (window as any).D3Alpha = fgRefState.d3Alpha();
                }
            }
            // requestAnimationFrame(check); // [FIX] Stop infinite polling to reduce noise/risk
        };
        requestAnimationFrame(check);
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

            // Pause simulation to reduce load
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

            // Reheat simulation to re-render
            if (fgRefState.d3ReheatSimulation) {
                fgRefState.d3ReheatSimulation();
            }
        };

        const handleContextCreationError = (event: Event) => {
            console.error('[FandomGraph3D] WebGL context creation failed:', event);
            // TODO: Show user-friendly error message
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
        textureCache.current.clear();
        // Note: materialCache is NOT cleared here - materials are reusable across data changes

        // Strict Node Sanitization
        const validNodes: any[] = [];
        const validNodeIds = new Set<string>();

        activeNodes.forEach((n: any) => {
            // Must have a valid string or number ID
            if (n.id !== undefined && n.id !== null && n.id !== '') {
                const newNode = { ...n };
                validNodes.push(newNode);
                validNodeIds.add(String(n.id));
            } else {
                console.warn("[FandomGraph3D] Dropping invalid node (missing ID):", n);
            }
        });

        // Strict Link Sanitization
        const validLinks = activeLinks
            .map((l: any) => {
                // Ensure we extract raw string IDs if they were already objectified
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                return { ...l, source: String(sourceId), target: String(targetId) };
            })
            .filter((l: any) => {
                const hasSource = validNodeIds.has(l.source);
                const hasTarget = validNodeIds.has(l.target);

                if (!hasSource || !hasTarget) {
                    // console.warn(`[FandomGraph3D] Dropping link with invalid endpoints: ${l.source} -> ${l.target}`);
                    return false;
                }

                // [DIAGNOSTIC] Log Main Links
                if (l.source === 'MAIN' || l.target === 'MAIN') {
                    console.log(`[FandomGraph3D] Valid Link to MAIN found: ${l.source} -> ${l.target}`);
                }

                return true;
            });

        console.log(`[FandomGraph3D] Sanitized Graph: ${validNodes.length} nodes, ${validLinks.length} links`);

        const nodeInfoMap = new Map<string, any>();
        validNodes.forEach(n => {
            nodeInfoMap.set(String(n.id), { group: n.group, label: n.label });
        });

        console.log("[FandomGraph3D] Processing graphData. Nodes:", validNodes.length, "Links:", validLinks.length);
        return {
            nodes: validNodes,
            links: validLinks,
            nodeInfo: nodeInfoMap
        };
    }, [activeNodes.length, activeLinks.length, activeNodes[0]?.id, activeLinks[0]?.id]); // Use primitive keys for stability

    useEffect(() => {
        // [FORCE CACHE CLEAR] on mount and data transition
        nodeCache.current.clear();
        textureCache.current.clear();

        // [NEW] Force Camera Reset & Add Test Object
        if (fgRefState) {
            console.log("[FandomGraph3D] Resetting camera to fixed distance...");

            // Allow simulation to expand before positioning
            setTimeout(() => {
                // FIXED POSITION instead of zoomToFit
                // Move camera further back (z: 1200) to ensure everything is in view
                fgRefState.cameraPosition({ x: 0, y: 100, z: 1200 }, { x: 0, y: 0, z: 0 }, 1000);
            }, 1000);
        }

        // startRotation(1000); // [DEBUG] Disabled auto-rotation
        return () => {
            if (rotationTimer.current) clearTimeout(rotationTimer.current);
            if (rotationFrameId.current) cancelAnimationFrame(rotationFrameId.current);
        };
    }, [startRotation, fgRefState, graphData]);

    useEffect(() => {
        if (fgRefState) {
            (window as any).FandomDebug = {
                fg: fgRefState,
                scene: fgRefState.scene(),
                camera: fgRefState.camera(),
                nodes: graphData.nodes,
                links: graphData.links,
                dimensions
            };
            console.log("[FandomGraph3D] FandomDebug initialized on window.");
        }
    }, [fgRefState, graphData, dimensions]);

    useEffect(() => {
        console.log("[FandomGraph3D] Props - nodes:", nodes.length, "links:", links.length, "overrideData:", !!overrideData);
    }, [nodes, links, overrideData]);

    // [NEW] Use the dedicated hook for scene initialization
    useGraphScene(fgRefState);

    useEffect(() => {
        // [DEBUG] PHYSICS DISABLED COMPLETELY to restore working state
        if (!fgRefState) return;

        // [FIX] Delay physics update to ensure internal D3 engine is ready
        const timer = setTimeout(() => {
            try {
                if (fgRefState.d3Force) {
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

                // [FIX] Ensure alpha is active so it actually moves
                if (fgRefState.d3AlphaTarget) fgRefState.d3AlphaTarget(0.3);

                // [FIX] Enable physics engine via prop
                setPhysicsReady(true);

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

        // Reset Fixed Positions (release nodes)
        nodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });

        if (layoutMode === 'standard') {
            // Standard Forces (handled in previous effect)
            // [FIX] Increased repulsion to separate clusters and nodes
            if (fg.d3Force('charge')) {
                fg.d3Force('charge')
                    .strength(-100) // [FIX] Reduced from -300 to fix massive gap between clusters
                    .distanceMax(2000); // Reduced max distance
            }
            // [FIX] Increase link distance to spread them out
            if (fg.d3Force('link')) {
                fg.d3Force('link')
                    .distance(120); // Default often ~30. This pushes connected nodes apart.
            }
            fg.d3ReheatSimulation();
        }
        else if (layoutMode === 'hierarchical') {
            if (typeof fg.dagMode === 'function') {
                fg.dagMode('td'); // Top-Down
            }
            if (fg.d3Force('charge')) fg.d3Force('charge').strength(-100);
            fg.d3ReheatSimulation();
        }
        else if (layoutMode === 'grid') {
            // 3D Grid Layout
            const spacing = 80;
            const cols = Math.ceil(Math.pow(nodes.length, 1 / 3));
            nodes.forEach((node, i) => {
                const x = (i % cols) * spacing;
                const y = (Math.floor(i / cols) % cols) * spacing;
                const z = Math.floor(i / (cols * cols)) * spacing;
                // Center the grid
                node.fx = x - (cols * spacing) / 2;
                node.fy = y - (cols * spacing) / 2;
                node.fz = z - (cols * spacing) / 2;
            });
            fg.d3ReheatSimulation(); // Run briefly to settle links
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
            fg.d3ReheatSimulation();
        }
        else if (layoutMode === 'bloom') {
            // "Big Bang" / Starburst
            // Main node at center, Clusters far out, others exploding
            nodes.forEach(node => {
                if (node.group === 'main') {
                    node.fx = 0; node.fy = 0; node.fz = 0;
                }
            });
            if (fg.d3Force('charge')) fg.d3Force('charge').strength(-500).distanceMax(5000);
            fg.d3ReheatSimulation();
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

                try {
                    if (fgRefState.d3Force && fgRefState.d3Force('charge')) {
                        fgRefState.d3Force('charge', null);
                        fgRefState.d3Force('link', null);
                        fgRefState.d3Force('collide', null);
                    }
                } catch (e) {
                    console.warn("Could not clear forces:", e);
                }
            }

            // 1b. Stop Manual Loops
            if (rotationFrameId.current) cancelAnimationFrame(rotationFrameId.current);
            if (rotationTimer.current) clearTimeout(rotationTimer.current);

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

            textureCache.current.forEach((texture) => texture.dispose());
            textureCache.current.clear();

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

    // --- CAMERA INITIALIZATION (Run Once) ---
    useEffect(() => {
        if (fgRefState && isFirstLoad.current && graphData.nodes.length > 0) {
            console.log("[FandomGraph3D] First load detected. Setting camera position. Nodes:", graphData.nodes.length);
            const timer = setTimeout(() => {
                if (!fgRefState) return;
                const controls = fgRefState.controls();
                if (controls) {
                    controls.enablePan = true;
                    controls.enableDamping = true;
                    controls.dampingFactor = 0.1;
                    controls.rotateSpeed = 0.5;
                    controls.target.set(0, 0, 0);

                    // Initial Camera Position
                    fgRefState.cameraPosition(
                        { x: 0, y: 0, z: initialZoom || 400 }, // Back off significantly
                        { x: 0, y: 0, z: 0 },
                        2000
                    );
                }
            }, 500); // Wait for simulation to warm up

            isFirstLoad.current = false;
            return () => clearTimeout(timer);
        }
    }, [fgRefState, graphData.nodes.length, initialZoom]);

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
        // [COLOR] Force White for Main, otherwise use group color
        const color = (node.group === 'main' || node.id === 'MAIN') ? '#ffffff' : (node.color || getNodeColor(node.group));


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

        // [PERFORMANCE] Use cached materials to prevent memory leaks
        // Create unique key based on color and flatShading (the only varying properties)
        const flatShading = node.group !== 'main';
        const materialKey = `${color}-${flatShading ? 'flat' : 'smooth'}`;

        let shinyMaterial: THREE.MeshStandardMaterial;
        if (materialCache.current.has(materialKey)) {
            shinyMaterial = materialCache.current.get(materialKey)!;
        } else {
            shinyMaterial = new THREE.MeshStandardMaterial({
                color: color,
                metalness: 0.8, // Slightly more metallic
                roughness: 0.1, // Sleeker surface
                wireframe: false, // [FIX] Explicitly disable wireframe/outlines
                flatShading: flatShading // Flat shading for low-poly shapes looks better
            });
            materialCache.current.set(materialKey, shinyMaterial);
        }

        // [PERFORMANCE] Use shared geometry with scaling applied to mesh
        const mesh = new THREE.Mesh(baseGeometry, shinyMaterial);
        mesh.scale.setScalar(radius); // Scale the mesh, not the geometry
        group.add(mesh);

        // Always render the Profile Pic as a sprite OVER the 3D node if available
        // [User Request] Profile Pic rendering disabled to keep graph clean
        /* 
        // Always render the Profile Pic as a sprite OVER the 3D node if available
        // [User Request] Profile Pic rendering RESTORED for enhanced visuals
        const profilePic = node.profilePic || (node.data && node.data.profilePicUrl);
        // Only render for specific groups to avoid clutter
        const shouldRenderPic = (node.group === 'creator' || node.group === 'profile' || node.group === 'brand' || node.group === 'influencer' || node.group === 'user');

        if (profilePic && shouldRenderPic) {
            const textureKey = `pic-${profilePic}`;
            const createPicTexture = (imageUrl: string) => {
                const size = 128; // Higher resolution for crisp avatars
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d')!;
                // Circular clipping
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.fillStyle = '#222';
                ctx.fill();

                const texture = new THREE.CanvasTexture(canvas);
                
                // Optimized image loading
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                
                // Proxy logic to bypass CORS and add auth
                const proxiedUrl = imageUrl.startsWith('/api/proxy-image')
                    ? (token ? `${imageUrl}&token=${token}` : imageUrl)
                    : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}${token ? `&token=${token}` : ''}`;

                img.onload = () => {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(img, 0, 0, size, size);
                    ctx.restore();
                    texture.needsUpdate = true;
                };
                img.onerror = () => {
                    // Silent fail to keep console clean
                };
                img.src = proxiedUrl;
                return texture;
            };

            let texture: THREE.Texture;
            if (textureCache.current.has(textureKey)) {
                texture = textureCache.current.get(textureKey)!;
            } else {
                texture = createPicTexture(profilePic);
                textureCache.current.set(textureKey, texture);
            }

            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const picSprite = new THREE.Sprite(spriteMat);
            
            // Adjusted scale for better visibility
            picSprite.scale.set(radius * 2.8, radius * 2.8, 1); 
            picSprite.position.z = radius * 0.2; // Slightly in front to prevent clipping
            
            group.add(picSprite);
        }
        */

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

        // [OPTIMIZED] Text Labels removed for minimal config
        /*
        if (node.group === 'cluster' || node.group === 'main') {
            const labelText = node.label || node.id;
            const sprite = new SpriteText(labelText);
            sprite.fontFace = 'ui-sans-serif, system-ui, sans-serif';
            sprite.fontWeight = 'bold';
            sprite.textHeight = node.group === 'main' ? 8 : 6;
            sprite.color = '#ffffff';
            sprite.backgroundColor = 'rgba(0,0,0,0.6)'; // Solid background as requested
            sprite.padding = 1.5;
            sprite.borderRadius = 2;
    
            const spriteObj = sprite as any;
            spriteObj.renderOrder = 999;
            spriteObj.material.depthTest = false;
            spriteObj.material.depthWrite = false;
            spriteObj.position.y = -(radius * 1.5 + 4); // Positioned beneath
            spriteObj.raycast = () => null; // Disable interaction on label
            group.add(spriteObj);
        }
        */

        return group;
    }, [visualTheme]);

    const handleNodeHover = (node: any | null, prevNode: any | null) => {
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
    };

    const handleNodeClick = (node: any) => {
        if (onNodeClick) onNodeClick(node.id);

        if (fgRefState) {
            // [FIX] Disable interaction for Hub/Main node
            if (node.id === 'MAIN' || node.group === 'main') {
                return;
            }

            const distance = 80;
            const dist = Math.hypot(node.x, node.y, node.z);

            // Handle case where node is at (0,0,0) -> Fallback to predefined offset
            const newPos = dist < 1
                ? { x: 0, y: 0, z: distance }
                : {
                    x: node.x * (1 + distance / dist),
                    y: node.y * (1 + distance / dist),
                    z: node.z * (1 + distance / dist)
                };

            fgRefState.cameraPosition(
                newPos, // new position
                node,   // lookAt ({ x, y, z })
                2000    // transition duration (ms)
            );
        }
    };

    const handleBackgroundClick = useCallback(() => {
        // Optional: Reset view logic here
    }, []);

    const transitionScale = (obj: any, targetScale: number) => {
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

            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    };



    // [REMOVED] Redundant ResizeObserver

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-[#051810] relative" // [RESTORED] Original Background
            onPointerDown={() => {
                isUserInteracting.current = true;
                stopRotation();
            }}
            onPointerUp={() => {
                isUserInteracting.current = false;
                if (!isDragging.current) startRotation(10000);
            }}
            onPointerLeave={() => {
                isUserInteracting.current = false;
                if (!isDragging.current) startRotation(10000);
            }}
        >
            {/* [REMOVED] Reset Camera Button */}

            {/* [DEBUG] Data Monitor */}
            <div className="absolute top-2 right-2 z-50 pointer-events-none text-[10px] font-mono text-emerald-500/50 text-right bg-black/20 p-2 rounded">
                <div>Nodes: {graphData.nodes.length}</div>
                <div>Links: {graphData.links.length}</div>
                <div>Scale: {dimensions.width}x{dimensions.height}</div>
                {fgRefState && (
                    <div className="text-[9px] mt-1 text-emerald-300">
                        Cam: {Math.round(fgRefState.camera().position.x)},
                        {Math.round(fgRefState.camera().position.y)},
                        {Math.round(fgRefState.camera().position.z)}
                    </div>
                )}
                {graphData.nodes.length > 0 && (
                    <div className="mt-1 border-t border-emerald-500/20 pt-1">
                        Node[0]:<br />
                        x: {Math.round((graphData.nodes[0] as any).x || 0)}<br />
                        y: {Math.round((graphData.nodes[0] as any).y || 0)}<br />
                        z: {Math.round((graphData.nodes[0] as any).z || 0)}<br />
                        Radius: {(window as any).FirstNodeRadius || '?'}
                        Radius: {(window as any).FirstNodeRadius || '?'}
                    </div>
                )}
                {graphData.nodes.length > 1 && (
                    <div className="mt-1 border-t border-emerald-500/20 pt-1 text-emerald-400">
                        Node[1]:<br />
                        x: {Math.round((graphData.nodes[1] as any).x || 0)}<br />
                        y: {Math.round((graphData.nodes[1] as any).y || 0)}<br />
                        Alpha: {(window as any).D3Alpha?.toFixed(3) || '?'}
                    </div>
                )}
                <div className="mt-2 flex gap-1 justify-end pointer-events-auto">
                    <button
                        onClick={() => fgRefState.cameraPosition({ x: 0, y: 0, z: 800 }, { x: 0, y: 0, z: 0 }, 1000)}
                        className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[9px] px-1 py-0.5 rounded border border-emerald-500/30"
                    >
                        RESET CAM
                    </button>
                    <button
                        onClick={() => { fgRefState.d3ReheatSimulation(); }}
                        className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[9px] px-1 py-0.5 rounded border border-emerald-500/30"
                    >
                        REHEAT
                    </button>
                </div>
            </div>

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
                    linkColor={(link: any) => {
                        const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
                        const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
                        const sInfo = (graphData as any).nodeInfo?.get(sId);
                        const tInfo = (graphData as any).nodeInfo?.get(tId);

                        const isCore = sInfo?.group === 'main' || tInfo?.group === 'main' || sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId === 'MAIN' || tId === 'MAIN';

                        if (highlightLinks.has(link)) return '#34d399'; // Brighter on hover
                        return isCore ? 'rgba(6, 78, 59, 0.5)' : 'rgba(6, 78, 59, 0.5)'; // [FIX] Uniform 50% opacity
                    }}
                    linkWidth={(link: any) => {
                        if (highlightLinks.has(link)) return 2;
                        return 1; // [FIX] Uniform 1px width
                    }}
                    linkOpacity={0.5} // [FIX] Global 50% opacity
                    enableNodeDrag={true} // [FIX] Always enable dragging for better feel
                    enablePointerInteraction={true}
                    d3VelocityDecay={0.1} // [FIX] Reduced drag resistance (was default 0.4)
                    d3AlphaDecay={0.01}   // [FIX] Slower cooling for longer interactions

                    showNavInfo={false}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                    onNodeDrag={(node: any) => {
                        // [FIX] Explicitly stop rotation to prevent camera shift while dragging
                        isDragging.current = true;
                        stopRotation();
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
                        if (rotationTimer.current) clearTimeout(rotationTimer.current);
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
                        // [FIX] Do NOT release node position (keep it fixed where dragged)
                        // node.fx = null;
                        // node.fy = null;
                        // node.fz = null;
                        startRotation(5000);
                    }}
                    onBackgroundClick={handleBackgroundClick}

                    dagMode={
                        layoutMode === 'hierarchical' ? 'td' : undefined
                    }
                    dagLevelDistance={layoutMode === 'standard' ? undefined : 200}
                    // [LAYOUT] Arched Hub Connections
                    // [LAYOUT] Arched Hub Connections
                    linkCurvature={(link: any) => {
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
                    }}
                    // [PULSE] Core Arched links get energetic particles
                    linkDirectionalParticles={(link: any) => {
                        const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
                        const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
                        const sInfo = (graphData as any).nodeInfo?.get(sId);
                        const tInfo = (graphData as any).nodeInfo?.get(tId);
                        const isCore = sInfo?.group === 'main' || tInfo?.group === 'main' || sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId === 'MAIN' || tId === 'MAIN';

                        return isCore ? 4 : 0;
                    }}
                    linkDirectionalParticleSpeed={(link: any) => {
                        const sId = String(typeof link.source === 'object' ? link.source.id : link.source);
                        const tId = String(typeof link.target === 'object' ? link.target.id : link.target);
                        const sInfo = (graphData as any).nodeInfo?.get(sId);
                        const tInfo = (graphData as any).nodeInfo?.get(tId);
                        const isCore = sInfo?.group === 'main' || tInfo?.group === 'main' || sInfo?.group === 'cluster' || tInfo?.group === 'cluster' || sId === 'MAIN' || tId === 'MAIN';

                        return isCore ? 0.005 : 0.001; // [SLOWED] Super slow speed as requested
                    }}
                    linkDirectionalParticleWidth={1.8}
                    linkDirectionalParticleColor={() => '#10b981'} // Emerald Pulse
                    backgroundColor="rgba(0,0,0,0)" // [RESTORED] Transparent
                    rendererConfig={{ alpha: true, preserveDrawingBuffer: false }} // [OPTIMIZED] Disable preserveDrawingBuffer
                    forceEngine="d3"
                    warmupTicks={0}
                    cooldownTicks={isPhysicsReady ? Infinity : 0}
                    onEngineStop={() => console.log("Engine Stopped")}
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
                            if (!isTourActive) stopRotation(); // Stop idle orbit when touring
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
        </div >
    );
};

export default FandomGraph3D;
