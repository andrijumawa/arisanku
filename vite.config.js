import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' agar bisa di-deploy ke GitHub Pages (subfolder repo) tanpa konfigurasi tambahan
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'react-vendor';
        },
      },
    },
  },
});
