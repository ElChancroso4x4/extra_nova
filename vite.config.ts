import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** SPA routes for GitHub Pages: real dirs → HTTP 200; 404.html for unknown paths. */
const SPA_ROUTES = ['presupuesto', 'balance', 'conectores'] as const

function spaFallback(): Plugin {
  return {
    name: 'spa-github-pages-fallback',
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist')
      const index = resolve(dist, 'index.html')
      copyFileSync(index, resolve(dist, '404.html'))
      for (const route of SPA_ROUTES) {
        const dir = resolve(dist, route)
        mkdirSync(dir, { recursive: true })
        copyFileSync(index, resolve(dir, 'index.html'))
      }
    },
  }
}

/**
 * Ensure pdf.js worker is available at `${base}pdf.worker.min.mjs` in both
 * `vite` (dev) and production builds (via public/ → dist/).
 */
function ensurePdfWorker(): Plugin {
  const copy = () => {
    copyFileSync(
      resolve(import.meta.dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
      resolve(import.meta.dirname, 'public/pdf.worker.min.mjs'),
    )
  }
  return {
    name: 'ensure-pdf-worker',
    buildStart() {
      copy()
    },
    configureServer() {
      copy()
    },
  }
}

export default defineConfig({
  // Project site: https://elchancroso4x4.github.io/extra_nova/
  base: '/extra_nova/',
  plugins: [react(), spaFallback(), ensurePdfWorker()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
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
