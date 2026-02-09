import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Search, Share2, Download, Zap, Users, Hash, Network,
    HelpCircle, Sparkles, Target, BarChart3, TrendingUp, Globe, Layers,
    ChevronLeft, ChevronRight, Menu, X, MapPin, TrendingDown, Eye,
    Crosshair, MessageCircle, Award, Activity, Filter, Compass
} from 'lucide-react';

// Navigation structure
const NAV_SECTIONS = [
    {
        title: 'Getting Started',
        items: [
            { id: 'overview', label: 'Overview', icon: HelpCircle },
            { id: 'how-it-works', label: 'How It Works', icon: Sparkles },
            { id: 'quick-start', label: 'Quick Start', icon: Zap }
        ]
    },
    {
        title: 'Query Builder',
        items: [
            { id: 'natural-language', label: 'Natural Language Input', icon: MessageCircle },
            { id: 'sample-size', label: 'Sample Size Selection', icon: Users },
            { id: 'cost-estimation', label: 'Cost Estimation', icon: BarChart3 },
            { id: 'fresh-vs-cached', label: 'Fresh vs Cached Data', icon: Activity }
        ]
    },
    {
        title: 'Query Intent Routes',
        items: [
            { id: 'brand-affinity', label: 'Brand Affinity', icon: Target },
            { id: 'influencer-discovery', label: 'Influencer Discovery', icon: Award },
            { id: 'geo-discovery', label: 'Geographic Discovery', icon: MapPin },
            { id: 'competitor-analysis', label: 'Competitor Analysis', icon: Crosshair },
            { id: 'hashtag-tracking', label: 'Hashtag Tracking', icon: Hash },
            { id: 'profile-network', label: 'Profile Network', icon: Network }
        ]
    },
    {
        title: 'Dashboard Features',
        items: [
            { id: '3d-graph', label: '3D Graph Navigation', icon: Globe },
            { id: 'analytics-panel', label: 'Analytics Panel', icon: TrendingUp },
            { id: 'data-provenance', label: 'Data Provenance', icon: Eye }
        ]
    },
    {
        title: 'Advanced',
        items: [
            { id: 'cost-optimization', label: 'Cost Optimisation', icon: TrendingDown },
            { id: 'best-practices', label: 'Best Practices', icon: Compass }
        ]
    }
];

const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-emerald-500/10 transition-colors text-emerald-500/40 hover:text-emerald-400 group relative"
            title="Copy query"
        >
            {copied ? <Zap className="w-3.5 h-3.5 fill-emerald-400" /> : <Search className="w-3.5 h-3.5" />}
            {copied && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] px-2 py-1 shadow-xl whitespace-nowrap">
                    Copied!
                </span>
            )}
        </button>
    );
};

// Section Components
const OverviewSection = () => (
    <div className="max-w-4xl space-y-16">
        <div className="space-y-4">
            <div className="inline-block">
                <div className="text-[10px] font-light text-emerald-500/50 uppercase tracking-[0.25em] mb-3">Help Guide</div>
                <h1 className="text-2xl font-light text-white tracking-tight mb-4">Fandom Mapper</h1>
            </div>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8] max-w-2xl">
                A social intelligence platform that transforms Instagram data into actionable insights through
                AI-driven analysis and 3D network visualisation.
            </p>
        </div>

        <div className="space-y-8">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">What It Does</h2>

            <div className="grid md:grid-cols-2 gap-x-16 gap-y-10">
                <div className="space-y-8">
                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Social Media Analysis</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Deep-dive into follower networks, engagement patterns, and community structures to understand
                            audience composition and behaviour.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Campaign Monitoring</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Track brand mentions, measure campaign reach, and identify key amplifiers across
                            social networks in real-time.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Market Discovery</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Find untapped niches, emerging trends, and new target audiences through
                            network analysis and pattern recognition.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Influencer Identification</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Discover micro-influencers, brand advocates, and opinion leaders within
                            specific communities or interest groups.
                        </p>
                    </div>
                </div>

                <div className="space-y-8">
                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Competitor Analysis</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Map rival audiences, identify gaps in market coverage, and find opportunities
                            to differentiate your positioning.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Opinion Forming</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Identify thought leaders, track sentiment shifts, and understand how narratives
                            flow through social networks.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Brand Affinity Mapping</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Discover which brands, creators, or accounts your audience disproportionately
                            follows compared to the general population.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-[13px] font-normal text-white/90 mb-2.5 tracking-tight">Community Clustering</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Visualise subcultures, tribes, and interest groups within any network to
                            understand community segmentation.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-8">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>

            <div className="space-y-10">
                <div className="flex gap-8">
                    <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">01</div>
                    <div className="flex-1 space-y-2.5">
                        <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Natural Language Input</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Describe what you want to discover in plain English. The AI understands context,
                            targets, and objectives without requiring technical query syntax.
                        </p>
                    </div>
                </div>

                <div className="flex gap-8">
                    <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">02</div>
                    <div className="flex-1 space-y-2.5">
                        <h3 className="text-[13px] font-normal text-white/90 tracking-tight">AI Intent Detection</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            The system analyses your query to determine the optimal approach, identifies the
                            query type, and creates an optimised scraping plan.
                        </p>
                    </div>
                </div>

                <div className="flex gap-8">
                    <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">03</div>
                    <div className="flex-1 space-y-2.5">
                        <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Data Collection</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Cloud scrapers execute the plan, gathering profile data, posts, followers, and
                            engagement metrics. All data is normalised and enriched.
                        </p>
                    </div>
                </div>

                <div className="flex gap-8">
                    <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">04</div>
                    <div className="flex-1 space-y-2.5">
                        <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Visualisation & Analysis</h3>
                        <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                            Results are transformed into an interactive 3D network graph with AI-generated
                            insights, community clusters, and detailed analytics.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div className="space-y-6 pt-8">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Platform Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-[12px]">
                <div>
                    <div className="text-gray-600 font-light mb-1.5 tracking-wide">Visualisation</div>
                    <div className="text-white/80 font-light">3D Interactive</div>
                </div>
                <div>
                    <div className="text-gray-600 font-light mb-1.5 tracking-wide">AI Model</div>
                    <div className="text-white/80 font-light">Gemini 2.0</div>
                </div>
                <div>
                    <div className="text-gray-600 font-light mb-1.5 tracking-wide">Data Source</div>
                    <div className="text-white/80 font-light">Instagram</div>
                </div>
                <div>
                    <div className="text-gray-600 font-light mb-1.5 tracking-wide">Processing</div>
                    <div className="text-white/80 font-light">Real-Time</div>
                </div>
            </div>
        </div>
    </div>
);

const QuickStartSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Quick Start</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Get started with your first query in minutes.
            </p>
        </div>

        <div className="space-y-10">
            <div className="flex gap-8">
                <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">01</div>
                <div className="flex-1 space-y-3">
                    <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Enter Your Query</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Type a natural language description of what you want to discover. Be specific about your target
                        and objective.
                    </p>
                    <div className="bg-black/20 p-4 space-y-2">
                        <div className="text-[11px] font-light text-gray-600 mb-2">Example:</div>
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"Map @redbulluk followers' brand affinities"</code>
                            <CopyButton text="Map @redbulluk followers' brand affinities" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-8">
                <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">02</div>
                <div className="flex-1 space-y-3">
                    <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Set Sample Size</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Choose how many profiles to analyse. Start with 500-1000 for balanced results.
                        Larger samples provide more accuracy but cost more.
                    </p>
                </div>
            </div>

            <div className="flex gap-8">
                <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">03</div>
                <div className="flex-1 space-y-3">
                    <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Review Plan & Execute</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        The AI generates a scraping plan with cost estimate. Review the steps and click Execute
                        to begin data collection.
                    </p>
                </div>
            </div>

            <div className="flex gap-8">
                <div className="text-[10px] font-light text-emerald-500/30 pt-1 w-8 shrink-0">04</div>
                <div className="flex-1 space-y-3">
                    <h3 className="text-[13px] font-normal text-white/90 tracking-tight">Explore Results</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Once complete, interact with the 3D graph, review analytics, and explore AI-generated insights.
                        Click nodes for detailed profile information.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

const BrandAffinitySection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Brand Affinity (Over-Indexing)</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Discover which brands or creators a community disproportionately follows compared to the general population.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                The algorithm analyses who a target profile's followers also follow, then calculates affinity scores
                by comparing these patterns against general Instagram usage rates. A score above 1.0 indicates over-indexing.
            </p>
            <div className="bg-black/20 p-5">
                <div className="text-[11px] font-light text-gray-600 mb-2">Formula:</div>
                <code className="text-[12px] text-gray-400 font-light">
                    Affinity Score = (% of followers who follow Brand X) / (Brand X's general follower rate)
                </code>
            </div>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Find over-indexed brands for @redbulluk', desc: 'Discover brand partnership opportunities by identifying which brands Red Bull\'s audience disproportionately follows.' },
                    { q: 'Map @glossier followers\' brand affinities', desc: 'Understand what other beauty brands Glossier\'s audience engages with to inform positioning strategy.' },
                    { q: 'Which creators do @nike followers over-index on?', desc: 'Identify micro and macro influencers that resonate strongly with Nike\'s existing audience.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>

        <div className="space-y-4">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Best Practices</h2>
            <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                <li>• Use 500-1000 sample size for balanced results. Larger samples (2000+) provide more accuracy.</li>
                <li>• Works best with accounts that have 10k+ followers for statistical significance.</li>
                <li>• Focus on scores above 3.0× for strong affinities. Scores between 1.5-3.0× indicate moderate interest.</li>
            </ul>
        </div>
    </div>
);

const InfluencerDiscoverySection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Influencer Discovery</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Find creators and influencers in specific niches using keyword-based search and content enrichment.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                Instagram search discovers profiles matching your niche keywords. The system then enriches each profile
                with recent posts, engagement metrics, and audience data to help you evaluate relevance and reach.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Find fitness influencers in London', desc: 'Discover local fitness creators for regional campaign targeting.' },
                    { q: 'Search for sustainable fashion creators', desc: 'Identify influencers aligned with eco-conscious brand values.' },
                    { q: 'Discover tech reviewers with 10k-50k followers', desc: 'Find micro-influencers in the tech niche for product launches.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>

        <div className="space-y-4">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">What You'll Receive</h2>
            <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                <li>• Profile data including follower counts, engagement rates, and bio information</li>
                <li>• Recent posts with captions, hashtags, and engagement metrics</li>
                <li>• Network graph showing relationships between discovered creators</li>
                <li>• AI-generated insights about content themes and audience demographics</li>
            </ul>
        </div>
    </div>
);

const GeoDiscoverySection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Geographic Discovery</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Find Instagram profiles and creators in specific geographic locations using Google Search integration.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                Uses Google Search to find Instagram profiles associated with specific locations. Results are then
                enriched with full profile data, posts, and engagement metrics.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Find Instagram creators in Manchester', desc: 'Discover local influencers for regional marketing campaigns.' },
                    { q: 'Map food bloggers in Edinburgh', desc: 'Identify food content creators for restaurant partnerships.' },
                    { q: 'Search for photographers in Cornwall', desc: 'Find visual creators for location-based collaborations.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const CompetitorAnalysisSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Competitor Analysis</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Analyse competitor content strategies, engagement patterns, and audience overlap.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                Scrapes competitor posts to analyse content themes, hashtag usage, posting frequency, and engagement rates.
                Identifies top-performing content and audience interaction patterns.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Analyse @competitor content strategy', desc: 'Understand what content types drive the most engagement for competitors.' },
                    { q: 'Compare @brand1 and @brand2 posting patterns', desc: 'Identify differences in content frequency and timing strategies.' },
                    { q: 'Map @competitor hashtag usage', desc: 'Discover which hashtags competitors use to reach their audience.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const HashtagTrackingSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Hashtag Tracking</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Monitor hashtag performance, discover co-occurring tags, and identify top creators using specific hashtags.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                Scrapes posts using a target hashtag, analyses engagement patterns, identifies frequently co-occurring
                hashtags, and maps the creator network around the tag.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Track #sustainablefashion performance', desc: 'Monitor engagement and reach for sustainability-focused content.' },
                    { q: 'Map creators using #fitnessmotivation', desc: 'Identify influencers actively using fitness hashtags.' },
                    { q: 'Analyse #veganrecipes co-occurring tags', desc: 'Discover related hashtags to expand content reach.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const ProfileNetworkSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Profile Network Mapping</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Map follower and following networks to understand community structures and relationships.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">How It Works</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                Scrapes a profile's followers or following list, enriches each profile with data, and visualises
                the network to reveal community clusters and influential nodes.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Example Queries</h2>
            <div className="space-y-4">
                {[
                    { q: 'Map @brand followers network', desc: 'Visualise your audience structure and identify community segments.' },
                    { q: 'Analyse who @influencer follows', desc: 'Understand an influencer\'s interests and potential partnerships.' },
                    { q: 'Find mutual followers between @brand1 and @brand2', desc: 'Identify audience overlap for collaboration opportunities.' }
                ].map((item, i) => (
                    <div key={i} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <code className="text-[13px] text-emerald-300 font-light">"{item.q}"</code>
                            <CopyButton text={item.q} />
                        </div>
                        <p className="text-[12px] font-light text-gray-600 leading-[1.6]">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const NaturalLanguageSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Natural Language Input</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Write queries in plain English. The AI understands context and intent without technical syntax.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Writing Effective Queries</h2>
            <div className="space-y-8">
                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-3 tracking-tight">Be Specific</h3>
                    <div className="space-y-3">
                        <div className="bg-emerald-900/10 p-4">
                            <div className="text-[11px] font-light text-emerald-400 mb-2">Good</div>
                            <code className="text-[13px] text-emerald-300 font-light">"Map @redbulluk followers' brand affinities"</code>
                            <p className="text-[11px] font-light text-gray-600 mt-2">Clear target, specific intent, defined analysis type</p>
                        </div>
                        <div className="bg-red-900/10 p-4">
                            <div className="text-[11px] font-light text-red-400 mb-2">Vague</div>
                            <code className="text-[13px] text-gray-400 font-light">"Show me stuff about Red Bull"</code>
                            <p className="text-[11px] font-light text-gray-600 mt-2">Too broad, unclear objective</p>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-3 tracking-tight">Include Context</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7] mb-3">
                        Mention specific criteria like follower counts, locations, or content types when relevant.
                    </p>
                    <div className="bg-black/20 p-4">
                        <code className="text-[13px] text-emerald-300 font-light">"Find fitness influencers in London with 10k-50k followers"</code>
                    </div>
                </div>

                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-3 tracking-tight">Use Action Words</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7] mb-3">
                        Start with verbs like "Map", "Find", "Analyse", "Track", or "Discover" to clarify your intent.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

const SampleSizeSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Sample Size Selection</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Choose how many profiles to analyse. Larger samples provide more accuracy but cost more.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Recommended Sizes</h2>
            <div className="space-y-6">
                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-2 tracking-tight">500-1000 (Balanced)</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Good for initial exploration and quick insights. Provides statistically significant results
                        for most use cases at moderate cost.
                    </p>
                </div>
                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-2 tracking-tight">1000-2000 (Comprehensive)</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Better accuracy for brand affinity and network analysis. Recommended for important strategic decisions.
                    </p>
                </div>
                <div>
                    <h3 className="text-[13px] font-normal text-white/90 mb-2 tracking-tight">2000+ (Deep Analysis)</h3>
                    <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                        Maximum accuracy for large-scale audience research. Higher cost but provides the most reliable insights.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

const CostEstimationSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Cost Estimation</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Understand how costs are calculated and optimise your queries for budget efficiency.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Cost Factors</h2>
            <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                <li>• Number of profiles scraped (primary cost driver)</li>
                <li>• Depth of data collection (posts, followers, following)</li>
                <li>• Query complexity (multi-step analysis costs more)</li>
                <li>• Fresh vs cached data (cached queries are free)</li>
            </ul>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Typical Costs</h2>
            <div className="space-y-4 text-[13px] font-light text-gray-500 leading-[1.7]">
                <p>• Brand Affinity (1000 sample): ~$10-15</p>
                <p>• Influencer Discovery (250 profiles): ~$5-8</p>
                <p>• Profile Network (500 followers): ~$8-12</p>
            </div>
        </div>
    </div>
);

const FreshVsCachedSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Fresh vs Cached Data</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Choose between real-time data collection or using previously scraped results.
            </p>
        </div>

        <div className="space-y-8">
            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Fresh Data</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7] mb-3">
                    Scrapes data in real-time, ensuring the most current information. Use when:
                </p>
                <ul className="space-y-2 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <li>• You need the latest follower counts and engagement metrics</li>
                    <li>• Analysing rapidly changing trends or campaigns</li>
                    <li>• Previous data is outdated (older than 7 days)</li>
                </ul>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Cached Data</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7] mb-3">
                    Uses previously scraped data if available. Benefits:
                </p>
                <ul className="space-y-2 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <li>• Free - no scraping costs</li>
                    <li>• Instant results</li>
                    <li>• Good for exploratory analysis or testing queries</li>
                </ul>
            </div>
        </div>
    </div>
);

const GraphNavigationSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">3D Graph Navigation</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Interact with the 3D network visualisation to explore relationships and discover insights.
            </p>
        </div>

        <div className="space-y-8">
            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Controls</h2>
                <div className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <p>• <strong className="text-white/80">Click & Drag</strong> - Rotate the graph</p>
                    <p>• <strong className="text-white/80">Scroll</strong> - Zoom in/out</p>
                    <p>• <strong className="text-white/80">Click Node</strong> - View profile details in Analytics Panel</p>
                    <p>• <strong className="text-white/80">Right Click</strong> - Pan the view</p>
                </div>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Node Colours</h2>
                <div className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <p>• <strong className="text-pink-400">Pink</strong> - Verified creators or high-follower profiles</p>
                    <p>• <strong className="text-emerald-400">Emerald</strong> - Brands or business accounts</p>
                    <p>• <strong className="text-blue-400">Blue</strong> - Regular profiles</p>
                    <p>• <strong className="text-purple-400">Purple</strong> - Topics or hashtags</p>
                </div>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Layout Modes</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7] mb-3">
                    Switch between different layout algorithms to visualise relationships in different ways.
                </p>
            </div>
        </div>
    </div>
);

const AnalyticsPanelSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Analytics Panel</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                View detailed profile information, engagement metrics, and AI-generated insights.
            </p>
        </div>

        <div className="space-y-8">
            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Profile Information</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Displays username, bio, follower count, following count, and profile picture for the selected node.
                </p>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Visual DNA</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    AI-generated personality and interest profile based on content analysis, bio text, and network patterns.
                </p>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Recent Posts</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Gallery of recent posts with captions, engagement metrics, and links to original content.
                </p>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Data Provenance</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Evidence and sources for AI insights, with links to original posts and data points.
                </p>
            </div>
        </div>
    </div>
);

const DataProvenanceSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Data Provenance</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Verify AI insights with source evidence and original data points.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">What It Shows</h2>
            <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                For each AI-generated insight, the Data Provenance section displays the specific posts, profiles,
                or data points that support the conclusion. Click any evidence link to view the original source.
            </p>
        </div>

        <div className="space-y-6">
            <h2 className="text-sm font-light text-emerald-400/80 tracking-wide">Why It Matters</h2>
            <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                <li>• Verify AI conclusions with real data</li>
                <li>• Understand how insights were derived</li>
                <li>• Build confidence in analysis results</li>
                <li>• Identify patterns in supporting evidence</li>
            </ul>
        </div>
    </div>
);

const CostOptimizationSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Cost Optimisation</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Strategies to reduce costs whilst maintaining insight quality.
            </p>
        </div>

        <div className="space-y-8">
            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Use Cached Data</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Check if recent data exists before running fresh queries. Cached results are free and often sufficient
                    for exploratory analysis.
                </p>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Start Small</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Begin with 500-1000 sample size to validate your query approach. Scale up only when you've confirmed
                    the query delivers the insights you need.
                </p>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Be Specific</h2>
                <p className="text-[13px] font-light text-gray-500 leading-[1.7]">
                    Narrow your target criteria to avoid scraping unnecessary profiles. Specific queries cost less and
                    provide more relevant results.
                </p>
            </div>
        </div>
    </div>
);

const BestPracticesSection = () => (
    <div className="max-w-4xl space-y-12">
        <div>
            <h1 className="text-2xl font-light text-white tracking-tight mb-4">Best Practices</h1>
            <p className="text-[15px] font-light text-gray-400 leading-[1.8]">
                Tips for getting the most accurate and actionable insights.
            </p>
        </div>

        <div className="space-y-10">
            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Query Writing</h2>
                <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <li>• Be specific about your target and objective</li>
                    <li>• Include relevant context (location, follower count, niche)</li>
                    <li>• Use action verbs (Map, Find, Analyse, Track)</li>
                    <li>• Test with smaller samples before scaling up</li>
                </ul>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Sample Sizing</h2>
                <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <li>• Use 500-1000 for initial exploration</li>
                    <li>• Scale to 1000-2000 for strategic decisions</li>
                    <li>• Larger accounts (10k+ followers) provide better statistical significance</li>
                </ul>
            </div>

            <div>
                <h2 className="text-sm font-light text-emerald-400/80 tracking-wide mb-4">Data Interpretation</h2>
                <ul className="space-y-3 text-[13px] font-light text-gray-500 leading-[1.7]">
                    <li>• Always check Data Provenance to verify AI insights</li>
                    <li>• Look for patterns across multiple data points</li>
                    <li>• Consider temporal factors (seasonal trends, campaign timing)</li>
                    <li>• Cross-reference with other data sources when possible</li>
                </ul>
            </div>
        </div>
    </div>
);

export const HelpPage = () => {
    const [activeSection, setActiveSection] = useState('overview');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        const hash = location.hash.replace('#', '');
        if (hash) setActiveSection(hash);
    }, [location]);

    const handleSectionClick = (id: string) => {
        setActiveSection(id);
        navigate(`/help#${id}`);
        setMobileNavOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const renderSection = () => {
        switch (activeSection) {
            case 'overview': return <OverviewSection />;
            case 'quick-start': return <QuickStartSection />;
            case 'brand-affinity': return <BrandAffinitySection />;
            case 'influencer-discovery': return <InfluencerDiscoverySection />;
            case 'geo-discovery': return <GeoDiscoverySection />;
            case 'competitor-analysis': return <CompetitorAnalysisSection />;
            case 'hashtag-tracking': return <HashtagTrackingSection />;
            case 'profile-network': return <ProfileNetworkSection />;
            case 'natural-language': return <NaturalLanguageSection />;
            case 'sample-size': return <SampleSizeSection />;
            case 'cost-estimation': return <CostEstimationSection />;
            case 'fresh-vs-cached': return <FreshVsCachedSection />;
            case '3d-graph': return <GraphNavigationSection />;
            case 'analytics-panel': return <AnalyticsPanelSection />;
            case 'data-provenance': return <DataProvenanceSection />;
            case 'cost-optimization': return <CostOptimizationSection />;
            case 'best-practices': return <BestPracticesSection />;
            default: return <OverviewSection />;
        }
    };

    return (
        <div className="min-h-screen bg-[#051810] text-gray-200 font-sans selection:bg-pink-500 selection:text-white">
            <header className="h-14 bg-[#051810]/95 backdrop-blur flex items-center px-6 sticky top-0 z-50">
                <Link to="/" className="flex items-center gap-2 text-emerald-500/70 hover:text-emerald-400 transition-colors group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-light tracking-wide text-xs">Back</span>
                </Link>
                <button
                    onClick={() => setMobileNavOpen(!mobileNavOpen)}
                    className="ml-4 md:hidden p-2 hover:bg-emerald-500/5 transition-colors text-emerald-500/70"
                >
                    {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </header>

            <div className="flex">
                <aside className={`
                    fixed md:sticky top-14 left-0 h-[calc(100vh-3.5rem)] w-64 bg-[#051810]/95 backdrop-blur
                    overflow-y-auto z-40 transition-transform
                    ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}>
                    <div className="p-6 space-y-8">
                        {NAV_SECTIONS.map((section, i) => (
                            <div key={i}>
                                <div className="text-[10px] font-light text-emerald-500/40 uppercase tracking-[0.2em] mb-3 px-2">
                                    {section.title}
                                </div>
                                <div className="space-y-1">
                                    {section.items.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSectionClick(item.id)}
                                            className={`
                                                w-full flex items-center gap-3 px-2 py-2 text-xs transition-all font-light tracking-wide
                                                ${activeSection === item.id
                                                    ? 'text-emerald-400'
                                                    : 'text-gray-500 hover:text-emerald-400/70'
                                                }
                                            `}
                                        >
                                            <item.icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
                                            <span className="text-left">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="flex-1 p-8 md:p-16 max-w-6xl">
                    {renderSection()}
                </main>
            </div>
        </div>
    );
};
