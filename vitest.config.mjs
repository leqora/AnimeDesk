import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/integration/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 20000,
  },
})
