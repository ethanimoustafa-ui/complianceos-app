import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Minimal vitest config for pure-function unit tests.
//
// - Tests live in `tests/unit/*.test.ts` (TypeScript, ESM).
// - The `@/` alias mirrors the Next.js `tsconfig.json` "paths" mapping so test
//   files can import from `@/lib/...` etc.
// - Probes (`tests/probes/**`) are deliberately NOT included — those are
//   stand-alone scripts that hit a running dev server and run via `tsx`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
