import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        recorder: resolve(import.meta.dirname, 'spike/recorder/index.html'),
      },
    },
  },
})


