import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import os from 'node:os'

// One isolated worker per test file; with all logical CPUs busy (or `npm run build` running alongside) workers
// start late: "Timeout waiting for worker" (vitest's 60 s start timeout is not configurable) and load-sensitive UI tests.
const maxWorkers = Math.max(2, Math.floor(os.availableParallelism() / 2))

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/integration/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    testTimeout: 20000,
    maxWorkers,
  },
})
