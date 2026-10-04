import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
