import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.NODE_ENV === 'production' ? '/Contact-Team-Manager/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest: 自前の SW (public/sw.js) に Workbox の precache manifest を埋め込む。
      // generateSW だと vite-plugin-pwa が自動生成した SW で上書きされ、独自の
      // notificationclick ハンドラが本番に反映されないため。
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      srcDir: 'public',
      filename: 'sw.js',
      includeAssets: ['favicon-v3.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Contact Team Manager',
        short_name: 'CT Manager',
        description: 'チームと対応履歴の進捗を管理するアプリケーション',
        theme_color: '#313338',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: base,
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
