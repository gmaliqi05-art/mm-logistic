/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Translation files are large (~470 KB combined). sq is
          // eagerly imported in src/i18n/index.tsx (it's the default
          // and the fallback); en/de/fr are dynamically imported on
          // language switch. Splitting each locale into its own chunk
          // ensures only the active language is shipped to the browser
          // on first paint.
          if (id.includes('/src/i18n/legal/')) return 'i18n-legal';
          if (id.endsWith('/src/i18n/sq.ts')) return 'i18n-sq';
          if (id.endsWith('/src/i18n/en.ts')) return 'i18n-en';
          if (id.endsWith('/src/i18n/de.ts')) return 'i18n-de';
          if (id.endsWith('/src/i18n/fr.ts')) return 'i18n-fr';
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
