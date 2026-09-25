import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
mkdirSync(path.join(repoRoot, "test-results"), { recursive: true });
const testRoot = mkdtempSync(path.join(repoRoot, "test-results/native-sqlite-"));
const shimPath = path.join(testRoot, "bun-test-shim.mjs");
const bundlePath = path.join(testRoot, "sqlite-store.test.cjs");
const electronPath = createRequire(import.meta.url)("electron");

try {
  writeFileSync(
    shimPath,
    'export { afterEach, beforeEach, describe, test } from "node:test";\n' +
      'export { expect } from "@playwright/test";\n',
  );
  const bundle = await Bun.build({
    entrypoints: [path.join(repoRoot, "tests/sqlite-store.test.ts")],
    outdir: testRoot,
    naming: "sqlite-store.test.cjs",
    target: "node",
    format: "cjs",
    external: ["better-sqlite3", "@playwright/test"],
    define: { "import.meta.env.BASE_URL": '"/"' },
    plugins: [{
      name: "native-bun-test-shim",
      setup(builder) {
        builder.onResolve({ filter: /^bun:test$/ }, () => ({ path: shimPath }));
      },
    }],
  });
  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log);
    throw new Error("Could not bundle SQLite tests for the Electron runtime");
  }
  const result = spawnSync(electronPath, [bundlePath], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(testRoot, { recursive: true, force: true });
}
