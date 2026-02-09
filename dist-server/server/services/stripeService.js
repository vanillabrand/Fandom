/**
 * Stripe Payment Service
 *
 * Handles all Stripe payment operations server-side
 */
import Stripe from 'stripe';
// Lazy initialization - only create Stripe instance when first needed (after dotenv loads)
let stripe = null;
function getStripe() {
    if (!stripe) {
        const secret = process.env.STRIPE_SECRET_KEY;
        if (!secret) {
            throw new Error('STRIPE_SECRET_KEY not configured in environment');
        }
        stripe = new Stripe(secret, {
            apiVersion: '2025-12-15.clover'
        });
    }
    return stripe;
}
export class StripeService {
    /**
     * Create a payment intent for balance top-up
     * @param userId - User's Google ID
     * @param amountGBP - Amount in £ (pounds)
     * @param userEmail - User's email for metadata
     * @returns PaymentIntent with client secret
     */
    async createPaymentIntent(userId, amountGBP, userEmail) {
        // Validate amount (£10 min, £1000 max)
        if (amountGBP < 10 || amountGBP > 1000) {
            throw new Error('Amount must be between £10 and £1000');
        }
        // Convert £ to pence (Stripe uses smallest currency unit)
        const amountPence = Math.round(amountGBP * 100);
        try {
            const paymentIntent = await getStripe().paymentIntents.create({
                amount: amountPence,
                currency: 'gbp',
                metadata: {
                    userId,
                    userEmail,
                    purpose: 'balance_topup',
                    amountGBP: amountGBP.toString()
                },
                description: `Balance top-up: £${amountGBP.toFixed(2)}`,
                automatic_payment_methods: {
                    enabled: true
                }
            });
            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id
            };
        }
        catch (error) {
            console.error('Stripe payment intent creation failed:', error);
            throw new Error(`Payment creation failed: ${error.message}`);
        }
    }
    /**
     * Verify payment status
     * @param paymentIntentId - Stripe payment intent ID
     * @returns Payment intent object
     */
    async getPaymentIntent(paymentIntentId) {
        try {
            return await getStripe().paymentIntents.retrieve(paymentIntentId);
        }
        catch (error) {
            console.error('Failed to retrieve payment intent:', error);
            throw new Error(`Payment retrieval failed: ${error.message}`);
        }
    }
    /**
     * Verify webhook signature
     * @param payload - Raw webhook payload
     * @param signature - Stripe signature header
     * @returns Parsed event object
     */
    verifyWebhookSignature(payload, signature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error('Webhook secret not configured');
        }
        try {
            return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
        }
        catch (error) {
            console.error('Webhook signature verification failed:', error);
            throw new Error(`Webhook verification failed: ${error.message}`);
        }
    }
    /**
     * Process successful payment
     * @param paymentIntent - Stripe payment intent
     * @returns Payment details for database logging
     */
    extractPaymentDetails(paymentIntent) {
        const metadata = paymentIntent.metadata;
        return {
            userId: metadata.userId,
            amountGBP: parseFloat(metadata.amountGBP),
            amountPence: paymentIntent.amount,
            paymentIntentId: paymentIntent.id,
            userEmail: metadata.userEmail
        };
    }
    /**
     * Create a refund (admin only)
     * @param paymentIntentId - Payment to refund
     * @param reason - Refund reason
     */
    async createRefund(paymentIntentId, reason) {
        try {
            return await getStripe().refunds.create({
                payment_intent: paymentIntentId,
                reason: reason || 'requested_by_customer'
            });
        }
        catch (error) {
            console.error('Refund creation failed:', error);
            throw new Error(`Refund failed: ${error.message}`);
        }
    }
}
// Singleton instance
export const stripeService = new StripeService();
