import path from "node:path";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

await Promise.all([
  build({
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron", "node-pty"],
    sourcemap: true,
  }),
  build({
    entryPoints: ["../codepiddy-permission-extension/index.ts"],
    outfile: "dist/runtime-extensions/permission.js",
    alias: { "jsonc-parser": path.join(repositoryRoot, "node_modules/jsonc-parser/lib/esm/main.js") },
    ignoreAnnotations: true,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["../codepiddy-review-extension/index.ts"],
    outfile: "dist/runtime-extensions/review.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["../codepiddy-retry-extension/index.ts"],
    outfile: "dist/runtime-extensions/retry.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["../codepiddy-cache-warming-extension/index.ts"],
    outfile: "dist/runtime-extensions/cache-warming.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["../codepiddy-tavily-search-mcp/src/index.ts"],
    outfile: "dist/runtime-extensions/tavily-search.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  }),
  build({
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload/index.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
  }),
]);

await Promise.all([
  cp(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "pi-auth-helper.mjs"),
    path.join("dist", "runtime-extensions", "pi-auth-helper.mjs"),
  ),
  cp(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "pi-trust-helper.mjs"),
    path.join("dist", "runtime-extensions", "pi-trust-helper.mjs"),
  ),
  cp(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "pi-share-helper.mjs"),
    path.join("dist", "runtime-extensions", "pi-share-helper.mjs"),
  ),
]);
