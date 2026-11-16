import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the build can be served from TapeOut DeWEB (tape://) or any sub-path.
  base: './',
});
