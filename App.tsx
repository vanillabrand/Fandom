import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './src/components/Dashboard.js';
import { LandingPage } from './src/components/LandingPage.js';
// import { LoginPage } from './src/components/auth/LoginPage.js';
// import { SignupPage } from './src/components/auth/SignupPage.js';
import { ProtectedRoute } from './src/components/ProtectedRoute.js';
import { PublicShareView } from './src/components/PublicShareView.js';

import { UserProfilePage } from './src/components/profile/UserProfilePage.js';
import { TermsPage } from './src/components/legal/TermsPage.js';
import { PrivacyPage } from './src/components/legal/PrivacyPage.js';
import { GDPRPage } from './src/components/legal/GDPRPage.js';
import { HelpPage } from './src/components/HelpPage.js';
import Credits from './src/components/Credits.js';
import AdminDashboard from './src/components/admin/AdminDashboard.js';
import { AdminRoute } from './src/components/auth/AdminComponents.js';
import { PendingApprovalScreen } from './src/components/auth/PendingApprovalScreen.js';

function App() {
    return (
        <Routes>
            {/* Public Routes */}
            {/* Public Routes */}
            <Route path="/login" element={<LandingPage />} />
            <Route path="/signup" element={<LandingPage />} />
            <Route path="/share/:id" element={<PublicShareView />} />
            <Route path="/public/:id" element={<PublicShareView />} />
            <Route path="/credits" element={<Credits />} />

            {/* Legal Routes (Public) */}
            <Route path="/legal/terms" element={<TermsPage />} />
            <Route path="/legal/privacy" element={<PrivacyPage />} />
            <Route path="/legal/gdpr" element={<GDPRPage />} />

            {/* Protected Routes */}
            <Route path="/admin" element={
                <ProtectedRoute>
                    <AdminRoute>
                        <AdminDashboard />
                    </AdminRoute>
                </ProtectedRoute>
            } />

            <Route path="/" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
            } />
            <Route path="/help" element={
                <ProtectedRoute>
                    <HelpPage />
                </ProtectedRoute>
            } />
            <Route path="/profile" element={
                <ProtectedRoute>
                    <UserProfilePage />
                </ProtectedRoute>
            } />
            <Route path="/pending" element={
                <ProtectedRoute>
                    <PendingApprovalScreen />
                </ProtectedRoute>
            } />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
