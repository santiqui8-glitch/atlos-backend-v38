import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // V40-03B: vendors pesados en chunk propio + monitoreo del tamaño.
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        // V40-03B: vendors pesados en chunks propios (forma función que
        // exige rolldown; undefined = comportamiento por defecto).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('\\react\\') || id.includes('\\react-dom\\')) return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg','icon-192.png','icon-512.png'],
      manifest: {
        name: 'ATLOS - Gestión de Gimnasios',
        short_name: 'ATLOS',
        description: 'Gestión de alumnos, cuotas, rutinas y asistencia con modo offline.',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ]
})
