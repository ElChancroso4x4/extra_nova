import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** GitHub Pages serves 404.html for unknown paths; copy index for SPA deep links. */
function spaFallback(): Plugin {
  return {
    name: 'spa-github-pages-fallback',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
    },
  }
}

export default defineConfig({
  // Project site: https://elchancroso4x4.github.io/extra_nova/
  base: '/extra_nova/',
  plugins: [react(), spaFallback()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Node lacks DOMMatrix in the modern pdf.js build; only remap the package root
    alias: [
      {
        find: /^pdfjs-dist$/,
        replacement: 'pdfjs-dist/legacy/build/pdf.mjs',
      },
    ],
  },
})
