import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import os from 'node:os'

// One isolated worker per test file. Limiting workers is preventive: "Timeout waiting for worker" (vitest's 60 s
// start timeout is not configurable) may come from oversubscribed CPUs (e.g. `npm run build` alongside), though it
// never reproduced; load-sensitive UI tests also behave better with fewer parallel workers.
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
