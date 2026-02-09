import { mongoService } from './mongoService.js';
import scraperRegistryRaw from '../../scraper_detail.json' with { type: "json" };

export class CostCalculator {
    private config: any = null;
    private scraperMap: Map<string, number> = new Map();

    constructor() {
        // Initialize Scraper Map from Registry
        (scraperRegistryRaw as any[]).forEach(scraper => {
            if (scraper.id && scraper.costPerThousand) {
                this.scraperMap.set(scraper.id, scraper.costPerThousand);
            }
        });
    }

    async loadPricingConfig() {
        this.config = await mongoService.getPricingConfig();
        if (!this.config) {
            // Fallback default config if DB is empty
            this.config = {
                margin: 1.5, // 50% margin default
                costs: {
                    scrapingPer1000: 5.0,
                    geminiPerToken: 0.000001,
                    apifyComputeUnit: 0.25,
                    apifyProxyPerGB: 0.2, // ~ $10/GB real cost? usually cheaper via Apify
                    forumScoutPerRecord: 0.01
                }
            };
        }
    }

    async ensureConfig() {
        if (!this.config) {
            await this.loadPricingConfig();
        }
    }

    /**
     * Calculate Price for a Single Step (Base Cost * Margin)
     * Used by Orchestrator for line-item quotes
     */
    async calculateStepPrice(actorId: string, recordCount: number): Promise<{ estimatedCost: number; baseCost: number }> {
        await this.ensureConfig();

        // 1. Get Base Rate (USD usually, or whatever is in json)
        // Default to a safe fallback (e.g. $5.00/1k) if actor not found
        let baseRate = this.scraperMap.get(actorId) || 5.00;

        // Handle mapped/legacy IDs if they differ from registry
        if (!this.scraperMap.has(actorId)) {
            // Try to find by name or partial match? No, precise ID is better.
            // Just specific overrides for known aliases if needed
            if (actorId.includes('followers')) baseRate = 5.00;
            else if (actorId.includes('profile')) baseRate = 4.60;
        }

        // 2. Calculate Base Cost (Pro-rated)
        // recordCount is usually "results limit" or "sample size"
        const baseCost = (recordCount / 1000) * baseRate;

        // 3. Apply Margin
        // "margin" in config is a multiplier (e.g. 1.3 or 1.5)
        const margin = this.config.margin || 1.3;

        // 4. Convert to GBP if Base Rates are USD? 
        // Assuming scraper_detail.json is USD (Apify standard) and we charge in GBP.
        // Simple conversion rate: 0.8 GBP = 1 USD
        const currencyRate = 0.8;

        const finalBaseGBP = baseCost * currencyRate;
        const finalPriceGBP = finalBaseGBP * margin;

        return {
            estimatedCost: Number(finalPriceGBP.toFixed(2)),
            baseCost: Number(finalBaseGBP.toFixed(2))
        };
    }

    /**
     * Calculate cost for Query Builder execution (Overall Estimate)
     */
    async calculateQueryBuilderCost(profileCount: number = 50, actorId: string = 'apify/instagram-scraper'): Promise<{
        totalCost: number;
        chargedAmount: number;
        breakdown: any;
    }> {
        await this.ensureConfig();

        // Load specific rate
        const stepPrice = await this.calculateStepPrice(actorId, profileCount);

        // Estimate Gemini tokens (10k base + 50 per profile)
        const geminiTokens = 10000 + (profileCount * 50);
        const geminiCost = geminiTokens * (this.config.costs.geminiPerToken || 0.000001);

        // Estimate Apify compute units (base 1 + 0.01 per profile)
        const computeUnits = 1 + (profileCount * 0.01);
        const apifyCost = computeUnits * (this.config.costs.apifyComputeUnit || 0.25);

        // Estimate proxy bandwidth (base 10mb + 0.1mb per profile)
        const proxyMB = 10 + (profileCount * 0.1);
        const proxyGB = proxyMB / 1024;
        const proxyCost = proxyGB * (this.config.costs.apifyProxyPerGB || 0.2);

        // Total Technical Cost (GBP)
        // Note: stepPrice.baseCost is already in GBP
        const totalTechnicalCost = geminiCost + apifyCost + proxyCost + stepPrice.baseCost;

        // Total Price to User (with Margin)
        const margin = this.config.margin || 1.3;
        let chargedAmount = totalTechnicalCost * margin;

        // Add base orchestration fee
        const baseFee = 2.50;
        chargedAmount += baseFee;

        return {
            totalCost: totalTechnicalCost,
            chargedAmount: Number(chargedAmount.toFixed(2)),
            breakdown: {
                gemini: { tokens: geminiTokens, cost: geminiCost },
                apify: { computeUnits, cost: apifyCost },
                proxy: { mb: proxyMB, cost: proxyCost },
                scraping: { profiles: profileCount, cost: stepPrice.baseCost },
                orchestrationFee: baseFee
            }
        };

    }

    /**
     * Calculate cost for Quick Map
     */
    async calculateQuickMapCost(profileCount: number = 20): Promise<{
        totalCost: number;
        chargedAmount: number;
        breakdown: any;
    }> {
        await this.ensureConfig();

        // Quick Map uses less resources
        const geminiTokens = 5000 + (profileCount * 50);
        const geminiCost = geminiTokens * this.config.costs.geminiPerToken;

        const computeUnits = 1 + (profileCount * 0.03);
        const apifyCost = computeUnits * this.config.costs.apifyComputeUnit;

        const proxyMB = 15 + (profileCount * 0.3);
        const proxyGB = proxyMB / 1024;
        const proxyCost = proxyGB * this.config.costs.apifyProxyPerGB;

        const scrapingCost = (profileCount / 1000) * this.config.costs.scrapingPer1000;

        const totalCost = geminiCost + apifyCost + proxyCost + scrapingCost;
        const chargedAmount = totalCost * this.config.margin;

        return {
            totalCost,
            chargedAmount: Number(chargedAmount.toFixed(2)),
            breakdown: {
                gemini: { tokens: geminiTokens, cost: geminiCost },
                apify: { computeUnits, cost: apifyCost },
                proxy: { mb: proxyMB, cost: proxyCost },
                scraping: { profiles: profileCount, cost: scrapingCost }
            }
        };
    }

    /**
     * Calculate cost for Deep Search
     */
    async calculateDeepSearchCost(searchResults: number = 100): Promise<{
        totalCost: number;
        chargedAmount: number;
        breakdown: any;
    }> {
        await this.ensureConfig();

        const geminiTokens = 8000 + (searchResults * 30);
        const geminiCost = geminiTokens * this.config.costs.geminiPerToken;

        const computeUnits = 1.5;
        const apifyCost = computeUnits * this.config.costs.apifyComputeUnit;

        // ForumScout API calls
        const forumScoutCost = Math.min(searchResults, 50) * this.config.costs.forumScoutPerRecord;

        const totalCost = geminiCost + apifyCost + forumScoutCost;
        const chargedAmount = totalCost * this.config.margin;

        return {
            totalCost,
            chargedAmount: Number(chargedAmount.toFixed(2)),
            breakdown: {
                gemini: { tokens: geminiTokens, cost: geminiCost },
                apify: { computeUnits, cost: apifyCost },
                forumScout: { records: Math.min(searchResults, 50), cost: forumScoutCost }
            }
        };
    }

    /**
     * Calculate cost for AI-only analysis
     */
    async calculateAiAnalysisCost(sampleSize: number = 100): Promise<{
        totalCost: number;
        chargedAmount: number;
        breakdown: any;
    }> {
        await this.ensureConfig();

        const geminiTokens = 15000 + (sampleSize * 100); // AI analysis is token-heavy
        const geminiCost = geminiTokens * this.config.costs.geminiPerToken;

        const totalCost = geminiCost; // No scraping/proxy for pure AI
        const chargedAmount = totalCost * this.config.margin;

        return {
            totalCost,
            chargedAmount: Number(chargedAmount.toFixed(2)),
            breakdown: {
                gemini: { tokens: geminiTokens, cost: geminiCost }
            }
        };
    }


    /**
     * Track usage and deduct balance
     */
    async trackUsageAndDeduct(
        userId: string,
        action: 'query_builder' | 'quick_map' | 'deep_search',
        description: string,
        cost: { totalCost: number; chargedAmount: number; breakdown: any }
    ): Promise<{ success: boolean; newBalance: number }> {
        // [FIX] Admin Bypass
        const user = await mongoService.getUser(userId);
        const isAdmin = user && user.email && mongoService.isAdmin(user.email);

        if (isAdmin) {
            console.log(`[CostCalculator] 🛡️ Admin bypass for usage deduction (user: ${user?.email})`);
            // Log usage with 0 charged amount for admins
            const month = new Date().toISOString().slice(0, 7);
            const currentAdminBalance = await mongoService.getUserBalance(userId);

            await mongoService.logUsage({
                userId,
                timestamp: new Date(),
                month,
                action,
                description: `[Admin Bypass] ${description}`,
                costs: cost.breakdown,
                totalCost: 0,
                chargedAmount: 0,
                balance: currentAdminBalance
            });
            return { success: true, newBalance: currentAdminBalance };
        }

        // Check balance first
        const currentBalance = await mongoService.getUserBalance(userId);

        if (currentBalance < cost.chargedAmount) {
            throw new Error(`Insufficient balance. Required: £${cost.chargedAmount.toFixed(2)}, Available: £${currentBalance.toFixed(2)}`);
        }

        // Deduct balance
        const newBalance = await mongoService.deductBalance(userId, cost.chargedAmount);

        // Log usage
        const month = new Date().toISOString().slice(0, 7);
        await mongoService.logUsage({
            userId,
            timestamp: new Date(),
            month,
            action,
            description,
            costs: cost.breakdown,
            totalCost: cost.totalCost,
            chargedAmount: cost.chargedAmount,
            balance: newBalance
        });

        return { success: true, newBalance };
    }
}

// Singleton instance
export const costCalculator = new CostCalculator();
