import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this project at https://<user>.github.io/level-up-rpg/,
// so production builds need that sub-path as their base. Override with VITE_BASE
// (e.g. VITE_BASE=/ for a custom domain or local preview at the root).
const REPO_BASE = '/level-up-rpg/';

/**
 * Identifies this build. CI uses the commit SHA; local builds use the checked-out commit.
 * Shown on the title screen and compared with the deployed version.json to detect stale pages.
 */
function buildId(): string {
  const sha = process.env.GITHUB_SHA ?? (() => {
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  })();
  return sha ? sha.slice(0, 7) : 'dev';
}

/**
 * Emits version.json next to index.html. The app fetches it with cache: 'no-store'; if the
 * deployed build differs from the running one (e.g. a cached index.html after a deploy), it
 * offers a reload instead of silently showing the previous version's artwork.
 */
function versionFile(id: string): Plugin {
  return {
    name: 'levelup-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build: id })}\n` });
    },
  };
}

const BUILD_ID = buildId();

export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' || isPreview ? REPO_BASE : '/'),
  plugins: [react(), versionFile(BUILD_ID)],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
