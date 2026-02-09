import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext.js';
import { Navigate, Link } from 'react-router-dom';
import { Sparkles, Tag, Network, Star, TrendingUp, Target } from 'lucide-react';
import { toast } from 'sonner';

const useCases = [
    { icon: <Network className="w-5 h-5 text-emerald-400" />, text: "Visualize hidden community connections" },
    { icon: <Star className="w-5 h-5 text-yellow-400" />, text: "Identify key influencers & brand advocates" },
    { icon: <TrendingUp className="w-5 h-5 text-pink-400" />, text: "Track emerging cultural trends" },
    { icon: <Target className="w-5 h-5 text-blue-400" />, text: "Target niche audiences with precision" }
];

const FeatureCarousel = () => {
    const [index, setIndex] = React.useState(0);

    React.useEffect(() => {
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

export const SignupPage = () => {
    const { login, user } = useAuth();
    const [promoCode, setPromoCode] = useState('');

    if (user) {
        return <Navigate to="/" replace />;
    }

    const handleSignup = async (token: string) => {
        try {
            // We intercept the normal login flow to Hit the signup endpoint specifically
            // This allows us to pass the promo code
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ promoCode })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Signup failed');
            }

            // If successful, we can just "login" which sets the context
            await login(token);
            toast.success("Account created successfully!");

        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
        }
    };

    return (
        <div className="min-h-screen bg-[#051810] flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#051810] to-[#051810]"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>

            <div className="relative z-10 flex flex-col items-center gap-8 p-8 max-w-md w-full">

                {/* Branding */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Join Fandom
                    </h1>
                    <div className="mt-1 min-h-[32px] flex items-center justify-center">
                        <FeatureCarousel />
                    </div>
                </div>

                {/* Signup Card */}
                <div className="w-full bg-[#0a2f1f]/50 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-8 shadow-2xl flex flex-col gap-6">

                    {/* Promo Code Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider ml-1">
                            Promo Code (Optional)
                        </label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                            <input
                                type="text"
                                placeholder="ENTER CODE"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                className="w-full bg-[#051810] border border-emerald-700/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono tracking-widest placeholder:text-emerald-800"
                            />
                        </div>
                        <p className="text-[10px] text-emerald-600/80 px-1">
                            Enter a code to receive free starting credits.
                        </p>
                    </div>

                    <div className="flex justify-center pt-2">
                        <GoogleLogin
                            onSuccess={credentialResponse => {
                                if (credentialResponse.credential) {
                                    handleSignup(credentialResponse.credential);
                                }
                            }}
                            onError={() => {
                                toast.error('Google Sign-In Failed');
                            }}
                            theme="filled_blue"
                            shape="pill"
                            size="large"
                            text="signup_with"
                        />
                    </div>

                    <div className="text-center pt-2">
                        <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                            Already have an account? <span className="text-emerald-400">Log in</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
