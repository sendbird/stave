import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const resultsRoot = path.join(repositoryRoot, "test-results");
mkdirSync(resultsRoot, { recursive: true });
const output = mkdtempSync(path.join(resultsRoot, "content-search-benchmark-"));
try {
  const filename = "benchmark.cjs";
  const bundle = await Bun.build({
    entrypoints: [path.join(repositoryRoot, "tests/content-search-benchmark.native.ts")],
    outdir: output,
    naming: filename,
    target: "node",
    format: "cjs",
    external: ["better-sqlite3"],
    define: { "import.meta.env.BASE_URL": '"/"' },
  });
  if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
  const options = { cwd: repositoryRoot, encoding: "utf8" as const, timeout: 300_000 };
  let result = spawnSync("node", [path.join(output, filename)], options);
  if (result.status !== 0 && /NODE_MODULE_VERSION|compiled against a different Node/.test(result.stderr ?? "")) {
    const desktopRuntime = createRequire(import.meta.url)("electron") as string;
    result = spawnSync(desktopRuntime, [path.join(output, filename)], {
      ...options,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
  }
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
