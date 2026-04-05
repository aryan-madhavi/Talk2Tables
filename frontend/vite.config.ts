import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const isElectron = process.env.ELECTRON === 'true'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
    ],

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