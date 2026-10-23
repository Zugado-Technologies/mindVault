import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.PROXY_BACKEND_URL || process.env.VITE_API_URL || 'https://mindvault-sfny.onrender.com',
                changeOrigin: true,
                secure: false,
            },
            '/auth': {
                target: process.env.PROXY_BACKEND_URL || process.env.VITE_API_URL || 'https://mindvault-sfny.onrender.com',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
