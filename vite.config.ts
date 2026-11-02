import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [vue()],
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        recorder: resolve(import.meta.dirname, 'spike/recorder/index.html'),
      },
    },
  },
})
