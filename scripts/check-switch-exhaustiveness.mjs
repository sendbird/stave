import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
let eslintPackagePath;
try {
  eslintPackagePath = require.resolve("eslint/package.json");
} catch {
  console.error("Switch-exhaustiveness failed: eslint is not installed.");
  process.exit(1);
}

const eslintPackage = JSON.parse(readFileSync(eslintPackagePath, "utf8"));
const eslintBin =
  typeof eslintPackage.bin === "string"
    ? eslintPackage.bin
    : eslintPackage.bin?.eslint;

if (!eslintBin) {
  console.error("Switch-exhaustiveness failed: eslint has no executable.");
  process.exit(1);
}

const eslintPath = path.resolve(path.dirname(eslintPackagePath), eslintBin);
const result = spawnSync(
  process.execPath,
  [eslintPath, "src/lib/terminal/osc133.ts"],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("Switch-exhaustiveness failed: eslint could not run.");
  console.error(`- ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
