import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.NODE_ENV === 'production' ? '/Contact-Team-Manager/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-v3.png'],
      manifest: {
        name: 'Contact Team Manager',
        short_name: 'CT Manager',
        description: 'チームと対応履歴の進捗を管理するアプリケーション',
        theme_color: '#313338',
        icons: [
          {
            src: 'favicon-v3.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon-v3.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  base: base,
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
