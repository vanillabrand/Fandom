
import React, { useState, useEffect } from 'react';
import { User, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';

interface ProxiedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src?: string;
    alt?: string;
    fallback?: React.ReactNode;
}

const DOMAINS_TO_PROXY = [
    'cdninstagram.com',
    'fbcdn.net',
    'tiktokcdn.com',
    'p16-sign', // TikTok
];

export const ProxiedImage: React.FC<ProxiedImageProps> = ({ src, alt, className, fallback, ...props }) => {
    const { token } = useAuth();
    const [imgSrc, setImgSrc] = useState<string | undefined>(undefined);
    const [error, setError] = useState(false);

    const [retryWithOriginal, setRetryWithOriginal] = useState(false);

    useEffect(() => {
        setRetryWithOriginal(false); // Reset on new src
        if (!src) {
            setImgSrc(undefined);
            return;
        }

        // CRITICAL FIX: Don't double-proxy! If already proxied, use as-is
        if (src.startsWith('/api/proxy-image')) {
            setImgSrc(src);
            setError(false);
            return;
        }

        // Check if we need to proxy
        const shouldProxy = DOMAINS_TO_PROXY.some(d => src.includes(d));

        if (shouldProxy && !retryWithOriginal) {
            // Use our custom Vite middleware proxy (now handled by server/routes/proxy.ts)
            // Append token for billing
            const tokenParam = token ? `&token=${token}` : '';
            setImgSrc(`/api/proxy-image?url=${encodeURIComponent(src)}${tokenParam}`);
        } else {
            console.log(retryWithOriginal && shouldProxy ? '[ProxiedImage] Proxy failed, falling back to direct URL' : '[ProxiedImage] Loading direct URL');
            setImgSrc(src);
        }
        setError(false);
    }, [src, token, retryWithOriginal]);

    if (!src || error) {
        return <>{fallback || <div className={`flex items-center justify-center bg-white/5 ${className}`}><User className="text-white/20" /></div>}</>;
    }

    return (
        <img
            {...props}
            src={imgSrc}
            alt={alt}
            className={className}
            onError={() => {
                // If we were using proxy and it failed, try original
                if (imgSrc?.startsWith('/api/proxy-image') && !retryWithOriginal) {
                    setRetryWithOriginal(true);
                } else {
                    setError(true);
                }
            }}
            // Add crossOrigin anonymous to allow canvas reading if needed (though proxy handles CORS)
            crossOrigin={imgSrc?.startsWith('/api/proxy-image') ? "anonymous" : undefined}
        />
    );
};
