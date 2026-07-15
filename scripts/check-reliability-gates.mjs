import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "config/reliability-gates.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const gates = manifest.gates;
const failures = [];

if (!Array.isArray(gates) || gates.length === 0) {
  failures.push("manifest must contain at least one gate");
}

for (const gate of gates ?? []) {
  for (const field of [
    "id",
    "title",
    "invariant",
    "testFiles",
    "assertionRefs",
  ]) {
    if (!gate[field])
      failures.push(`${gate.id ?? "<unknown>"}: missing ${field}`);
  }
  for (const relativePath of [
    ...(gate.testFiles ?? []),
    ...(gate.assertionRefs ?? []),
  ]) {
    try {
      await access(path.join(root, relativePath));
    } catch {
      failures.push(
        `${gate.id ?? "<unknown>"}: missing referenced path ${relativePath}`,
      );
    }
  }
}

const ids = (gates ?? []).map((gate) => gate.id);
if (new Set(ids).size !== ids.length) failures.push("gate ids must be unique");

if (failures.length > 0) {
  console.error("Reliability-gates manifest failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Reliability-gates manifest passed (${gates.length} gates).`);
