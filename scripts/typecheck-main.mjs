#!/usr/bin/env node
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countDiagnostics,
  compareDiagnostics,
} from "./main-typecheck-baseline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = ts.readConfigFile(
  path.join(root, "tsconfig.json"),
  ts.sys.readFile,
);
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  );
const parsed = ts.parseJsonConfigFileContent(
  {
    ...config.config,
    include: ["src", "electron"],
    compilerOptions: { ...config.config.compilerOptions, types: ["node"] },
  },
  ts.sys,
  root,
);
const program = ts.createProgram(parsed.fileNames.sort(), parsed.options);
const diagnostics = [
  ...parsed.errors,
  ...ts.getPreEmitDiagnostics(program),
].filter((d) => d.category === ts.DiagnosticCategory.Error);
const errors = diagnostics.map((d) => ({
  file: d.file
    ? path.relative(root, d.file.fileName).split(path.sep).join("/")
    : "<config>",
  code: d.code,
  source:
    d.file && d.start !== undefined
      ? d.file.text.slice(d.start, d.start + (d.length ?? 0))
      : "<config>",
  message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
}));
if (process.argv.includes("--details")) console.log(JSON.stringify(errors, null, 2));
// Config errors, renderer errors and the established Lens scope never receive
// allowances. An unreadable baseline or compiler failure throws, failing CI.
const protectedErrors = errors.filter(
  (d) =>
    !d.file.startsWith("electron/") ||
    /^electron\/main\/(browser\/|ipc\/browser\.ts)/.test(d.file),
);
const baseline = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/main-typecheck-baseline.json"),
    "utf8",
  ),
);
const { added, removed } = compareDiagnostics(
  countDiagnostics(errors),
  baseline,
);
if (protectedErrors.length || added.length || removed.length) {
  console.error(JSON.stringify({ protectedErrors, added, removed }, null, 2));
  console.error(
    "Main typecheck failed. Fix new diagnostics; remove resolved entries from the baseline. Do not increase allowances to pass CI.",
  );
  process.exitCode = 1;
} else {
  console.log(
    `Main typecheck passed with ${errors.length} explicitly baselined diagnostics; renderer and Lens have zero errors.`,
  );
}
