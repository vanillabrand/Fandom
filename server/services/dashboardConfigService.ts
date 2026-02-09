import { DashboardConfig, DashboardWidget, DashboardLayoutType } from '../../types.js';

/**
 * Generates a Dynamic Dashboard Configuration based on the Query Intent and Analytics Results.
 * This determines which panels (Overindexing, Content, etc.) are shown to the user.
 */
export const generateDashboardConfig = (
    query: string,
    intent: string,
    analytics: any = null
): DashboardConfig => {

    const widgets: DashboardWidget[] = [];

    // 1. Always include the Main Graph
    widgets.push({
        id: 'main_graph',
        type: 'FandomGraph',
        title: 'Network Graph',
        colSpan: 12,
        rowSpan: 6,
        data: {
            // Data is loaded dynamically by the component from the dataset
            // This placeholder ensures the widget slot exists
        }
    });

    // 1.5 Always include a Summary Metric Card
    widgets.push({
        id: 'metric_summary',
        type: 'MetricCard',
        title: 'Total Reach',
        colSpan: 12,
        rowSpan: 2,
        data: {
            value: analytics?.nodeCount || (analytics?.matches ? analytics.matches.length : 0) || '0',
            label: 'Total Nodes Mapped',
            trend: 0
        }
    });

    // 2. Intelligent Panel Selection based on Intent

    // A. Overindexing / Brand Affinity / Comparison
    const needsOverindexing = ['brand_affinity', 'over_indexing', 'comparison', 'audience_overlap', 'network_clusters'].includes(intent);
    if (needsOverindexing) {
        // [FIX] Combined list of all over-indexed items (creators, brands, topics, keywords, hashtags)
        const topBrands = (analytics?.overindexing?.topBrands || analytics?.brands || []).map((b: any) => ({ ...b, type: 'brand' }));
        const topCreators = (analytics?.overindexing?.topCreators || analytics?.creators || []).map((c: any) => ({ ...c, type: 'creator' }));
        const topTopics = (analytics?.topics || []).map((t: any) => ({ ...t, type: 'topic' }));
        const topHashtags = (analytics?.hashtags || []).map((h: any) => ({ ...h, type: 'hashtag' }));

        const tailItems = [...topBrands, ...topCreators, ...topTopics, ...topHashtags];

        if (tailItems.length > 0) {
            widgets.push({
                id: 'overindexing_panel',
                type: 'AccordionList',
                title: intent === 'over_indexing' ? 'Over-indexed Subject Matter' : 'Audience Affinity & Overindexing',
                colSpan: 4,
                rowSpan: 6,
                data: {
                    items: tailItems
                }
            });
        }
    }

    // [NEW] Comparison Dashboard Widgets
    if ((intent === 'comparison' || intent === 'audience_overlap') && analytics?.comparison) {
        const comp = analytics.comparison;

        // Defensive checks
        if (comp.profiles && Array.isArray(comp.profiles) && comp.profiles.length > 0 && comp.shared) {
            // 1. Overlap Percentage Card
            widgets.push({
                id: 'overlap_percentage',
                type: 'MetricCard',
                title: 'Audience Overlap',
                colSpan: 4,
                rowSpan: 2,
                data: {
                    value: `${comp.overlapPercentage}%`,
                    label: `${comp.shared.count} Shared Followers`,
                    trend: parseFloat(comp.overlapPercentage) || 0
                }
            });

            // 2. Side-by-Side Profile Metrics
            comp.profiles.forEach((profile: any, idx: number) => {
                widgets.push({
                    id: `profile_metrics_${idx}`,
                    type: 'MetricCard',
                    title: profile.name,
                    colSpan: 4,
                    rowSpan: 3,
                    data: {
                        value: profile.totalFollowers.toString(),
                        label: 'Total Followers',
                        description: `${profile.uniqueFollowers} unique, ${profile.sharedFollowers} shared`
                    }
                });
            });

            // 3. Shared Interests
            if ((comp.shared.topics && comp.shared.topics.length > 0) || (comp.shared.brands && comp.shared.brands.length > 0)) {
                widgets.push({
                    id: 'shared_interests',
                    type: 'AccordionList',
                    title: 'Common Ground',
                    colSpan: 6,
                    rowSpan: 4,
                    data: {
                        items: [
                            ...(comp.shared.topics || []).map((topic: string) => ({
                                id: topic,
                                title: topic,
                                type: 'topic'
                            })),
                            ...(comp.shared.brands || []).map((brand: string) => ({
                                id: brand,
                                title: brand,
                                type: 'brand'
                            }))
                        ]
                    }
                });
            }
        }
    }

    // G. Competitor Content Analysis
    if (intent === 'competitor_content_analysis') {
        // Show Hashtags
        widgets.push({
            id: 'top_hashtags',
            type: 'AccordionList',
            title: 'Top Hashtags',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.topics || []).map((t: any) => ({
                    id: t.name,
                    title: t.name,
                    description: t.percentage
                }))
            }
        });

        // Show Mentions
        widgets.push({
            id: 'top_mentions',
            type: 'AccordionList',
            title: 'Top Mentions',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.brands || []).map((b: any) => ({
                    id: b.name,
                    title: b.name,
                    description: b.evidence
                }))
            }
        });
    }

    // H. Hashtag Tracking
    if (intent === 'hashtag_tracking') {
        // Show Co-occurring Hashtags
        widgets.push({
            id: 'related_hashtags',
            type: 'AccordionList',
            title: 'Related Hashtags',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.topics || []).map((t: any) => ({
                    id: t.name,
                    title: t.name,
                    description: t.percentage
                }))
            }
        });

        // Show Top Contributors
        widgets.push({
            id: 'top_contributors',
            type: 'AccordionList',
            title: 'Top Contributors',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.creators || []).map((c: any) => ({
                    id: c.handle,
                    title: c.name || c.handle,
                    description: c.citation
                }))
            }
        });
    }

    // I. Engagement Benchmark
    if (intent === 'engagement_benchmark') {
        const profiles = analytics?.benchmarkAnalysis?.profiles || [];
        profiles.slice(0, 3).forEach((p: any, idx: number) => {
            widgets.push({
                id: `benchmark_card_${idx}`,
                type: 'MetricCard',
                title: p.username,
                colSpan: 4,
                rowSpan: 4,
                data: {
                    value: `${p.engagementRate}%`,
                    label: 'Engagement Rate',
                    description: `${p.avgEngagement} Avg Actions / Post`,
                    trend: parseFloat(p.engagementRate)
                }
            });
        });
    }

    // J. UGC Discovery
    if (intent === 'ugc_discovery') {
        // Show Top Creators (UGC Sources)
        widgets.push({
            id: 'ugc_creators',
            type: 'AccordionList',
            title: 'Top UGC Creators',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.overindexing?.topCreators || []).map((c: any) => ({
                    id: c.handle,
                    title: c.name || c.handle,
                    description: c.citation
                }))
            }
        });
    }

    // B. Content / Topics / Viral
    const needsContent = ['subject_matter', 'viral_content', 'trending', 'topic_analysis', 'competitor_content_analysis', 'hashtag_tracking', 'engagement_benchmark', 'ugc_discovery'].includes(intent);
    if (needsContent) {
        widgets.push({
            id: 'content_gallery',
            type: 'PostGallery',
            title: 'Top Content & Trends',
            colSpan: (intent === 'competitor_content_analysis' || intent === 'hashtag_tracking' || intent === 'ugc_discovery') ? 4 : 12, // Compact for specific analysis modes
            rowSpan: 6,
            data: analytics?.topContent || []
        });
    }

    // C. Influencer Identification
    if (intent === 'influencer_identification' || intent === 'bio_search') {
        widgets.push({
            id: 'creator_list',
            type: 'AccordionList',
            title: 'Top Identified Profiles',
            colSpan: 4,
            rowSpan: 6,
            data: {
                items: (analytics?.overindexing?.topCreators || []).map((c: any) => ({
                    id: c.handle || c.name,
                    title: c.name || c.handle,
                    description: c.citation || c.evidence,
                    type: 'profile'
                }))
            }
        });
    }

    // D. Sentiment & Vibe Analysis
    if (intent === 'sentiment_analysis') {
        const sentimentData = (analytics as any)?.sentimentAnalysis;

        // 1. Sentiment Score Card
        widgets.push({
            id: 'sentiment_card',
            type: 'MetricCard',
            title: 'Community Sentiment',
            colSpan: 12,
            rowSpan: 2,
            data: {
                value: sentimentData?.aggregate_score?.toFixed(2) || '0.00',
                label: sentimentData?.dominant_emotion || 'Neutral',
                trend: (sentimentData?.polarization_score || 0) * 100 // Visual proxy for polarization
            }
        });

        // 2. Vibe Summary Text
        // We can use a MetricCard to show the text description if it fits, or assume the UI handles top-level summary

        // 2. Ranked Posts (by sentiment/emotion)
        widgets.push({
            id: 'emotion_gallery',
            type: 'PostGallery',
            title: 'Key Emotional Drivers',
            colSpan: 12,
            rowSpan: 4,
            data: analytics?.topContent || []
        });

        // 3. Top Themes
        if (sentimentData?.top_themes && sentimentData.top_themes.length > 0) {
            widgets.push({
                id: 'sentiment_themes',
                type: 'AccordionList',
                title: 'Recurring Themes',
                colSpan: 12,
                rowSpan: 4,
                data: {
                    items: sentimentData.top_themes.map((t: any) => ({
                        id: t.term,
                        title: t.term,
                        description: `mentioned ${t.count} times (Sentiment: ${t.sentiment > 0 ? '+' : ''}${t.sentiment})`,
                        type: 'topic'
                    }))
                }
            });
        }
    }

    // E. Fandom Lexicon
    if (intent === 'lexicon_analysis') {
        const lexicon = analytics?.visualAnalysis?.lexicon || [];

        widgets.push({
            id: 'lexicon_list',
            type: 'AccordionList',
            title: 'Fandom Lexicon & Slang',
            colSpan: 12,
            rowSpan: 6,
            data: {
                items: lexicon.map((term: any) => ({
                    id: term.term,
                    title: term.term,
                    metadata: {
                        category: term.category,
                        popularity: term.popularity,
                        definition: term.definition,
                        example: term.example
                    }
                }))
            }
        });
    }

    // F. Geo-Scouting
    if (intent === 'geo_discovery') {
        const geoData = analytics?.visualAnalysis?.geoData || [];
        const sortedGeo = geoData.sort((a: any, b: any) => b.count - a.count).slice(0, 10);

        widgets.push({
            id: 'geo_chart',
            type: 'ChartPanel',
            title: 'Top Locations (Global Heatmap)',
            colSpan: 12,
            rowSpan: 6,
            data: {
                labels: sortedGeo.map((d: any) => d.name),
                datasets: [{
                    label: 'Fan Density',
                    data: sortedGeo.map((d: any) => d.count),
                    backgroundColor: '#10b981'
                }]
            }
        });
    }

    // Default Layout
    return {
        id: `dash_${Date.now()}`,
        layout: 'content-grid',
        widgets
    };
};
