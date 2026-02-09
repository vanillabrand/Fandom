import { ProxyConfiguration } from 'crawlee';
import { Actor } from 'apify';

export interface ProxyConfigInput {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    apifyProxyCountry?: string;
    fallbackProxyUrls?: string[];
}

export class ProxyManager {
    static async createConfiguration(input: ProxyConfigInput): Promise<ProxyConfiguration | undefined> {
        const { useApifyProxy, apifyProxyGroups, apifyProxyCountry, fallbackProxyUrls } = input;

        // TIER 1: Apify Proxy (Premium)
        if (useApifyProxy && Actor.isAtHome()) {
            console.log('Using Apify Proxy (Premium)...');
            return Actor.createProxyConfiguration({
                groups: apifyProxyGroups,
                countryCode: apifyProxyCountry,
            });
        }

        // TIER 2: Fallback / Custom Proxies (Webshare, etc.)
        if (fallbackProxyUrls && fallbackProxyUrls.length > 0) {
            // Normalize inputs: IP:PORT:USER:PASS -> http://USER:PASS@IP:PORT
            const normalizedUrls = fallbackProxyUrls.map(url => {
                if (url.startsWith('http')) return url;
                // Try format IP:PORT:USER:PASS
                const parts = url.split(':');
                if (parts.length === 4) {
                    const [ip, port, user, pass] = parts;
                    return `http://${user}:${pass}@${ip}:${port}`;
                }
                // Try format IP:PORT (if public)
                if (parts.length === 2) {
                    return `http://${url}`;
                }
                return url;
            });

            console.log(`Using ${normalizedUrls.length} Custom/Fallback Proxies...`);
            return new ProxyConfiguration({
                proxyUrls: normalizedUrls,
            });
        }

        // TIER 3: None (Direct Connection - Not recommended for Social Media)
        console.warn('WARNING: No proxy configuration provided. Running in direct mode (High Block Risk).');
        return undefined;
    }
}
