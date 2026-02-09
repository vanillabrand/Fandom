import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, Heart, Server, Code, Shield, Mail, Phone, Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';

const Credits: React.FC = () => {
    const dependencies = [
        { name: "React", url: "https://react.dev/", role: "UI Framework" },
        { name: "Vite", url: "https://vitejs.dev/", role: "Build Tool" },
        { name: "Tailwind CSS", url: "https://tailwindcss.com/", role: "Styling" },
        { name: "Framer Motion", url: "https://www.framer.com/motion/", role: "Animations" },
        { name: "Lucide React", url: "https://lucide.dev/", role: "Icons" },
        { name: "Recharts", url: "https://recharts.org/", role: "Charting" },
        { name: "React Force Graph", url: "https://github.com/vasturiano/react-force-graph", role: "3D Visualization" },
        { name: "Google Generative AI", url: "https://ai.google.dev/", role: "AI Intelligence" },
        { name: "MongoDB", url: "https://www.mongodb.com/", role: "Database" },
        { name: "Express", url: "https://expressjs.com/", role: "Backend Server" },
        { name: "Stripe", url: "https://stripe.com/", role: "Payments" },
        { name: "Apify", url: "https://apify.com/", role: "Data Scraping" },
        { name: "Mailjet", url: "https://www.mailjet.com/", role: "Email Service" }
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-emerald-50 relative overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-400/5 rounded-full blur-[120px]" />
            </div>

            <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
                <Link to="/" className="inline-flex items-center text-emerald-400/80 hover:text-emerald-400 transition-colors mb-8 group">
                    <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Back to Home
                </Link>

                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                >
                    <motion.div variants={itemVariants} className="text-center mb-16">
                        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent mb-6">
                            Credits & Acknowledgements
                        </h1>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Fandom Analytics is built on the shoulders of giants. We gratefully acknowledge the tools, libraries, and intelligences that made this possible.
                        </p>
                    </motion.div>

                    {/* Special Thanks Section */}
                    <motion.div variants={itemVariants} className="mb-20">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                            <div className="relative bg-slate-900/50 backdrop-blur-xl border border-emerald-500/20 rounded-2xl p-8 md:p-12 text-center">
                                <h2 className="text-2xl font-semibold text-emerald-300 mb-8 flex items-center justify-center gap-3">
                                    <Heart className="w-6 h-6 text-red-400 fill-red-400/20" />
                                    <span>Created By</span>
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-emerald-500/30 text-2xl">
                                            🤖
                                        </div>
                                        <h3 className="font-medium text-lg text-emerald-100">Antigravity</h3>
                                        <p className="text-sm text-emerald-400/60 font-mono">Agentic AI</p>
                                        <span className="text-xs text-slate-500">(main IDE)</span>
                                    </div>

                                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white/5 transition-colors relative">
                                        <div className="absolute -top-3 -right-3 bg-emerald-500/10 text-emerald-400 text-xs px-2 py-1 rounded-full border border-emerald-500/20">
                                            Major One
                                        </div>
                                        <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border border-purple-500/30 text-3xl shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                                            🌟
                                        </div>
                                        <h3 className="font-bold text-xl text-white">Gemini</h3>
                                        <p className="text-sm text-purple-400/60 font-mono">3 Pro & Flash</p>
                                        <span className="text-xs text-slate-500">(Google DeepMind AI)</span>
                                    </div>

                                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-emerald-500/30 text-2xl">
                                            👨‍💻
                                        </div>
                                        <h3 className="font-medium text-lg text-emerald-100">Biffer Rowley</h3>
                                        <p className="text-sm text-emerald-400/60 font-mono">Human Architect</p>
                                        <div className="flex flex-col gap-1 mt-2">
                                            <a href="mailto:vanillabrand@gmail.com" className="flex items-center gap-2 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
                                                <Mail className="w-3 h-3" /> vanillabrand@gmail.com
                                            </a>
                                            <a href="tel:+447920332201" className="flex items-center gap-2 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
                                                <Phone className="w-3 h-3" /> +44 (0)7920 332201
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-10 pt-8 border-t border-white/5 text-slate-500 text-sm font-mono">
                                    Developed Feb 2026
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Libraries Grid */}
                    <motion.div variants={itemVariants}>
                        <h2 className="text-2xl font-semibold text-white mb-8 flex items-center gap-3">
                            <Cpu className="w-6 h-6 text-emerald-400" />
                            <span>Powered By Open Source</span>
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {dependencies.map((dep, idx) => (
                                <a
                                    key={idx}
                                    href={dep.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-4 bg-slate-900/40 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
                                >
                                    <div>
                                        <div className="font-medium text-slate-200 group-hover:text-emerald-300 transition-colors">
                                            {dep.name}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mt-1">
                                            {dep.role}
                                        </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                                </a>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div variants={itemVariants} className="mt-20 text-center">
                        <p className="text-slate-500 text-sm max-w-2xl mx-auto mb-6 leading-relaxed">
                            Source code is owned wholly and outright (outside of any third party libraries) by <span className="text-emerald-400/80">James Rowley - 2026</span>.
                        </p>
                        <p className="text-slate-600 text-xs">
                            Thank you for using Fandom Analytics.
                        </p>
                    </motion.div>

                </motion.div>
            </div>
        </div>
    );
};

export default Credits;
