/**
 * Executes a fetch request with exponential backoff retry logic.
 * Specifically targets 503 (Service Unavailable) and 429 (Too Many Requests).
 */
export const fetchWithRetry = async (url, options = {}, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            // If success, return immediately
            if (response.ok)
                return response;
            // If it's a retriable status code
            if (response.status === 503 || response.status === 429 || response.status === 502 || response.status === 504) {
                console.warn(`[RetryFetch] Request to ${url} failed with ${response.status}. Attempt ${attempt + 1}/${maxRetries + 1}...`);
                if (attempt < maxRetries) {
                    // Exponential backoff with jitter
                    const delay = baseDelay * Math.pow(2, attempt) + (Math.random() * 500);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
            }
            // If strict failure (400, 401, 404, etc) or retries exhausted, return the response (caller handles error)
            return response;
        }
        catch (error) {
            console.warn(`[RetryFetch] Network error to ${url}. Attempt ${attempt + 1}/${maxRetries + 1}`, error);
            lastError = error;
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt) + (Math.random() * 500);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries.`);
};
