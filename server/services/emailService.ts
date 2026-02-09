
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

// User's email for critical alerts
const ALERT_RECIPIENT = 'vanillabrand@gmail.com';


class EmailService {
    private transporter: nodemailer.Transporter | null = null;
    private logPath: string;
    private mailjetAuth: string | null = null;
    private initialized = false;

    constructor() {
        this.logPath = path.join(process.cwd(), 'logs', 'email_alerts.log');
        this.ensureLogDir();
        // Don't initialize email services here - wait for first use
    }

    private ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Check for Mailjet API
        if (process.env.MAILJET_APIKEY && process.env.MAILJET_APISECRET) {
            this.mailjetAuth = Buffer.from(`${process.env.MAILJET_APIKEY}:${process.env.MAILJET_APISECRET}`).toString('base64');
            console.log('[EmailService] Mailjet API credentials found. Using Mailjet API v3.1.');
        }
        // 2. Fallback to SMTP
        else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
            console.log('[EmailService] SMTP Transporter initialized.');
        } else {
            console.log('[EmailService] No Email config found. Falling back to file logging.');
        }
    }

    private ensureLogDir() {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Generic Send Method
    async sendEmail(to: string, subject: string, htmlBody: string, textBody?: string): Promise<boolean> {
        this.ensureInitialized(); // Lazy initialization

        // Option 1: Mailjet API
        if (this.mailjetAuth) {
            return this.sendViaMailjet(to, subject, htmlBody, textBody);
        }

        // Option 2: SMTP
        if (this.transporter) {
            try {
                await this.transporter.sendMail({
                    from: `"Fandom System" <${process.env.SMTP_FROM || 'system@huntsocial.com'}>`,
                    to: to,
                    subject: subject,
                    html: htmlBody,
                    text: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
                });
                console.log(`[EmailService] Email sent to ${to} via SMTP`);
                return true;
            } catch (err) {
                console.error('[EmailService] SMTP Failed:', err);
                this.logToFile(to, subject, htmlBody);
                return false;
            }
        }

        // Option 3: Log to File
        this.logToFile(to, subject, htmlBody);
        return true; // "Success" in that we logged it
    }

    private async sendViaMailjet(to: string, subject: string, htmlBody: string, textBody?: string): Promise<boolean> {
        const payload = {
            Messages: [
                {
                    From: {
                        Email: "vanillabrand@gmail.com", // Valid sender required by Mailjet
                        Name: "Fandom Intelligence"
                    },
                    To: [{ Email: to }],
                    Subject: subject,
                    TextPart: textBody || htmlBody.replace(/<[^>]*>?/gm, ''),
                    HTMLPart: htmlBody
                }
            ]
        };

        try {
            const response = await fetch('https://api.mailjet.com/v3.1/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${this.mailjetAuth}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                // If sender invalid, it might fail. Log it.
                console.error(`[EmailService] Mailjet Failed (${response.status}): ${errText}`);
                this.logToFile(to, subject, htmlBody);
                return false;
            }

            console.log(`[EmailService] Email sent to ${to} via Mailjet API`);
            return true;
        } catch (error) {
            console.error('[EmailService] Mailjet Network Error:', error);
            this.logToFile(to, subject, htmlBody);
            return false;
        }
    }

    // Legacy method for existing calls
    async sendTitleAlert(title: string, errorDetails: string) {
        const timestamp = new Date().toISOString();
        const fullSubject = `FANDOM:ERROR [${title}]_${timestamp}`;
        const body = `
<h1>Error in Fandom Analytics System</h1>
<p><strong>ERROR TYPE:</strong> ${title}</p>
<p><strong>TIMESTAMP:</strong> ${timestamp}</p>
<hr/>
<h3>ERROR DETAILS:</h3>
<pre>${errorDetails}</pre>
<hr/>
<p>System Status: Active</p>
`;
        await this.sendEmail(ALERT_RECIPIENT, fullSubject, body);
    }

    private logToFile(to: string, subject: string, body: string) {
        const logEntry = `
===================================================
[MOCK/FALLBACK EMAIL LOG]
TO: ${to}
SUBJECT: ${subject}
BODY:
${body}
===================================================
`;
        fs.appendFile(this.logPath, logEntry, (err) => {
            if (err) console.error('[EmailService] Failed to write to log file:', err);
            else console.log('[EmailService] Email logged to file.');
        });
    }
}

export const emailService = new EmailService();
