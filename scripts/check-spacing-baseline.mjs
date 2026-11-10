import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The initial v1 -> v2 inventory migration is explicit; future debt only falls. */
export function spacingBaselineGrowth(current, previous) {
  if (current.version !== 2) return ["spacing baseline must remain version 2"];
  if (previous.version === 1) return [];
  if (previous.version !== 2) return ["unknown previous spacing baseline version"];
  const failures = [];
  for (const [path, entries] of Object.entries(current.files))
    for (const [declaration, count] of Object.entries(entries))
      if (count > (previous.files[path]?.[declaration] ?? 0))
        failures.push(`${path}: spacing baseline grew for ${declaration}; fix the declaration instead of adding an exception`);
  return failures;
}

if (import.meta.main) {
  const base = process.argv[2];
  if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error("Pass the PR base commit SHA");
  const previous = JSON.parse(execFileSync("git", ["show", `${base}:config/spacing-ratchet.json`], { encoding: "utf8" }));
  const current = JSON.parse(readFileSync(new URL("../config/spacing-ratchet.json", import.meta.url), "utf8"));
  const failures = spacingBaselineGrowth(current, previous);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else console.log(previous.version === 1
    ? "Spacing baseline: initial declaration inventory migration (v1 -> v2)."
    : "Spacing baseline did not grow relative to the PR base.");
}
