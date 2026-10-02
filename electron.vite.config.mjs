import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: { build: { assetsInlineLimit: 0 }, plugins: [react()] },
})
