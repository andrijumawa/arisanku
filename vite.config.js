import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' agar bisa di-deploy ke GitHub Pages (subfolder repo) tanpa konfigurasi tambahan
export default defineConfig({
  plugins: [react()],
  base: './',
});
