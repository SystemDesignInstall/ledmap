import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./src/preload/index.ts', import.meta.url)),
          output: fileURLToPath(new URL('./src/preload/output.ts', import.meta.url)),
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: {
      alias: { '@ledmap/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
    },
    build: {
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./src/renderer/index.html', import.meta.url)),
          output: fileURLToPath(new URL('./src/renderer/output.html', import.meta.url)),
        },
      },
    },
  },
})
