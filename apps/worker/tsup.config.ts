import { defineConfig } from "tsup";

export default defineConfig({
  entry: { worker: "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  // Workspace packages and pure JS dependencies are bundled. The browser driver stays
  // external: it loads its own files at runtime and ships with the Playwright image.
  noExternal: [/^(?!playwright-core|@axe-core\/playwright|pg-native).*/],
  external: ["playwright-core", "@axe-core/playwright", "pg-native"],
  banner: {
    js: ['import { createRequire as __goliveRequire } from "node:module";', "const require = __goliveRequire(import.meta.url);"].join("\n"),
  },
  clean: true,
});
