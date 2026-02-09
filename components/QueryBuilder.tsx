import React, { useState, useEffect, useCallback } from 'react';
import {
    Search,
    Sparkles,
    Database,
    Globe,
    AlertCircle,
    CheckCircle,
    HelpCircle,
    ChevronRight,
    Loader2,
    Plus
} from 'lucide-react';
import {
    QueryValidationResult,
    DatasetPlatform,
    ApproachType
} from '../types.js';
import { validateQuery } from '../services/queryValidationService.js';

interface QueryBuilderProps {
    targetProfile: string;
    platform: DatasetPlatform;
    onQueryValidated?: (result: QueryValidationResult) => void;
    onCreateDatasetRequest?: (dataType: string) => void;
}

// Approach type colors and icons
const getApproachStyle = (type: ApproachType) => {
    switch (type) {
        case 'dataset':
            return {
                icon: Database,
                bg: 'bg-emerald-500/20',
                text: 'text-emerald-400',
                border: 'border-emerald-500/30'
            };
        case 'ai':
            return {
                icon: Sparkles,
                bg: 'bg-purple-500/20',
                text: 'text-purple-400',
                border: 'border-purple-500/30'
            };
        case 'search':
            return {
                icon: Globe,
                bg: 'bg-blue-500/20',
                text: 'text-blue-400',
                border: 'border-blue-500/30'
            };
        case 'hybrid':
            return {
                icon: Sparkles,
                bg: 'bg-amber-500/20',
                text: 'text-amber-400',
                border: 'border-amber-500/30'
            };
    }
};

// Accuracy level styles
const getAccuracyStyle = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
        case 'high':
            return {
                bg: 'bg-emerald-500',
                text: 'text-emerald-400',
                label: 'High Accuracy'
            };
        case 'medium':
            return {
                bg: 'bg-yellow-500',
                text: 'text-yellow-400',
                label: 'Medium Accuracy'
            };
        case 'low':
            return {
                bg: 'bg-red-500',
                text: 'text-red-400',
                label: 'Low Accuracy'
            };
    }
};

const QueryBuilder: React.FC<QueryBuilderProps> = ({
    targetProfile,
    platform,
    onQueryValidated,
    onCreateDatasetRequest
}) => {
    const [query, setQuery] = useState('');
    const [validating, setValidating] = useState(false);
    const [result, setResult] = useState<QueryValidationResult | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Debounced validation
    const runValidation = useCallback(async () => {
        if (!query.trim() || query.length < 10) {
            setResult(null);
            return;
        }

        setValidating(true);
        try {
            const validationResult = await validateQuery(query, targetProfile, platform);
            setResult(validationResult);
            onQueryValidated?.(validationResult);
        } catch (err) {
            console.error('Query validation failed:', err);
            setResult(null);
        } finally {
            setValidating(false);
        }
    }, [query, targetProfile, platform]); // Removed onQueryValidated to prevent infinite re-renders

    // Debounce the validation
    // FIXED: Removed runValidation from dependencies to prevent infinite loop
    useEffect(() => {
        if (!query.trim() || query.length < 10) {
            setResult(null);
            return;
        }

        const timer = setTimeout(() => {
            runValidation();
        }, 500);
        return () => clearTimeout(timer);
    }, [query, targetProfile, platform]); // Dependencies: only the actual values, NOT runValidation

    // Example queries for inspiration
    const exampleQueries = [
        `Which creators are followers of @${targetProfile || 'profile'} also following?`,
        `What brands are over-indexed among the audience?`,
        `What subcultures exist within the fanbase?`,
        `Which accounts have the highest overlap with followers?`
    ];

    return (
        <div className="space-y-4">
            {/* Query Input */}
            <div>
                <label className="text-[10px] font-bold text-emerald-300/70 uppercase mb-1 block">
                    Natural Language Query
                </label>
                <div className="relative">
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask a question about the audience..."
                        rows={3}
                        className="w-full bg-[#051810] border border-emerald-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500 resize-none"
                    />
                    {validating && (
                        <div className="absolute right-3 top-3">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        </div>
                    )}
                </div>

                {/* Example queries */}
                {!query && (
                    <div className="mt-2 space-y-1">
                        <span className="text-[10px] text-emerald-500/50">Try asking:</span>
                        {exampleQueries.slice(0, 2).map((example, i) => (
                            <button
                                key={i}
                                onClick={() => setQuery(example)}
                                className="block w-full text-left text-xs text-emerald-400/60 hover:text-emerald-400 transition-colors truncate"
                            >
                                "{example}"
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Validation Results */}
            {result && (
                <div className="space-y-3 animate-in slide-in-from-top-2">
                    {/* Accuracy Indicator */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${getAccuracyStyle(result.accuracy.level).bg}`} />
                            <span className={`text-sm font-medium ${getAccuracyStyle(result.accuracy.level).text}`}>
                                {getAccuracyStyle(result.accuracy.level).label}
                            </span>
                            <span className="text-xs text-emerald-500/50">
                                ({result.accuracy.score}%)
                            </span>
                        </div>
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                            {showDetails ? 'Hide' : 'Show'} Details
                            <ChevronRight className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
                        </button>
                    </div>

                    {/* Success Probability */}
                    <div className="bg-[#051810]/60 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-emerald-500/70">Success Probability</span>
                            <span className="text-xs text-white font-medium">
                                {result.successProbability.probability}%
                            </span>
                        </div>
                        <div className="h-1.5 bg-emerald-900/50 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${result.successProbability.probability >= 70
                                    ? 'bg-emerald-500'
                                    : result.successProbability.probability >= 40
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                                    }`}
                                style={{ width: `${result.successProbability.probability}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-emerald-500/50 mt-1">
                            {result.successProbability.reasoning}
                        </p>
                    </div>

                    {/* Suggested Approaches */}
                    <div>
                        <span className="text-[10px] font-bold text-emerald-300/70 uppercase mb-2 block">
                            Recommended Approach
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {result.suggestedApproaches.map((approach, i) => {
                                const style = getApproachStyle(approach.type);
                                const Icon = style.icon;
                                return (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${style.bg} ${style.border}`}
                                    >
                                        <Icon className={`w-4 h-4 ${style.text}`} />
                                        <span className={`text-xs font-medium ${style.text} capitalize`}>
                                            {approach.type}
                                        </span>
                                        <span className="text-[10px] text-white/50">
                                            {Math.round(approach.weight * 100)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Matching Datasets */}
                    {result.matchingDatasets.length > 0 && (
                        <div>
                            <span className="text-[10px] font-bold text-emerald-300/70 uppercase mb-2 block">
                                Matching Datasets ({result.matchingDatasets.length})
                            </span>
                            <div className="space-y-1">
                                {result.matchingDatasets.slice(0, 3).map((match, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between bg-[#051810]/40 rounded px-2 py-1.5"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Database className="w-3 h-3 text-emerald-500" />
                                            <span className="text-xs text-white">{match.dataset.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-emerald-500/50">
                                                {match.relevanceScore}% match
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Warnings */}
                    {result.warnings.length > 0 && (
                        <div className="space-y-1">
                            {result.warnings.map((warning, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-900/20 rounded-lg px-3 py-2"
                                >
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{warning}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Create Dataset Suggestion */}
                    {result.accuracy.level === 'low' && result.suggestedApproaches.some(a => a.requiredDataset) && (
                        <button
                            onClick={() => {
                                const suggestion = result.suggestedApproaches.find(a => a.requiredDataset);
                                if (suggestion?.requiredDataset) {
                                    onCreateDatasetRequest?.(suggestion.requiredDataset.dataType);
                                }
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create Required Dataset
                        </button>
                    )}

                    {/* Detailed Breakdown */}
                    {showDetails && (
                        <div className="bg-[#051810]/60 rounded-lg p-3 space-y-3 text-xs animate-in slide-in-from-top-1">
                            <div>
                                <span className="text-emerald-500/70">Detected Intent:</span>
                                <span className="text-white ml-2 capitalize">{result.query.intent}</span>
                            </div>

                            <div>
                                <span className="text-emerald-500/70">Required Data Types:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {result.query.requiredDataTypes.map((dt, i) => (
                                        <span
                                            key={i}
                                            className="px-2 py-0.5 bg-emerald-900/30 text-emerald-400 rounded capitalize"
                                        >
                                            {dt}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span className="text-emerald-500/70">Accuracy Factors:</span>
                                <ul className="mt-1 space-y-0.5 text-emerald-300/70">
                                    {result.accuracy.factors.map((factor, i) => (
                                        <li key={i} className="flex items-center gap-1">
                                            <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                            {factor}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {result.suggestedApproaches.some(a => a.description) && (
                                <div>
                                    <span className="text-emerald-500/70">Approach Details:</span>
                                    <ul className="mt-1 space-y-0.5 text-emerald-300/70">
                                        {result.suggestedApproaches.map((approach, i) => (
                                            <li key={i} className="flex items-center gap-1">
                                                <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                                {approach.description}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Can Proceed Indicator */}
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${result.canProceed
                        ? 'bg-emerald-900/20 border border-emerald-500/20'
                        : 'bg-red-900/20 border border-red-500/20'
                        }`}>
                        {result.canProceed ? (
                            <>
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-emerald-400">
                                    Ready to proceed with analysis
                                </span>
                            </>
                        ) : (
                            <>
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <span className="text-xs text-red-400">
                                    Additional data required for accurate results
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QueryBuilder;
