import { readFileSync, writeFileSync } from "node:fs";
import { inventory } from "./style-utility-inventory.mjs";

const url = new URL("../config/style-utility-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(url, "utf8"));
const current = inventory();
const dataLiterals = baseline.dataLiterals ?? {};
const next = {};
for (const path of Object.keys(current).sort()) {
  if (path in dataLiterals) continue;
  next[path] = current[path];
}
const removed = Object.keys(baseline.files).filter((path) => !(path in next));
const lowered = Object.keys(next).filter((path) => (baseline.files[path] ?? 0) > next[path]);
writeFileSync(url, `${JSON.stringify({ ...baseline, files: next }, null, 2)}\n`);
console.log(`baseline files ${Object.keys(baseline.files).length} -> ${Object.keys(next).length} (cleared ${removed.length}, lowered ${lowered.length})`);
