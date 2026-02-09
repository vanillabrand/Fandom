import React from 'react';

export const PrivacyPage = () => {
    return (
        <div className="max-w-3xl mx-auto p-8 text-gray-300 space-y-6">
            <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
            <p>Last updated: {new Date().toLocaleDateString()}</p>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">1. Information Collection</h2>
                <p>We collect information you provide directly to us, such as your Google Profile name, email address, and avatar when you sign in.</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">2. Data Usage</h2>
                <p>We use your information to operate, maintain, and improve the Service. We do not sell your personal data to third parties.</p>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">3. Cookies</h2>
                <p>We use local storage and session cookies to maintain your login state.</p>
            </section>
        </div>
    );
};
