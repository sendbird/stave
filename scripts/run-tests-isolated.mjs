import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const testsRoot = path.join(root, "tests");
const testFilePattern = /\.test\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(filePath)));
      continue;
    }
    if (entry.isFile() && testFilePattern.test(entry.name)) {
      files.push(filePath);
    }
  }

  return files;
}

function runTestFile(filePath) {
  return new Promise((resolve) => {
    const child = spawn(process.env.BUN_BINARY ?? "bun", ["test", filePath], {
      cwd: root,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      console.error(`[test:isolated] failed to start ${filePath}:`, error);
      resolve(1);
    });
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

const testFiles = (await collectTestFiles(testsRoot)).sort();
if (testFiles.length === 0) {
  console.error(`[test:isolated] no test files found under ${testsRoot}`);
  process.exit(1);
}

for (const [index, filePath] of testFiles.entries()) {
  const relativePath = path.relative(root, filePath);
  console.log(`[test:isolated] ${index + 1}/${testFiles.length} ${relativePath}`);
  const status = await runTestFile(filePath);
  if (status !== 0) {
    console.error(`[test:isolated] failed: ${relativePath}`);
    process.exit(status);
  }
}

console.log(`[test:isolated] passed ${testFiles.length} files`);
