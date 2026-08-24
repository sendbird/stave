#!/usr/bin/env node
/*
 * Typecheck the Lens main-process surface.
 *
 * `bun run typecheck` covers `src` only — `tsconfig.json` does not include
 * `electron`, so nothing in the main process is type-checked by any gate this
 * repo runs today (`build:desktop` runs the same src-only `tsc`, then
 * `electron-vite build`, which strips types without checking them).
 *
 * Making the whole main process clean is a separate project: a combined
 * program reports ~215 pre-existing errors across the host service, the SCM
 * runtime, and the local MCP runtime. This gate is deliberately narrow — it
 * fails only on the Lens files, which is the surface whose correctness stops
 * being observable at all once the guest page is created by the renderer.
 */
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Repo-relative path prefixes this gate is responsible for. */
const SCOPE = /(^|\s|\()electron\/main\/(browser\/|ipc\/browser\.ts)/;

/*
 * Written into the repo root rather than a temp directory so `include`,
 * `extends`, and the paths in tsc's output all stay repo-relative.
 */
const configPath = path.join(repoRoot, "tsconfig.lens-main.generated.json");

writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: { types: ["node"] },
      include: ["src", "electron"],
    },
    null,
    2,
  )}\n`,
);

try {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      configPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  // A gate that cannot run must not report success. Without this, a missing or
  // moved compiler would make every check pass with an empty error list.
  if (result.error || typeof result.status !== "number") {
    console.error(result.error ?? "tsc did not run");
    process.exit(1);
  }

  const lines = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n");
  const errors = lines.filter(
    (line) => /error TS/.test(line) && SCOPE.test(line),
  );

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    console.error(
      `\nLens main-process typecheck failed (${errors.length} errors).`,
    );
    process.exit(1);
  }

  console.log("Lens main-process typecheck passed.");
} finally {
  rmSync(configPath, { force: true });
}
