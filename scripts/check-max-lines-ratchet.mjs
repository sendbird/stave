import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configPath = path.join(root, "config/max-lines-ratchet.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const failures = [];

for (const [relativePath, maximum] of Object.entries(config.files ?? {})) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const lineCount = source.split("\n").length;
  if (lineCount > maximum) {
    failures.push(`${relativePath}: ${lineCount} lines exceeds ${maximum}`);
  }
}

if (failures.length > 0) {
  console.error("Max-lines ratchet failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Max-lines ratchet passed (${Object.keys(config.files ?? {}).length} files).`,
);
