import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { googleLogout, useGoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { toast } from 'sonner';

// Define User Interface based on Google JWT
export interface User {
    sub: string; // Google ID
    email: string;
    name: string;
    picture: string;
    exp: number;
    credits?: number; // From our DB
    balance?: number; // £ Balance
    role?: 'admin' | 'user';
    status?: 'active' | 'pending' | 'blocked';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (token: string, promoCode?: string) => Promise<void>;
    logout: () => void;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initial Load
    useEffect(() => {
        const storedToken = localStorage.getItem('AUTH_TOKEN');
        if (storedToken) {
            try {
                const decoded = jwtDecode<User>(storedToken);
                // Check expiry
                if (decoded.exp * 1000 < Date.now()) {
                    logout();
                } else {
                    setToken(storedToken);
                    setUser(decoded);
                    // Optionally fetch fresh credits from backend here
                }
            } catch (e) {
                console.error("Invalid token", e);
                logout();
            }
        }
        setIsLoading(false);
    }, []);

    const login = async (googleIdToken: string, promoCode?: string) => {
        try {
            // 1. Client-side decode for immediate UI feedback
            const decoded = jwtDecode<User>(googleIdToken);

            // 2. Verify with Backend & Create Session/User
            // If promoCode provided, hit signup route. Else login route handles implicit creation or lookup.
            const url = promoCode ? '/api/auth/signup' : '/api/auth/login';

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${googleIdToken}`
                },
                body: promoCode ? JSON.stringify({ promoCode }) : undefined
            });

            if (!res.ok) {
                throw new Error('Backend login failed');
            }

            const data = await res.json();

            // Merge Google Profile with DB Data (credits/etc)
            const fullUser = { ...decoded, ...data.user };

            setToken(googleIdToken);
            setUser(fullUser);
            localStorage.setItem('AUTH_TOKEN', googleIdToken);
            toast.success(`Welcome back, ${decoded.name}!`);

        } catch (error) {
            console.error("Login Error", error);
            toast.error("Failed to sign in");
            logout();
        }
    };

    const logout = () => {
        googleLogout();
        setToken(null);
        setUser(null);
        localStorage.removeItem('AUTH_TOKEN');
        toast.info("Signed out");
    };

    const refreshProfile = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUser(prev => prev ? { ...prev, ...data } : null);
            }
        } catch (e) {
            console.error("Failed to refresh profile", e);
        }
    }

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
