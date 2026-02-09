
import React from 'react';
import { Job } from '../../types.js';
import { X, CheckCircle, AlertCircle, Loader2, Clock, Trash2, Map, Share2 } from 'lucide-react';

interface ActivityCenterProps {
    isOpen: boolean;
    onClose: () => void;
    jobs: Job[];
    onViewResult: (datasetId: string) => void;
    onDelete: (jobId: string) => void;
    onShare: (datasetId: string) => void;
}

export const ActivityCenter: React.FC<ActivityCenterProps> = ({
    isOpen,
    onClose,
    jobs,
    onViewResult,
    onDelete,
    onShare
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 w-full max-w-md bg-[#051810] border-l border-emerald-900/50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out">

                {/* Header */}
                <div className="p-4 border-b border-emerald-900/50 flex justify-between items-center bg-[#0a2f1f]/80 backdrop-blur-md">
                    <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Job Queue
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-emerald-900/50 rounded-full transition-colors text-emerald-400/60 hover:text-emerald-400"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-emerald-900/50 scrollbar-track-transparent">
                    {jobs.length === 0 ? (
                        <div className="text-center py-12 text-emerald-500/40 font-mono text-sm">
                            <p>No recent activity</p>
                        </div>
                    ) : (
                        jobs.map(job => (
                            <JobItem key={job.id} job={job} onViewResult={onViewResult} onDelete={onDelete} onShare={onShare} />
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-emerald-900/50 bg-[#0a2f1f]/30 text-xs text-emerald-500/40 text-center font-mono">
                    Jobs are retained for 7 days
                </div>
            </div>
        </div>
    );
};

const JobItem: React.FC<{ job: Job; onViewResult: (id: string) => void; onDelete: (id: string) => void; onShare: (id: string) => void }> = ({ job, onViewResult, onDelete, onShare }) => {
    const isRunning = job.status === 'running' || job.status === 'queued';
    const isSuccess = job.status === 'completed';
    const isFailed = job.status === 'failed' || job.status === 'aborted';

    // Deletion State
    const [confirmDelete, setConfirmDelete] = React.useState(false);

    return (
        <div className="bg-[#0a2f1f]/40 rounded-lg p-4 border border-emerald-900/30 hover:border-emerald-500/30 transition-all hover:bg-[#0a2f1f]/60 group relative relative-group">
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="font-medium text-emerald-100 text-sm">
                        {job.type === 'map_generation' ? 'Map Generation' :
                            job.type === 'orchestration' ? 'Query Builder' :
                                job.type === 'ai_analysis' ? 'Quick Map' : 'Job'}
                    </h3>
                    <p className="text-xs text-emerald-400/60 truncate max-w-[200px]">
                        {job.metadata?.query || job.id}
                    </p>
                    {job.metadata?.sampleSize && (
                        <p className="text-[10px] text-emerald-500/40 font-mono mt-0.5">
                            Sample: {job.metadata.sampleSize}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Restricted Content Warning */}
                    {job.result?.hasRestrictedContent && (
                        <div title="Contains Age Restricted Content (Some profiles may be hidden)" className="flex items-center justify-center w-6 h-6 rounded-full border border-red-500/50 bg-red-900/30 text-[9px] font-bold text-red-500 select-none cursor-help shadow-[0_0_5px_rgba(239,68,68,0.3)]">
                            21+
                        </div>
                    )}

                    {/* Status Badge (hidden if confirming delete to make room) */}
                    {!confirmDelete && <StatusBadge status={job.status} />}

                    {/* Delete Action - Top Right */}
                    {confirmDelete ? (
                        <div className="flex items-center gap-1 bg-red-900/40 rounded p-1 absolute top-2 right-2 animate-in fade-in duration-200">
                            <span className="text-[10px] text-red-200 px-1 font-bold">Sure?</span>
                            <button
                                onClick={() => onDelete(job.id)}
                                className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-200 transition-colors"
                            >
                                <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="p-1.5 text-emerald-500/20 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-all opacity-0 group-hover:opacity-100"
                            title="Abort & Delete Job"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {isRunning && (
                <div className="mt-3 space-y-1.5">
                    <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden border border-white/5">
                        <div
                            className="bg-emerald-500 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            style={{ width: `${job.progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-emerald-400/60 font-mono">
                        <span>{job.result?.stage || 'Processing...'}</span>
                        <span>{job.progress}%</span>
                    </div>
                </div>
            )}

            {/* Completion Result */}
            {isSuccess && (
                <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-emerald-400/80">Completed successfully</p>
                    <div className="flex gap-2">
                        {job.result?.datasetId && (
                            <>
                                <button
                                    onClick={() => onShare(job.result!.datasetId!)}
                                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors border border-emerald-500/20 shadow-lg shadow-emerald-900/20"
                                    title="Share Map"
                                >
                                    <Share2 className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => onViewResult(job.result!.datasetId!)}
                                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors border border-emerald-500/20 shadow-lg shadow-emerald-900/20"
                                >
                                    <Map className="w-3 h-3" />
                                    Open Map
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Error Message */}
            {isFailed && (
                <div className="mt-2 text-xs text-red-400 bg-red-950/30 p-2 rounded border border-red-500/20 font-mono">
                    Error: {job.error || 'Unknown failure'}
                </div>
            )}

            <div className="mt-2 text-[10px] text-emerald-500/30 flex justify-end font-mono">
                {new Date(job.createdAt).toLocaleString()}
            </div>
        </div>
    );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    switch (status) {
        case 'running':
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 shadow-[0_0_8px_rgba(59,130,246,0.2)]">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Running
                </span>
            );
        case 'queued':
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                    <Clock className="w-3 h-3" />
                    Queued
                </span>
            );
        case 'completed':
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                    <CheckCircle className="w-3 h-3" />
                    Complete
                </span>
            );
        case 'failed':
        case 'aborted':
            return (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.2)]">
                    <AlertCircle className="w-3 h-3" />
                    Failed
                </span>
            );
        default:
            return <span className="text-[10px] text-stone-500">{status}</span>;
    }
};
