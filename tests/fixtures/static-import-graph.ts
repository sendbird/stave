import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SRC_ROOT = resolve(import.meta.dir, "../../src");
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSource(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC_ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null; // package: not part of the app's own graph
  if (/\.(css|json|svg|png|wasm)$/.test(base)) return null;
  if (existsSync(base) && /\.tsx?$/.test(base)) return base;
  for (const extension of EXTENSIONS) {
    if (existsSync(base + extension)) return base + extension;
  }
  return null;
}

/**
 * Every app source file `entry` loads through static (value) imports, with the
 * chain that first reached it. Type-only imports are erased by the transpiler
 * and dynamic `import()` calls are not followed.
 */
export async function staticImportGraph(entry: string): Promise<Map<string, string[]>> {
  const start = resolve(entry);
  const chains = new Map<string, string[]>([[start, [start]]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const transpiler = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" });
    const imports = transpiler.scanImports(await Bun.file(file).text());
    for (const entryImport of imports) {
      if (entryImport.kind !== "import-statement") continue;
      const target = resolveSource(entryImport.path, file);
      if (!target || chains.has(target)) continue;
      chains.set(target, [...chains.get(file)!, target]);
      queue.push(target);
    }
  }
  return chains;
}
