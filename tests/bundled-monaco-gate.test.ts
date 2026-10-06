import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dir, "..", "src");
const RUNTIME_MODULE = path.join("lib", "monaco", "monaco-runtime.ts");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

/** Value imports only; `import type` cannot mount an editor. */
const VALUE_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+["']@monaco-editor\/react["']/m;

describe("bundled Monaco gate", () => {
  test("every module that can mount a Monaco editor waits for the bundled runtime", () => {
    const mounting = sourceFiles(SRC).filter((file) =>
      VALUE_IMPORT.test(readFileSync(file, "utf8")),
    );
    const relative = mounting.map((file) => path.relative(SRC, file));

    // An editor that mounts before `loader.config({ monaco })` makes
    // @monaco-editor/react fetch its CDN build instead of the bundled one.
    const ungated = relative.filter((file) => {
      if (file === RUNTIME_MODULE) return false;
      return !readFileSync(path.join(SRC, file), "utf8").includes(
        "useBundledMonaco(",
      );
    });

    expect(relative).toContain(RUNTIME_MODULE);
    expect(ungated).toEqual([]);
  });
});
