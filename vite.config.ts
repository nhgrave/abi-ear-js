import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  test: {
    exclude: [...configDefaults.exclude, '.claude/**', '.houston/**'],
  },
  build: {
    outDir: 'dist',
  },
})
