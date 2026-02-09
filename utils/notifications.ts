
import { toast } from 'sonner';

type ErrorType = 'HOLLOW_MAP' | 'FATAL' | 'API_ERROR' | 'UNAVAILABLE' | 'GEMINI_ERROR';

interface NotificationOptions {
    onRetry?: () => void;
}

export const notify = {
    hollowMap: () => {
        toast.warning('Not Enough Results', {
            description: "We couldn't find enough data to build a meaningful map. Try broadening your search terms.",
            duration: 8000,
            className: "bg-amber-950 border-amber-800 text-amber-200",
        });
    },

    fatal: (error: string) => {
        toast.error('System Error', {
            description: `A critical error occurred: ${error}. An admin alert has been sent.`,
            duration: 10000,
            className: "bg-red-950 border-red-800 text-red-200",
        });
        // Trigger backend email alert
        sendEmailAlert('FATAL_SYSTEM_ERROR', error);
    },

    apiError: (serviceName: string, details?: string) => {
        toast.error(`${serviceName} API Error`, {
            description: details || `The ${serviceName} service is experiencing issues. Using cached data where available.`,
            duration: 6000,
        });
        sendEmailAlert(`API_ERROR_${serviceName.toUpperCase()}`, details || 'Unknown API error');
    },

    unavailable: () => {
        toast.error('Service Unavailable (503)', {
            description: "The system is currently overloaded or under maintenance. Please try again in 5 minutes.",
            duration: 8000,
        });
        sendEmailAlert('SERVICE_UNAVAILABLE_503', 'User received 503 Service Unavailable');
    },

    geminiError: (onRetry?: () => void) => {
        toast.error('AI Analysis Failed', {
            description: "Gemini AI failed to process the request.",
            action: onRetry ? {
                label: "Retry",
                onClick: onRetry,
            } : undefined,
            duration: 10000,
        });
        sendEmailAlert('GEMINI_AI_FAILURE', 'Gemini AI failed to generate plan/analysis.');
    },

    success: (message: string) => {
        toast.success(message, {
            className: "bg-emerald-950 border-emerald-800 text-emerald-200"
        });
    }
};

// Helper to trigger backend email
const sendEmailAlert = async (title: string, details: string) => {
    try {
        await fetch('/api/alerts/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, errorDetails: details }),
        });
    } catch (e) {
        console.error('Failed to send email alert:', e);
    }
};
