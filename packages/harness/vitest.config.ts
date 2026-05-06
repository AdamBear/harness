import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/errors/**/*.test.ts',
      'src/logger/**/*.test.ts',
      'src/telemetry/**/*.test.ts',
      'src/ulid/**/*.test.ts',
      'src/models/**/*.test.ts',
      'src/ports/**/*.test.ts',
      'src/tools/**/*.test.ts',
      'test/**/*.test.ts'
    ]
  }
})
