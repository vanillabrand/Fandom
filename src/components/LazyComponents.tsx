/**
 * Lazy Loading Wrapper Components
 * 
 * Use these to lazy load heavy components and improve initial page load time.
 */

import { lazy, Suspense } from 'react';

// Loading fallback component
const LoadingFallback = () => (
    <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
            <p className="text-emerald-400 text-sm">Loading...</p>
        </div>
    </div>
);

// Lazy load heavy components
export const FandomGraph3D = lazy(() => import('./FandomGraph3D'));
export const AnalyticsPanel = lazy(() => import('./AnalyticsPanel'));

// Wrapper component with Suspense
export const LazyFandomGraph3D = (props: any) => (
    <Suspense fallback={<LoadingFallback />}>
        <FandomGraph3D {...props} />
    </Suspense>
);

export const LazyAnalyticsPanel = (props: any) => (
    <Suspense fallback={<LoadingFallback />}>
        <AnalyticsPanel {...props} />
    </Suspense>
);

