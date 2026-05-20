/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Translation files are large (~470 KB combined) and eagerly imported
          // from src/i18n/index.tsx. Splitting them off keeps the main entry
          // chunk lean so the first paint is faster on the public pages that
          // do not need every language at once.
          if (id.includes('/src/i18n/')) return 'i18n';
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'react-vendor';
            if (id.includes('/react-dom/') || id.includes('/react/')) return 'react-vendor';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@tiptap')) return 'tiptap';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('leaflet')) return 'maps';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
