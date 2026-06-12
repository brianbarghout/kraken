import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Explicit root: the app's vite.config sets root 'app', which must not
// leak into test discovery.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['engine/tests/**/*.test.ts', 'app/tests/**/*.test.ts'],
  },
});
