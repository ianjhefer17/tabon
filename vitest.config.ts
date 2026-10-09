import { configDefaults, defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the PWA plugin.
export default defineConfig({
  test: {
    environment: 'node',
    // Skip macOS resource-fork files (._*) that appear on non-HFS drives.
    exclude: [...configDefaults.exclude, '**/._*'],
  },
})
