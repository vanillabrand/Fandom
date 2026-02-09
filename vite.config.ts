/**
 * Bundle Optimization Configuration
 * 
 * Optimizes Vite build output with code splitting, tree-shaking, and minification.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  // Development server configuration
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },

  // Build optimizations
  build: {
    // Output directory
    outDir: 'dist',

    // Source maps for debugging (disable in production for smaller bundle)
    sourcemap: false,

    // Chunk size warning limit (1MB)
    chunkSizeWarningLimit: 1000,

    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      format: {
        comments: false // Remove comments
      }
    },

    // Rollup-specific options
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React core
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom'
          ],

          // 3D visualization libraries (largest bundle)
          'vendor-3d': [
            'react-force-graph-3d',
            'three',
            'three-spritetext',
            'd3-force-3d'
          ],

          // UI libraries
          'vendor-ui': [
            'framer-motion',
            'lucide-react',
            'recharts'
          ],

          // Utility libraries
          'vendor-utils': [
            'html2canvas',
            'jspdf'
          ]
        },

        // Naming pattern for chunks
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Target modern browsers for smaller output
    target: 'es2020',

    // Optimize CSS
    cssCodeSplit: true,
    cssMinify: true
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'three'
    ],
    // Exclude large dependencies that should be lazy-loaded
    exclude: []
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
