import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages would serve the project from /timelineprototype/.
  base: command === 'build' ? '/timelineprototype/' : '/',
}));
