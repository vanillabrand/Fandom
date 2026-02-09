import React from 'react';

export const GDPRPage = () => {
    return (
        <div className="max-w-3xl mx-auto p-8 text-gray-300 space-y-6">
            <h1 className="text-3xl font-bold text-white mb-8">GDPR Compliance</h1>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">Your Rights</h2>
                <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Right to Access:</strong> You can view all your personal data (transactions, maps) in your User Profile.</li>
                    <li><strong>Right to Rectification:</strong> You can update your Google Profile to change your name/avatar.</li>
                    <li><strong>Right to Erasure ("Right to be Forgotten"):</strong> You can permanently delete your account and associated data in the "Settings" tab of your User Profile.</li>
                    <li><strong>Right to Data Portability:</strong> You can export your maps to PDF.</li>
                </ul>
            </section>

            <section className="space-y-4">
                <h2 className="text-xl font-bold text-emerald-400">Contact DPO</h2>
                <p>For data protection inquiries, please contact our Data Protection Officer at vanillabrand@gmail.com.</p>
            </section>
        </div>
    );
};
