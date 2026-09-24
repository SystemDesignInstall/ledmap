import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  renderer: {
    resolve: {
      alias: { '@ledmap/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
    },
  },
})
