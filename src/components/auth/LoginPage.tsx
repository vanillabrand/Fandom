import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext.js';
import { Navigate } from 'react-router-dom';
import { Sparkles, Users, Star, TrendingUp, Target, Network } from 'lucide-react';
import { useState, useEffect } from 'react';

const useCases = [
    { icon: <Network className="w-5 h-5 text-emerald-400" />, text: "Visualize hidden community connections" },
    { icon: <Star className="w-5 h-5 text-yellow-400" />, text: "Identify key influencers & brand advocates" },
    { icon: <TrendingUp className="w-5 h-5 text-pink-400" />, text: "Track emerging cultural trends" },
    { icon: <Target className="w-5 h-5 text-blue-400" />, text: "Target niche audiences with precision" }
];

const FeatureCarousel = () => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % useCases.length);
        }, 3000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-8 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 key={index}">
            {useCases[index].icon}
            <span className="text-sm font-medium text-emerald-100/80 tracking-wide">
                {useCases[index].text}
            </span>
        </div>
    );
};

export const LoginPage = () => {
    const { login, user } = useAuth();

    if (user) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen bg-[#051810] flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#051810] to-[#051810]"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>

            <div className="relative z-10 flex flex-col items-center gap-8 p-8 max-w-md w-full">
                {/* Logo & Branding */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 to-teal-400">
                            Fandom Mapper
                        </h1>
                        <div className="mt-3 min-h-[32px] flex items-center justify-center">
                            <FeatureCarousel />
                        </div>
                    </div>
                </div>

                {/* Login Card */}
                <div className="w-full bg-[#0a2f1f]/50 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-8 shadow-2xl flex flex-col gap-6">
                    <div className="text-center space-y-2">
                        <h2 className="text-xl font-semibold text-white">Welcome Back</h2>
                        <p className="text-sm text-emerald-400/60">Sign in to access your maps</p>
                    </div>

                    <div className="flex justify-center py-4">
                        <GoogleLogin
                            onSuccess={credentialResponse => {
                                if (credentialResponse.credential) {
                                    login(credentialResponse.credential);
                                }
                            }}
                            onError={() => {
                                console.log('Login Failed');
                            }}
                            theme="filled_black"
                            shape="pill"
                            size="large"
                            text="signin_with"
                        />
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-emerald-500/20" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-[#0a2f1f] px-2 text-emerald-500/40">or</span>
                        </div>
                    </div>

                    <div className="text-center">
                        <a href="/signup" className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                            Create a new account
                        </a>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-emerald-600/50">
                    <Sparkles className="w-3 h-3" />
                    <span>Powered by Fandom AI</span>
                </div>
            </div>
        </div>
    );
};
