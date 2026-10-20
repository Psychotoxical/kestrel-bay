import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Second run for the iOS/Android touch shell: the build flag is on, so the
// branches compiled only into the app build (`IS_MOBILE_SHELL`) execute.
// Picks up `*.mobile.test.{ts,tsx}` only; the base run excludes them.
// Spread, not `mergeConfig`: that would concatenate include/exclude lists.
export default defineConfig({
  ...base,
  define: {
    ...base.define,
    __PSY_MOBILE_SHELL__: 'true',
    __PSY_MOBILE_PLATFORM__: '"ios"',
  },
  test: {
    ...base.test,
    include: ['src/**/*.mobile.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'src-tauri/**'],
  },
});
