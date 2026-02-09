import cron from 'node-cron';
import { generateGeminiContent, generateMarketingQuestionsPrompt } from '../../services/geminiService.js';
import { mongoService } from './mongoService.js';

class MarketingService {
    private isScheduled = false;

    // Start the daily cron job (runs at midnight)
    startCron() {
        if (this.isScheduled) {
            console.log('[MarketingService] Cron already scheduled.');
            return;
        }

        // Schedule for 00:00 every day
        cron.schedule('0 0 * * *', async () => {
            console.log('[MarketingService] 🕛 Running daily marketing questions job...');
            await this.generateAndStoreQuestions();
        });

        this.isScheduled = true;
        console.log('[MarketingService] ✅ Daily questions job scheduled (00:00).');

        // Check if we have questions for today on startup, if not, generate them
        this.ensureQuestionsForToday();
    }

    async ensureQuestionsForToday() {
        try {
            const latest = await mongoService.getLatestMarketingQuestions();
            const today = new Date().setHours(0, 0, 0, 0);

            if (!latest || new Date(latest.generatedAt).setHours(0, 0, 0, 0) < today) {
                console.log('[MarketingService] No questions for today found. Generating now...');
                await this.generateAndStoreQuestions();
            } else {
                console.log(`[MarketingService] Questions for today already exist (${latest.questions.length}).`);
            }
        } catch (error) {
            console.error('[MarketingService] Failed to ensure questions:', error);
        }
    }

    async generateAndStoreQuestions() {
        try {
            console.log('[MarketingService] 🧠 Prompting Gemini for marketing questions...');
            const prompt = generateMarketingQuestionsPrompt();

            // Call Gemini
            const text = await generateGeminiContent(prompt);

            // Parse JSON response
            let questions: string[] = [];
            try {
                // Sanitize markdown if present
                const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
                questions = JSON.parse(cleanText);
            } catch (parseError) {
                console.error('[MarketingService] Failed to parse Gemini response:', text);
                return;
            }

            if (!Array.isArray(questions) || questions.length === 0) {
                console.error('[MarketingService] Received invalid format from Gemini.');
                return;
            }

            console.log(`[MarketingService] ✅ Received ${questions.length} questions.`);

            // Store in MongoDB
            await mongoService.saveMarketingQuestions(questions);
            console.log('[MarketingService] 💾 Questions saved to MongoDB.');

        } catch (error) {
            console.error('[MarketingService] Error generating questions:', error);
        }
    }

    // Force regeneration (for testing/admin)
    async forceGenerate() {
        return this.generateAndStoreQuestions();
    }
}

export const marketingService = new MarketingService();
