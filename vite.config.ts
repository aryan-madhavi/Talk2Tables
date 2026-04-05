import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isAdmin = env.VITE_ALLOW_SIGNUP !== 'false'
  const color1 = isAdmin ? '%237c3aed' : '%23759fbc'

  return {
    base: "./",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'inject-favicon-color',
        transformIndexHtml(html) {
          return html.replace('__FAVICON_COLOR1__', color1)
        }
      },
      mode !== 'development' ? obfuscator({
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [/node_modules/],
        apply: 'build',
        debugger: true,
        options: {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: 'hexadecimal',
          log: false,
          stringArray: true,
          stringArrayEncoding: ['base64'],
        }
      }) : undefined,
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':  ['react', 'react-dom', 'react-router'],
            'vendor-charts': ['recharts'],
            'vendor-ui':     ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
          },
        },
      },
    },
  }
})
