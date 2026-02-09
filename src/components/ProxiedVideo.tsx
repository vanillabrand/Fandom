
import React, { useState, useEffect, useRef } from 'react';
import { Video, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';

interface ProxiedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
    src?: string;
    poster?: string;
}

const DOMAINS_TO_PROXY = [
    'cdninstagram.com',
    'fbcdn.net',
    'tiktokcdn.com',
    'p16-sign', // TikTok
];

export const ProxiedVideo: React.FC<ProxiedVideoProps> = ({ src, poster, className, controls = true, ...props }) => {
    const { token } = useAuth();
    const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
    const [posterSrc, setPosterSrc] = useState<string | undefined>(undefined);
    const [error, setError] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [retryWithOriginal, setRetryWithOriginal] = useState(false);

    const getProxiedUrl = (url: string) => {
        if (!url) return undefined;
        // CRITICAL FIX: Don't double-proxy! If already proxied, use as-is
        if (url.startsWith('/api/proxy-image')) return url;

        const shouldProxy = DOMAINS_TO_PROXY.some(d => url.includes(d));
        if (shouldProxy && !retryWithOriginal) {
            const tokenParam = token ? `&token=${token}` : '';
            return `/api/proxy-image?url=${encodeURIComponent(url)}${tokenParam}`;
        }
        return url;
    };

    useEffect(() => {
        setRetryWithOriginal(false); // Reset on new src
        setError(false);
    }, [src, poster]);

    useEffect(() => {
        setVideoSrc(src ? getProxiedUrl(src) : undefined);
        setPosterSrc(poster ? getProxiedUrl(poster) : undefined);
    }, [src, poster, token, retryWithOriginal]);

    if (!src || error) {
        return <div className={`flex items-center justify-center bg-white/5 ${className}`}><Video className="text-white/20" /></div>;
    }

    return (
        <video
            ref={videoRef}
            {...props}
            src={videoSrc}
            poster={posterSrc}
            className={className}
            controls={controls}
            onError={(e) => {
                console.error("Video Error:", e);
                // If we were using proxy and it failed, try original
                if (videoSrc?.startsWith('/api/proxy-image') && !retryWithOriginal) {
                    console.log('[ProxiedVideo] Proxy failed, falling back to direct URL');
                    setRetryWithOriginal(true);
                } else {
                    setError(true);
                }
            }}
            crossOrigin={videoSrc?.startsWith('/api/proxy-image') ? "anonymous" : undefined}
            playsInline
        />
    );
};
