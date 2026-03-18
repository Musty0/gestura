import { defineConfig } from 'vite'

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: 'client/game.html',
      },
    },
  },
  server: {
    port: 3000,
  },
})
