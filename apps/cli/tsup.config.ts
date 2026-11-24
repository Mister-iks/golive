import { defineConfig } from "tsup";

export default defineConfig({
  entry: { golive: "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  // Everything is bundled: the CLI ships as a single file with no runtime dependency.
  noExternal: [/.*/],
  banner: {
    // CommonJS dependencies still call require() for Node built-ins.
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __goliveRequire } from "node:module";',
      "const require = __goliveRequire(import.meta.url);",
    ].join("\n"),
  },
  clean: true,
});
