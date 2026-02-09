/**
 * Invoice Generation Service
 *
 * Generates monthly invoices from usage logs
 * Sends professional invoices via MailJet
 */
import { mongoService } from './mongoService.js';
// @ts-ignore - node-mailjet has incomplete type definitions
import Mailjet from 'node-mailjet';
export class InvoiceService {
    constructor() {
        this.mailjetClient = null;
    }
    getMailjetClient() {
        if (!this.mailjetClient) {
            const apiKey = process.env.MAILJET_API_KEY || process.env.MAILJET_APIKEY || process.env.MJ_APIKEY_PUBLIC;
            const secretKey = process.env.MAILJET_SECRET_KEY || process.env.MAILJET_APISECRET || process.env.MJ_APIKEY_PRIVATE;
            if (!apiKey || !secretKey) {
                throw new Error('MailJet credentials not configured. Set MAILJET_APIKEY and MAILJET_APISECRET in .env.local');
            }
            // Initialize Mailjet client
            this.mailjetClient = new Mailjet(apiKey, secretKey);
        }
        return this.mailjetClient;
    }
    /**
   * Generate invoice for a user for a specific month
   */
    async generateMonthlyInvoice(userId, month) {
        // ✅ FIX #1: DUPLICATE CHECK
        const existing = await mongoService.getInvoiceByUserAndMonth(userId, month);
        if (existing) {
            console.warn(`[InvoiceService] Invoice already exists for ${userId} in ${month}`);
            return { invoice: existing, skipped: true };
        }
        // Get user details
        const user = await mongoService.getUser(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }
        // Get pricing config
        const pricing = await mongoService.getPricingConfig();
        if (!pricing) {
            throw new Error('Pricing config not found');
        }
        // Get usage logs for the month
        const usageLogs = await mongoService.getUserMonthlyUsage(userId, month);
        // Calculate totals
        const usageTotal = usageLogs.reduce((sum, log) => sum + log.chargedAmount, 0);
        const baseSubscription = pricing.baseSubscription;
        const totalAmount = baseSubscription + usageTotal;
        // Group usage by action type
        const usageBreakdown = {};
        usageLogs.forEach(log => {
            if (!usageBreakdown[log.action]) {
                usageBreakdown[log.action] = { count: 0, total: 0, items: [] };
            }
            usageBreakdown[log.action].count++;
            usageBreakdown[log.action].total += log.chargedAmount;
            usageBreakdown[log.action].items.push({
                date: log.timestamp,
                description: log.description,
                amount: log.chargedAmount
            });
        });
        // ✅ FIX #2 & #4: Create invoice with ALL REQUIRED FIELDS + improved ID
        const invoiceId = `INV-${month}-${userId}`; // Use full userId (not substring)
        const invoice = {
            invoiceId: invoiceId, // ✅ ADDED
            id: invoiceId,
            userId,
            month: month, // ✅ ADDED
            totalCost: totalAmount, // ✅ ADDED
            amount: totalAmount,
            totalQueries: usageLogs.length, // ✅ ADDED
            description: `Monthly Invoice - ${new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
            status: 'pending', // Changed from 'sent' to 'pending'
            generatedAt: new Date(), // ✅ ADDED
            createdAt: new Date(),
            sentAt: undefined, // Not sent yet
            paidAt: undefined, // Not paid yet
            dueDate: new Date(new Date().setDate(new Date().getDate() + 30)), // 30 days
            items: [
                {
                    description: 'Base Subscription',
                    quantity: 1,
                    unitPrice: baseSubscription,
                    total: baseSubscription
                },
                ...Object.entries(usageBreakdown).map(([action, data]) => ({
                    description: this.getActionLabel(action),
                    quantity: data.count,
                    unitPrice: data.total / data.count,
                    total: data.total
                }))
            ]
        };
        // Save to database
        await mongoService.createInvoice(invoice);
        // Send invoice email to user
        try {
            await this.sendInvoiceEmail(userId, invoiceId);
            // Update status to 'sent'
            await mongoService.updateInvoice(invoiceId, {
                status: 'sent',
                sentAt: new Date()
            });
            console.log(`✅ Invoice ${invoiceId} generated and emailed to ${user.email}`);
        }
        catch (emailError) {
            console.error(`⚠️ Invoice ${invoiceId} generated but email failed:`, emailError.message);
            // Don't throw - invoice was created successfully even if email fails
        }
        return {
            invoice,
            user,
            usageBreakdown,
            usageLogs
        };
    }
    /**
     * Generate invoices for all active users for a specific month
     */
    async generateAllMonthlyInvoices(month) {
        const users = await mongoService.getAllUsers();
        const results = [];
        let success = 0;
        let failed = 0;
        for (const user of users) {
            // Only generate for active users
            if (user.status !== 'active') {
                continue;
            }
            try {
                const result = await this.generateMonthlyInvoice(user.googleId, month);
                results.push({
                    userId: user.googleId,
                    email: user.email,
                    success: true,
                    invoiceId: result.invoice.id,
                    amount: result.invoice.amount
                });
                success++;
            }
            catch (error) {
                console.error(`Failed to generate invoice for ${user.email}:`, error.message);
                results.push({
                    userId: user.googleId,
                    email: user.email,
                    success: false,
                    error: error.message
                });
                failed++;
            }
        }
        return { success, failed, results };
    }
    /**
     * Send invoice email via MailJet
     */
    async sendInvoiceEmail(userId, invoiceId) {
        try {
            // Get invoice
            const invoices = await mongoService.getAllInvoices({ limit: 1000 });
            const invoice = invoices.find(inv => inv.id === invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            // Get user
            const user = await mongoService.getUser(userId);
            if (!user) {
                throw new Error('User not found');
            }
            // Generate email HTML
            const emailHtml = this.generateInvoiceEmailHTML(invoice, user);
            // Send via MailJet
            const mailjet = this.getMailjetClient();
            const request = await mailjet.post('send', { version: 'v3.1' }).request({
                Messages: [
                    {
                        From: {
                            Email: process.env.MAILJET_FROM_EMAIL || 'billing@fandom-analytics.com',
                            Name: 'Fandom Analytics Billing'
                        },
                        To: [
                            {
                                Email: user.email,
                                Name: user.name
                            }
                        ],
                        Subject: `Invoice ${invoice.id} - £${invoice.amount.toFixed(2)}`,
                        HTMLPart: emailHtml,
                        TextPart: this.generateInvoiceEmailText(invoice, user)
                    }
                ]
            });
            console.log(`Invoice email sent to ${user.email}: ${invoice.id}`);
            return true;
        }
        catch (error) {
            console.error('Failed to send invoice email:', error);
            return false;
        }
    }
    /**
     * Generate HTML invoice email template
     */
    generateInvoiceEmailHTML(invoice, user) {
        const monthYear = new Date(invoice.createdAt).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric'
        });
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
        .invoice-details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
        .items-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
        .total-row { background: #ecfdf5; font-weight: bold; font-size: 18px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        .button { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">Fandom Analytics</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Monthly Invoice</p>
        </div>
        
        <div class="content">
            <h2>Hi ${user.name},</h2>
            <p>Thank you for using Fandom Analytics! Here's your invoice for ${monthYear}.</p>
            
            <div class="invoice-details">
                <table style="width: 100%;">
                    <tr>
                        <td><strong>Invoice Number:</strong></td>
                        <td>${invoice.id}</td>
                    </tr>
                    <tr>
                        <td><strong>Invoice Date:</strong></td>
                        <td>${new Date(invoice.createdAt).toLocaleDateString('en-GB')}</td>
                    </tr>
                    <tr>
                        <td><strong>Due Date:</strong></td>
                        <td>${new Date(invoice.dueDate).toLocaleDateString('en-GB')}</td>
                    </tr>
                    <tr>
                        <td><strong>Billing Period:</strong></td>
                        <td>${monthYear}</td>
                    </tr>
                </table>
            </div>

            <h3>Invoice Items</h3>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.items?.map((item) => `
                        <tr>
                            <td>${item.description}</td>
                            <td>${item.quantity}</td>
                            <td>£${item.unitPrice.toFixed(2)}</td>
                            <td style="text-align: right;">£${item.total.toFixed(2)}</td>
                        </tr>
                    `).join('') || ''}
                    <tr class="total-row">
                        <td colspan="3">TOTAL</td>
                        <td style="text-align: right;">£${invoice.amount.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            <p style="margin-top: 30px;">
                Payment is due within 30 days. If you have any questions about this invoice, 
                please don't hesitate to contact us.
            </p>

            <center>
                <a href="${process.env.APP_URL || 'https://fandom-analytics.com'}/profile" class="button">
                    View Full Details
                </a>
            </center>
        </div>

        <div class="footer">
            <p>Fandom Analytics Ltd | billing@fandom-analytics.com</p>
            <p>This is an automated email. Please do not reply directly to this message.</p>
        </div>
    </div>
</body>
</html>
        `;
    }
    /**
     * Generate plain text invoice email
     */
    generateInvoiceEmailText(invoice, user) {
        const monthYear = new Date(invoice.createdAt).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric'
        });
        return `
Hi ${user.name},

Thank you for using Fandom Analytics! Here's your invoice for ${monthYear}.

Invoice Details:
----------------
Invoice Number: ${invoice.id}
Invoice Date: ${new Date(invoice.createdAt).toLocaleDateString('en-GB')}
Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-GB')}
Billing Period: ${monthYear}

Items:
------
${invoice.items?.map((item) => `${item.description} x${item.quantity} - £${item.total.toFixed(2)}`).join('\n') || ''}

TOTAL: £${invoice.amount.toFixed(2)}

Payment is due within 30 days. If you have any questions, please contact us.

Best regards,
Fandom Analytics Team
        `;
    }
    getActionLabel(action) {
        const labels = {
            query_builder: 'Query Builder',
            quick_map: 'Quick Map',
            deep_search: 'Deep Search',
            batch_analysis: 'Batch Analysis'
        };
        return labels[action] || action;
    }
}
// Singleton instance
export const invoiceService = new InvoiceService();
