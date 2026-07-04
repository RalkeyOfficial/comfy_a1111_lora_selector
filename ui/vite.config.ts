import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// ComfyUI recursively imports every .js under the extension's web dir, so we
// emit a single self-contained bundle (CSS is inlined via `?inline`).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'rewrite-comfy-imports',
      resolveId(source: string) {
        if (mode !== 'development') return
        if (source === '/scripts/app.js') return 'http://127.0.0.1:8188/scripts/app.js'
        if (source === '/scripts/api.js') return 'http://127.0.0.1:8188/scripts/api.js'
        return null
      }
    }
  ],
  build: {
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      external: ['/scripts/app.js', '/scripts/api.js'],
      input: path.resolve(__dirname, 'src/main.tsx'),
      output: {
        dir: path.resolve(__dirname, '../dist'),
        entryFileNames: 'main.js',
        inlineDynamicImports: true
      }
    }
  }
}))
