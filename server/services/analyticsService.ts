/**
 * User Analytics Service
 * 
 * Provides insights, trends, benchmarks, and ROI calculations
 */

import { mongoService } from './mongoService.js';

interface UsageTrend {
    date: string;
    queryCount: number;
    totalCost: number;
    totalCharged: number;
    avgQueryCost: number;
    featureBreakdown: Record<string, { count: number; cost: number }>;
}

interface Insight {
    type: 'cost_optimization' | 'usage_pattern' | 'recommendation';
    title: string;
    description: string;
    potentialSavings?: number;
    actionable: boolean;
    priority: 'high' | 'medium' | 'low';
}

interface Benchmark {
    userRank: number;        // Percentile (0-100)
    avgQueries: number;      // Platform average
    userQueries: number;     // User's count
    avgCostPerQuery: number; // Platform average
    userCostPerQuery: number;// User's average
}

export class AnalyticsService {

    /**
     * Get user's usage trends over time
     */
    async getUserUsageTrends(userId: string, months: number = 3): Promise<UsageTrend[]> {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const logs = await mongoService.getUserUsageLogs(userId, startDate);

        // Group by date
        const dailyData = new Map<string, UsageTrend>();

        logs.forEach(log => {
            const dateKey = log.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD

            if (!dailyData.has(dateKey)) {
                dailyData.set(dateKey, {
                    date: dateKey,
                    queryCount: 0,
                    totalCost: 0,
                    totalCharged: 0,
                    avgQueryCost: 0,
                    featureBreakdown: {}
                });
            }

            const trend = dailyData.get(dateKey)!;
            trend.queryCount++;
            trend.totalCost += log.totalCost;
            trend.totalCharged += log.chargedAmount;

            if (!trend.featureBreakdown[log.action]) {
                trend.featureBreakdown[log.action] = { count: 0, cost: 0 };
            }
            trend.featureBreakdown[log.action].count++;
            trend.featureBreakdown[log.action].cost += log.chargedAmount;
        });

        // Calculate averages
        dailyData.forEach(trend => {
            trend.avgQueryCost = trend.queryCount > 0
                ? Math.round((trend.totalCharged / trend.queryCount) * 100) / 100
                : 0;
        });

        return Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Generate AI-powered cost optimization insights
     */
    async generateInsights(userId: string): Promise<Insight[]> {
        const insights: Insight[] = [];
        const logs = await mongoService.getUserMonthlyUsage(userId, new Date().toISOString().slice(0, 7));

        if (logs.length === 0) return insights;

        // Calculate stats
        const totalQueries = logs.length;
        const avgCost = logs.reduce((sum, log) => sum + log.chargedAmount, 0) / totalQueries;
        const featureUsage = this.getFeatureUsageStats(logs);

        // Insight 1: Sample size optimization
        const highCostQueries = logs.filter(log => log.chargedAmount > avgCost * 1.5);
        if (highCostQueries.length > 0) {
            const potentialSavings = highCostQueries.reduce((sum, log) => sum + (log.chargedAmount - avgCost), 0);
            insights.push({
                type: 'cost_optimization',
                title: 'Optimize Sample Sizes',
                description: `${highCostQueries.length} queries cost more than average. Consider reducing sample size from 500 to 300 for simpler queries.`,
                potentialSavings: Math.round(potentialSavings * 0.4 * 100) / 100, // 40% savings estimate, rounded to 2dp
                actionable: true,
                priority: potentialSavings > 10 ? 'high' : 'medium'
            });
        }

        // Insight 2: Feature recommendation
        if (featureUsage.query_builder > 0 && featureUsage.quick_map === 0) {
            insights.push({
                type: 'recommendation',
                title: 'Try Quick Map',
                description: 'Quick Map is 60% faster and 70% cheaper for location-based queries. Great for simple mapping tasks.',
                potentialSavings: Math.round(avgCost * 0.7 * (totalQueries * 0.3) * 100) / 100, // Assume 30% could use Quick Map, rounded to 2dp
                actionable: true,
                priority: 'medium'
            });
        }

        // Insight 3: Usage pattern
        const dayOfWeekUsage = this.getDayOfWeekPattern(logs);
        const peakDay = Object.keys(dayOfWeekUsage).reduce((a, b) => dayOfWeekUsage[a] > dayOfWeekUsage[b] ? a : b);
        if (dayOfWeekUsage[peakDay] > totalQueries * 0.5) {
            insights.push({
                type: 'usage_pattern',
                title: `Peak Usage on ${peakDay}s`,
                description: `You run ${Math.round(dayOfWeekUsage[peakDay] / totalQueries * 100)}% of queries on ${peakDay}s. Consider spreading queries throughout the week for better analysis.`,
                actionable: false,
                priority: 'low'
            });
        }

        return insights.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    /**
     * Get user benchmark compared to platform averages
     */
    async getUserBenchmark(userId: string): Promise<Benchmark> {
        const currentMonth = new Date().toISOString().slice(0, 7);

        // Get user stats
        const userLogs = await mongoService.getUserMonthlyUsage(userId, currentMonth);
        const userQueries = userLogs.length;
        const userTotalCost = userLogs.reduce((sum, log) => sum + log.chargedAmount, 0);
        const userCostPerQuery = userQueries > 0 ? userTotalCost / userQueries : 0;

        // Get all users' stats for comparison (anonymized)
        const allUsers = await mongoService.getAllUsers();
        const activeUsers = allUsers.filter(u => u.status === 'active');

        const allUsersStats = await Promise.all(
            activeUsers.map(async user => {
                const logs = await mongoService.getUserMonthlyUsage(user.googleId, currentMonth);
                return {
                    userId: user.googleId,
                    queries: logs.length,
                    totalCost: logs.reduce((sum, log) => sum + log.chargedAmount, 0)
                };
            })
        );

        // Calculate platform averages
        const totalQueries = allUsersStats.reduce((sum, s) => sum + s.queries, 0);
        const avgQueries = allUsersStats.length > 0 ? totalQueries / allUsersStats.length : 0;

        const usersWithQueries = allUsersStats.filter(s => s.queries > 0);
        const avgCostPerQuery = usersWithQueries.length > 0
            ? usersWithQueries.reduce((sum, s) => sum + (s.totalCost / s.queries), 0) / usersWithQueries.length
            : 0;

        // Calculate percentile rank
        const sortedByQueries = allUsersStats.map(s => s.queries).sort((a, b) => a - b);
        const userPosition = sortedByQueries.filter(q => q <= userQueries).length;
        const userRank = allUsersStats.length > 0 ? Math.round((userPosition / allUsersStats.length) * 100) : 50;

        return {
            userRank,
            avgQueries: Math.round(avgQueries),
            userQueries,
            avgCostPerQuery: Math.round(avgCostPerQuery * 100) / 100,
            userCostPerQuery: Math.round(userCostPerQuery * 100) / 100
        };
    }

    /**
     * Calculate ROI based on user inputs
     */
    calculateROI(params: {
        monthlySubscription: number;
        monthlyUsage: number;
        queriesPerMonth: number;
        hoursPerQuery: number;
        hourlyRate: number;
        leadsGenerated?: number;
    }): {
        totalCost: number;
        timeSaved: number;
        valueCreated: number;
        roi: number;
        paybackDays: number;
        costPerLead?: number;
    } {
        const totalCost = params.monthlySubscription + params.monthlyUsage;
        const timeSaved = params.queriesPerMonth * params.hoursPerQuery;
        const valueCreated = timeSaved * params.hourlyRate;
        const roi = totalCost > 0 ? ((valueCreated - totalCost) / totalCost) * 100 : 0;
        const paybackDays = totalCost > 0 ? (totalCost / (valueCreated / 30)) : 0;

        const result: any = {
            totalCost: Math.round(totalCost * 100) / 100,
            timeSaved: Math.round(timeSaved * 10) / 10,
            valueCreated: Math.round(valueCreated * 100) / 100,
            roi: Math.round(roi),
            paybackDays: Math.round(paybackDays * 10) / 10
        };

        if (params.leadsGenerated && params.leadsGenerated > 0) {
            result.costPerLead = Math.round((totalCost / params.leadsGenerated) * 100) / 100;
        }

        return result;
    }

    // Helper methods
    private getFeatureUsageStats(logs: any[]): Record<string, number> {
        const stats: Record<string, number> = {
            query_builder: 0,
            quick_map: 0,
            deep_search: 0
        };

        logs.forEach(log => {
            if (stats[log.action] !== undefined) {
                stats[log.action]++;
            }
        });

        return stats;
    }

    private getDayOfWeekPattern(logs: any[]): Record<string, number> {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const pattern: Record<string, number> = {};
        days.forEach(day => pattern[day] = 0);

        logs.forEach(log => {
            const dayName = days[log.timestamp.getDay()];
            pattern[dayName]++;
        });

        return pattern;
    }
}

// Singleton instance
export const analyticsService = new AnalyticsService();
