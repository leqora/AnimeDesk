import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['tests/live/**/*.test.js'], testTimeout: 15 * 60 * 1000 } })
