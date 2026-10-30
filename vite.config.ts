import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this project at https://<user>.github.io/level-up-rpg/,
// so production builds need that sub-path as their base. Override with VITE_BASE
// (e.g. VITE_BASE=/ for a custom domain or local preview at the root).
const REPO_BASE = '/level-up-rpg/';

export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' || isPreview ? REPO_BASE : '/'),
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
