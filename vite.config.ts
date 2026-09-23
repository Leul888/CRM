import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 8080}`;

export default defineConfig({
  server: { port: 3000, host: '0.0.0.0', proxy: { '/api': { target: API, changeOrigin: false } } },
  preview: { port: 4173, host: '0.0.0.0', proxy: { '/api': { target: API } } },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], icons: ['lucide-react'] } },
    },
  },
});
