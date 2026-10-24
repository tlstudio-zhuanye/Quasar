import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  // Electron 以 file:// 加载，必须用相对路径
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome122',
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 5178,
    strictPort: true
  }
})
