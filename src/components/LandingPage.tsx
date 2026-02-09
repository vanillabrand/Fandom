import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext.js';
import FandomGraph3D from './FandomGraph3D.js';
import { demoGraphData } from '../data/demoGraph.js';
import { Sparkles, ArrowRight, CheckCircle, Globe, Zap, Search } from 'lucide-react';
import { toast } from 'sonner';

// Example Queries for Typewriter Effect
const EXAMPLE_QUERIES = [
    "Find the overlap between Gamer Culture and Energy Drinks",
    "Map the influencers driving the 'Silent Walking' trend",
    "Show me viral topics in Seoul related to Skincare",
    "Analyse the fanbase of @travisscott vs @nike", // [LOC] Analyze -> Analyse
    "Discover hidden communities within #CottageCore"
];

const TypewriterText = ({ queries }: { queries: string[] }) => {
    const navigate = useNavigate();
    const [index, setIndex] = useState(0);
    const [subIndex, setSubIndex] = useState(0);
    const [reverse, setReverse] = useState(false);
    const [blink, setBlink] = useState(true);

    // Reset index if queries change significantly
    useEffect(() => {
        if (index >= queries.length) setIndex(0);
    }, [queries.length]);

    // Blinking cursor
    useEffect(() => {
        const timeout2 = setInterval(() => {
            setBlink((prev) => !prev);
        }, 500);
        return () => clearInterval(timeout2);
    }, []);

    // Typing logic
    useEffect(() => {
        if (queries.length === 0) return;

        const currentQuery = queries[index] || "";

        if (subIndex === currentQuery.length + 1 && !reverse) {
            const timeout = setTimeout(() => {
                setReverse(true);
            }, 3000); // Wait 3s before deleting
            return () => clearTimeout(timeout);
        }

        if (subIndex === 0 && reverse) {
            setReverse(false);
            setIndex((prev) => (prev + 1) % queries.length);
            return;
        }

        const timeout = setTimeout(() => {
            setSubIndex((prev) => prev + (reverse ? -1 : 1));
        }, reverse ? 30 : 50); // Typing speed

        return () => clearTimeout(timeout);
    }, [subIndex, index, reverse, queries]);

    if (queries.length === 0) return <div className="h-16 md:h-20"></div>;

    return (
        <div
            className="h-16 md:h-20 flex items-start pt-1 cursor-pointer group/typewriter"
            onClick={() => {
                const currentQuery = queries[index];
                if (currentQuery) {
                    // Navigate to dashboard and pre-fill query
                    // We can use state or URL params. 
                    // SidebarQueryBuilder likely reads from a global state or we can just pass it via navigate
                    navigate('/', { state: { prefillQuery: currentQuery } });
                }
            }}
        >
            <span className="text-lg md:text-2xl font-light text-emerald-200/90 font-mono tracking-tight leading-tight group-hover/typewriter:text-emerald-400 transition-colors">
                "{queries[index]?.substring(0, subIndex)}"
                <span className={`inline-block w-3 h-6 md:h-8 ml-1 align-middle bg-emerald-500/50 ${blink ? 'opacity-100' : 'opacity-0'}`}></span>
            </span>
        </div>
    );
};

export const LandingPage = () => {
    const { login, user } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const [isLoading, setIsLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [showEmailAuth, setShowEmailAuth] = useState(false);

    // [NEW] Dynamic Questions State
    const [marketingQuestions, setMarketingQuestions] = useState<string[]>(EXAMPLE_QUERIES);

    // [NEW] Fetch Marketing Questions
    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const res = await fetch('/api/marketing-questions');
                if (res.ok) {
                    const questions = await res.json();
                    if (Array.isArray(questions) && questions.length > 0) {
                        setMarketingQuestions(questions);
                    }
                }
            } catch (err) {
                console.warn("[LandingPage] Failed to fetch marketing questions, using defaults.");
            }
        };
        fetchQuestions();
    }, []);

    // Redirect if already logged in
    useEffect(() => {
        if (user) navigate('/');
    }, [user, navigate]);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const endpoint = mode === 'signup' ? '/api/auth/email/signup' : '/api/auth/email/login';
            const body = mode === 'signup'
                ? { email, password, name: fullName, promoCode }
                : { email, password };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Auth failed');

            // Success: Store token and login
            await login(data.token);

            // [FIX] Removed manual localStorage and reload. 
            // AuthContext handles token storage and state update.
            // useEffect hook will redirect to dashboard when user state changes.

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignupWithPromo = async (credential: string) => {
        setIsLoading(true);
        try {
            await login(credential);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative w-full h-[100dvh] bg-[#051810] overflow-hidden flex flex-col md:flex-row text-white">

            {/* --- LEFT: HERO VISUAL (60%) --- */}
            <div className="relative w-full md:w-[60%] lg:w-[65%] h-[50vh] md:h-full overflow-hidden order-1 md:order-1 bg-black">
                {/* 3D MAP BACKGROUND */}
                {/* 3D MAP BACKGROUND - REPLACED WITH STATIC VISUAL FOR PERFORMANCE */}
                <div className="absolute inset-0 z-0 opacity-60">
                    {/* Placeholder for a high-quality static screenshot of the graph */}
                    {/* <div className="absolute inset-0 bg-[url('/graph-preview.jpg')] bg-cover bg-center opacity-50 hover:scale-105 transition-transform duration-[20s]"></div> */}
                    <div className="absolute inset-0 bg-[#051810]" />
                    {/* Fallback architectural grid if image missing */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
                </div>

                {/* OVERLAY GRADIENTS */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#051810] via-transparent to-transparent z-10 md:bg-gradient-to-r md:from-transparent md:to-[#051810]/95"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#051810_120%)] z-10 pointer-events-none opacity-70"></div>

                {/* TEXT CONTENT LAYER */}
                <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end px-8 pb-12 md:px-16 md:pb-32">
                    <div className="space-y-6 max-w-2xl bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4 rounded-xl backdrop-blur-[2px] md:bg-none md:p-0 md:backdrop-blur-0">
                        <div className="flex items-center gap-3 animate-fade-in-up">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md">
                                Next-Gen Social Media Intelligence Platform
                            </span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white drop-shadow-2xl animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                            Reveal the <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Invisible</span> Connections.
                        </h1>

                        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                            <p className="text-emerald-400/60 text-sm font-bold uppercase tracking-widest mb-4">You can ask:</p>
                            <TypewriterText queries={marketingQuestions} />
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RIGHT: AUTH PANEL (40%) --- */}
            <div className="relative w-full md:w-[40%] lg:w-[35%] min-h-[50vh] md:h-full order-2 md:order-2 bg-gradient-to-br from-[#0a2f1f] to-[#051810] border-l border-emerald-500/10 flex flex-col md:justify-center p-6 md:p-12 z-30 shadow-2xl overflow-y-auto">

                <div className="max-w-md mx-auto w-full space-y-10 animate-fade-in-up" style={{ animationDelay: '300ms' }}>

                    {/* Header */}
                    <div className="flex items-center gap-4 mb-4 opacity-90">
                        <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <Globe className="w-8 h-8 text-emerald-400" />
                        </div>
                        <span className="font-light text-sm tracking-[0.2em] text-white">FANDOM MAPPER</span>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-3xl lg:text-4xl font-light text-white mb-2 tracking-tight">
                            {mode === 'login' ? 'Welcome Back' : 'Get Started'}
                        </h2>
                        <p className="text-emerald-100/60 text-sm lg:text-base font-light">
                            {mode === 'login'
                                ? 'Enter your portal to cultural intelligence.'
                                : 'Join the new standard in audience analysis.'}
                        </p>
                    </div>

                    {/* Auth Box */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500">
                        {/* Glow effect */}
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-[50px] group-hover:bg-emerald-500/30 transition-all duration-700"></div>

                        <div className="relative z-10 space-y-6">

                            {/* Google Sign In Wrapper */}
                            <div className="flex justify-center items-center w-full">
                                <GoogleLogin
                                    onSuccess={credentialResponse => {
                                        if (credentialResponse.credential) {
                                            if (mode === 'signup') {
                                                handleSignupWithPromo(credentialResponse.credential);
                                            } else {
                                                login(credentialResponse.credential);
                                            }
                                        }
                                    }}
                                    onError={() => toast.error('Authentication Failed')}
                                    theme="filled_black"
                                    shape="pill"
                                    size="large"
                                    text={mode === 'login' ? "signin_with" : "signup_with"}
                                />
                            </div>

                            {/* EMAIL AUTH TOGGLE */}
                            <div className="text-center">
                                <button
                                    onClick={() => setShowEmailAuth(!showEmailAuth)}
                                    className="text-xs text-emerald-500/50 hover:text-emerald-400 underline transition-colors"
                                >
                                    {showEmailAuth ? 'Hide Email Options' : 'Or continue with Email'}
                                </button>
                            </div>

                            {/* EMAIL FORM */}
                            {showEmailAuth && (
                                <form onSubmit={handleEmailAuth} className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    {mode === 'signup' && (
                                        <input
                                            type="text"
                                            placeholder="Full Name"
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            className="w-full bg-black/20 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-all font-light placeholder:text-gray-600"
                                            required
                                        />
                                    )}
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-black/20 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-all font-light placeholder:text-gray-600"
                                        required
                                    />
                                    <input
                                        type="password"
                                        placeholder="Password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-black/20 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-all font-light placeholder:text-gray-600"
                                        required
                                    />
                                    {mode === 'signup' && (
                                        <input
                                            type="text"
                                            placeholder="Promo Code (Optional)"
                                            value={promoCode}
                                            onChange={e => setPromoCode(e.target.value.toUpperCase())}
                                            className="w-full bg-black/20 border border-emerald-500/20 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50 transition-all font-light placeholder:text-gray-600 tracking-widest uppercase"
                                        />
                                    )}
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-full text-sm transition-all shadow-lg shadow-emerald-900/20"
                                    >
                                        {isLoading ? 'Processing...' : (mode === 'signup' ? 'Create Account' : 'Sign In')}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Toggle Mode */}
                        <div className="mt-8 pt-6 border-t border-white/10 text-center">
                            <p className="text-xs text-emerald-100/40 mb-2">
                                {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                            </p>
                            <button
                                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                                className="text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition-colors"
                            >
                                {mode === 'login' ? 'Request Access' : 'Sign In'}
                            </button>
                        </div>
                    </div>

                    {/* Footer Stats / Trust */}
                    <div className="mt-12 grid grid-cols-2 gap-6 opacity-60">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <span className="bg-emerald-500 rounded-full w-1.5 h-1.5 animate-pulse"></span>
                                <span className="text-[10px] font-bold tracking-wider uppercase">Visual Discovery</span>
                            </div>
                            <p className="text-[10px] text-white/60 leading-relaxed max-w-[140px]">
                                See connections lists can't show.
                            </p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <Search className="w-3 h-3" />
                                <span className="text-[10px] font-bold tracking-wider uppercase">Deep Research</span>
                            </div>
                            <p className="text-[10px] text-white/60 leading-relaxed max-w-[140px]">
                                Cross-platform cultural analysis.
                            </p>
                        </div>
                    </div>

                    <div className="mt-12 text-[10px] text-white/20 tracking-widest text-center uppercase flex flex-col items-center gap-2">
                        <span>Fandom AI © 2026</span>
                        <Link to="/credits" className="hover:text-emerald-400/50 transition-colors">Credits</Link>
                    </div>
                </div>
            </div>

        </div>
    );
};
