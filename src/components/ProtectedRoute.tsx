import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { Loader2 } from 'lucide-react';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#051810] text-emerald-500 gap-4">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-xs font-mono animate-pulse">AUTHENTICATING...</span>
            </div>
        );
    }

    if (!user) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // [NEW] Check for Pending/Blocked Status
    // Admins bypass this check naturally as their status should be 'active'
    if (user.status === 'pending' && location.pathname !== '/pending') {
        return <Navigate to="/pending" replace />;
    }

    if (user.status === 'blocked') {
        // Force logout or show blocked screen? For now, we reuse Pending or separate.
        // Let's reuse pending message or just redirect to pending which says "Contact Support" if we update it.
        // Actually, let's just let AdminRoute handle admins, but for regular users:
        if (location.pathname !== '/pending') return <Navigate to="/pending" replace />;
    }

    // If they are active but trying to go to /pending, send them home
    if (user.status === 'active' && location.pathname === '/pending') {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};
