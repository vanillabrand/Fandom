import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './src/contexts/AuthContext.js';
import App from './App.js';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary.js';
import * as THREE from 'three';
import * as d3 from 'd3';

// [FIX] Force global singletons to prevent multiple Three.js instances warning/crash
(window as any).THREE = THREE;
(window as any).d3 = d3;
// Some older d3-force-3d might look for d3-force
(window as any)['d3-force'] = d3;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Get Client ID from env or fallback (should be in .env.local)
// In production, it might be injected via window.__ENV__
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || (window as any).__ENV__?.VITE_GOOGLE_CLIENT_ID || "";

const root = ReactDOM.createRoot(rootElement);
root.render(
  // <React.StrictMode>
  <GoogleOAuthProvider clientId={clientId}>
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
  // </React.StrictMode>
);
