import React from 'react';

export const TermsPage = () => {
    return (
        <div className="max-w-3xl mx-auto p-8 text-gray-300 space-y-6">
            <h1 className="text-3xl font-bold text-white mb-8">Terms of Service</h1>
            <p>Last updated: {new Date().toLocaleDateString()}</p>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">1. Acceptance of Terms</h2>
                <p>By accessing and using Fandom Mapper ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">2. Usage Rights</h2>
                <p>You agree to use the Service only for lawful purposes. You are responsible for all activity that occurs under your account.</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">3. Credits & Payments</h2>
                <p>Credits purchased or redeemed via promo codes have no monetary value outside the Service and are non-refundable.</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">4. Termination</h2>
                <p>We reserve the right to terminate or suspend your account at our sole discretion, without prior notice or liability.</p>
            </section>
        </div>
    );
};
