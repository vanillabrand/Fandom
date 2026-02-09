
import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ScottyErrorScreenProps {
    onRetry?: () => void;
}

export const ScottyErrorScreen: React.FC<ScottyErrorScreenProps> = ({ onRetry }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black overflow-hidden flex flex-col items-center justify-center font-mono text-white">
            {/* Starfield Animation (CSS-based) */}
            <div className="absolute inset-0 pointer-events-none">
                <style>{`
                    @keyframes move-twink-back {
                        from {background-position:0 0;}
                        to {background-position:-10000px 5000px;}
                    }
                    .stars, .twinkling {
                        position:absolute;
                        top:0; left:0; right:0; bottom:0;
                        width:100%; height:100%;
                        display:block;
                    }
                    .stars {
                        background:#000 url(https://www.script-tutorials.com/demos/360/images/stars.png) repeat top center;
                        z-index:0;
                    }
                    .twinkling{
                        background:transparent url(https://www.script-tutorials.com/demos/360/images/twinkling.png) repeat top center;
                        z-index:1;
                        animation:move-twink-back 200s linear infinite;
                        opacity: 0.5;
                    }
                    .beam-up {
                        animation: beam 2s ease-in-out infinite alternate;
                    }
                    @keyframes beam {
                        from { opacity: 0.8; transform: translateY(0); filter: drop-shadow(0 0 10px blue); }
                        to { opacity: 1; transform: translateY(-5px); filter: drop-shadow(0 0 25px cyan); }
                    }
                `}</style>
                <div className="stars"></div>
                <div className="twinkling"></div>
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center p-8 max-w-lg">
                <div className="mb-8 relative group">
                    {/* Beam Effect Container */}
                    <div className="absolute inset-x-4 top-0 bottom-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>

                    <img
                        src="/scotty_beam_me_up.png"
                        alt="Beam me up Scottie!"
                        className="w-64 h-64 object-contain relative z-10 beam-up"
                    />
                </div>

                <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-cyan-400 to-blue-300 animate-pulse tracking-widest uppercase">
                    Monthly Limit Exceeded!
                </h1>

                <p className="text-lg text-blue-200 mb-8 leading-relaxed border border-blue-500/30 bg-blue-900/20 p-4 rounded-lg backdrop-blur-sm">
                    "I'm giving her all she's got, Captain, but we've hit the usage hard limit! The engines can't take any more requests this month!"
                </p>

                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="group relative px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full overflow-hidden transition-all shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:shadow-[0_0_40px_rgba(37,99,235,0.8)] border border-blue-400/50"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
                            TRY AGAIN LATER
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/30 to-cyan-400/0 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    </button>
                )}
            </div>
        </div>
    );
};
