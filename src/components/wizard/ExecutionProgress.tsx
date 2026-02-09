import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ScrapePlanStep } from '../../../types.js';
import { Terminal, Activity, Zap, AlertTriangle, Play } from 'lucide-react';
import { LazyFandomGraph3D as FandomGraph3D } from '../LazyComponents.js';
import { demoGraphData } from '../../data/demoGraph.js';

interface ExecutionProgressProps {
    steps: ScrapePlanStep[];
    currentStepId: string | null;
    logs: string[];
    startTime: number;
    onCancel: () => void;
}

export const ExecutionProgress: React.FC<ExecutionProgressProps> = ({
    steps,
    currentStepId,
    logs,
    startTime,
    onCancel
}) => {
    const [elapsed, setElapsed] = useState(0);
    const [millis, setMillis] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // --- TELEMETRY ENGINE ---
    const telemetry = useMemo(() => {
        let totalRecords = 0;
        const entities: string[] = [];
        const detectedActors = new Set<string>();

        // Velocity Calc
        const now = Date.now();
        const durationSec = Math.max(1, (now - startTime) / 1000);

        logs.forEach(log => {
            // 1. Records
            const recordMatch = log.match(/(?:Enriching|Got|found)\s*(\d+)/i);
            if (recordMatch) {
                totalRecords += parseInt(recordMatch[1], 10);
            }

            // 2. Entities (Simple heuristic for @mentions or #hashtags in logs)
            // Example log: "Processing profile @nike"
            const entityMatch = log.match(/[@#][a-zA-Z0-9_]+/);
            if (entityMatch) {
                if (!entities.includes(entityMatch[0])) entities.push(entityMatch[0]);
            }

            // 3. Active Agents
            const actorMatch = log.match(/^\[(.*?)(?:~|(?:\]))/);
            if (actorMatch && !log.includes('Orchestrator')) {
                detectedActors.add(actorMatch[1]);
            }
        });

        // 1 Orchestrator + N Cloud Agents
        const activeAgents = 1 + detectedActors.size;
        const velocity = (totalRecords / durationSec).toFixed(1);
        const recentLogs = logs.slice(-200).map(l => l.replace(/\[.*?\]/, '').trim()).filter(l => l);

        return { totalRecords, entities: entities.slice(-10), velocity, recentLogs, activeAgents };
    }, [logs, startTime]);

    // Timer Logic (High Precision)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const diff = now - startTime;
            setElapsed(Math.floor(diff / 1000));
            setMillis(Math.floor((diff % 1000) / 10)); // 2 digits
        }, 30); // 30ms update for smooth millis
        return () => clearInterval(interval);
    }, [startTime]);

    // Auto-scroll logic (Only if near bottom)
    const [isAutoScroll, setIsAutoScroll] = useState(true);

    const checkScroll = () => {
        if (!logContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
        // If user is within 50px of bottom, sticky scroll enabled
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAutoScroll(isNearBottom);
    };

    useEffect(() => {
        if (logContainerRef.current && isAutoScroll) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [telemetry.recentLogs.length, isAutoScroll]);

    // Format Time 00:00:00
    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#051810]">

            {/* BACKGROUND: Spinning Node Map */}
            <div className="absolute inset-0 opacity-40 pointer-events-none">
                <FandomGraph3D
                    nodes={demoGraphData.nodes}
                    links={demoGraphData.links}
                    showLegend={false}
                    bloomStrength={0.5}
                    initialZoom={300} // Slightly further for bg background
                    query="System Sequence" // [NEW] Parity
                />
                <div className="absolute inset-0 bg-[#051810]/80 backdrop-blur-sm"></div>
            </div>

            {/* MAIN CARD: Increased Width to 5xl */}
            <div className="relative z-10 w-full max-w-5xl bg-[#051810]/95 border border-emerald-500/20 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col">

                {/* HEADLINE BAR */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-500/10 bg-black/20">
                    <div className="flex items-center gap-3">
                        <Activity className="text-emerald-500 animate-pulse" size={18} />
                        <div>
                            <div className="text-xs font-bold text-emerald-100/90 uppercase tracking-[0.2em]">System Orchestration</div>
                            <div className="text-[10px] text-emerald-500/60 font-mono tracking-widest mt-0.5">Sequence Active</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* DIGITAL TIMER */}
                        <div className="flex items-baseline gap-1 font-mono text-emerald-100/90 font-bold text-xl tracking-tighter tabular-nums">
                            {formatTime(elapsed)}
                            <span className="text-xs text-emerald-500/50">.{millis.toString().padStart(2, '0')}</span>
                        </div>

                        {/* ABORT BUTTON */}
                        <button
                            onClick={onCancel}
                            className="group flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                        >
                            <AlertTriangle size={12} className="group-hover:animate-pulse" />
                            Abort
                        </button>
                    </div>
                </div>

                {/* CONTENT GRID: Increased Height to 500px */}
                <div className="grid grid-cols-12 divide-x divide-emerald-500/10 h-[500px]">

                    {/* LEFT: METRICS (25%) */}
                    <div className="col-span-3 bg-emerald-900/5 p-6 flex flex-col justify-start pt-16 items-center text-center gap-8">

                        {/* VELOCITY */}
                        <div>
                            <div className="text-5xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                {telemetry.velocity}
                            </div>
                            <div className="text-[10px] text-emerald-400/60 font-mono uppercase tracking-widest mt-2">
                                Records / Sec
                            </div>
                        </div>

                        {/* SUB-STATS */}
                        <div className="w-full grid grid-cols-1 gap-6 border-t border-emerald-500/10 pt-6">
                            <div>
                                <div className="text-2xl font-bold text-white tracking-tight">{telemetry.totalRecords}</div>
                                <div className="text-[9px] text-emerald-500/50 uppercase tracking-widest mt-1">Total Found</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-emerald-400 tracking-tight">{telemetry.activeAgents}</div>
                                <div className="text-[9px] text-emerald-500/50 uppercase tracking-widest mt-1">Active Agents</div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: INTELLIGENCE FEED (75% - Increased) */}
                    <div className="col-span-9 flex flex-col bg-[#020604]">

                        {/* LOG STREAM */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-emerald-500/5 bg-emerald-500/5">
                            <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-mono tracking-wider">
                                <Terminal size={10} />
                                <span>LIVE_FEED_V2.0</span>
                            </div>
                            <div className="flex gap-1 opacity-50">
                                <span className={`w-1 h-1 rounded-full bg-emerald-500 ${isAutoScroll ? 'animate-ping' : 'opacity-20'}`} />
                                <span className="text-[9px] text-emerald-500/50 ml-1">
                                    {isAutoScroll ? 'RELAY ACTIVE' : 'SCROLL PAUSED'}
                                </span>
                            </div>
                        </div>

                        <div
                            ref={logContainerRef}
                            onScroll={checkScroll}
                            className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-emerald-500/20 scrollbar-track-transparent font-mono"
                        >
                            {telemetry.recentLogs.length === 0 && (
                                <div className="text-center text-emerald-500/20 text-xs py-8 italic">Initializing Uplink...</div>
                            )}
                            {telemetry.recentLogs.map((log, i) => (
                                <div key={i} className="flex gap-4 text-xs text-emerald-100/70 hover:text-emerald-200 transition-colors cursor-default border-l-2 border-transparent hover:border-emerald-500/50 pl-2 -ml-2 select-text">
                                    <span className="opacity-30 select-none shrink-0 text-[10px] pt-0.5">{new Date().toLocaleTimeString().split(' ')[0]}</span>
                                    <span className="break-all">{log}</span>
                                </div>
                            ))}
                            <div className="animate-pulse text-emerald-500 font-mono text-xs">_</div>
                        </div>

                        {/* ENTITY TICKER */}
                        <div className="h-10 bg-emerald-900/10 border-t border-emerald-500/10 flex items-center overflow-hidden relative shrink-0">
                            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#020604] to-transparent z-10" />
                            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#020604] to-transparent z-10" />

                            <div className="flex gap-4 animate-[scroll_20s_linear_infinite] whitespace-nowrap pl-4">
                                {telemetry.entities.length > 0 ? [...telemetry.entities, ...telemetry.entities].map((entity, i) => (
                                    <span key={i} className="text-xs text-emerald-300/70 font-mono px-2 py-1 bg-emerald-500/5 rounded border border-emerald-500/10">
                                        {entity}
                                    </span>
                                )) : (
                                    <span className="text-xs text-emerald-500/20 font-mono italic px-4">Scanning for entities...</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

