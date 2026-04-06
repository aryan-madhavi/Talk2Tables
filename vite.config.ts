import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isElectron = process.env.ELECTRON === 'true'

export default defineConfig(({ mode }) => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      !isElectron && VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'favicon-196.png', 'apple-icon-180.png'],
        manifest: {
          name: 'Talk2Tables',
          short_name: 'Talk2Tables',
          description: 'Talk2Tables Desktop App',
          theme_color: '#1d4ed8',
          background_color: '#1e3a8a',
          display: 'standalone',
          icons: [
            {
              src: 'manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api/],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    build: {
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':    ['react', 'react-dom', 'react-router'],
            'vendor-firebase': ['firebase/app', 'firebase/auth'],
            'vendor-charts':   ['recharts'],
            'vendor-ui': [
              'lucide-react',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip',
            ],
          },
        },
      },
    },
  }
})
