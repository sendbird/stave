import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = process.cwd();
const testsRoot = path.join(root, "tests");
const testFilePattern = /\.test\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const moduleMockCall = /(?:^|[^\w.])mock\.module\s*\(\s*['"`]/;
const persistRehydrationCall = /\.persist\.setOptions\s*\(/;
const sharedNotificationStoreCall = /\blistNotifications\s*\(/;

export function usesProcessWideModuleMock(source) {
  return moduleMockCall.test(source);
}

export function needsProcessIsolation(source) {
  return (
    usesProcessWideModuleMock(source) ||
    persistRehydrationCall.test(source) ||
    sharedNotificationStoreCall.test(source)
  );
}

export function partitionTestFiles(files, sourcesByFile) {
  const isolated = [];
  const shared = [];

  for (const filePath of files) {
    if (needsProcessIsolation(sourcesByFile.get(filePath) ?? "")) {
      isolated.push(filePath);
    } else {
      shared.push(filePath);
    }
  }

  return { isolated, shared };
}

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

function runBunTest(filePaths) {
  return new Promise((resolve) => {
    const child = spawn(process.env.BUN_BINARY ?? "bun", ["test", ...filePaths], {
      cwd: root,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      console.error("[test:isolated] failed to start bun test:", error);
      resolve(1);
    });
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === scriptPath;
}

export async function runIsolatedTestSuite() {
  const testFiles = (await collectTestFiles(testsRoot)).sort();
  if (testFiles.length === 0) {
    console.error(`[test:isolated] no test files found under ${testsRoot}`);
    return 1;
  }

  const sourcesByFile = new Map(
    await Promise.all(
      testFiles.map(async (filePath) => [filePath, await readFile(filePath, "utf8")]),
    ),
  );
  const { isolated, shared } = partitionTestFiles(testFiles, sourcesByFile);

  console.log(
    `[test:isolated] ${shared.length} shared files in one process, ${isolated.length} isolated files`,
  );

  if (shared.length > 0) {
    const sharedStatus = await runBunTest(shared);
    if (sharedStatus !== 0) {
      console.error("[test:isolated] failed: shared process");
      return sharedStatus;
    }
  }

  for (const [index, filePath] of isolated.entries()) {
    const relativePath = path.relative(root, filePath);
    console.log(
      `[test:isolated] ${index + 1}/${isolated.length} ${relativePath}`,
    );
    const status = await runBunTest([filePath]);
    if (status !== 0) {
      console.error(`[test:isolated] failed: ${relativePath}`);
      return status;
    }
  }

  console.log(
    `[test:isolated] passed ${testFiles.length} files (${shared.length} shared, ${isolated.length} isolated)`,
  );
  return 0;
}

if (isMainModule()) {
  process.exit(await runIsolatedTestSuite());
}
