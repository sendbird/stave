import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

const PATCH_TARGETS = [
  {
    filePath: "node_modules/better-sqlite3/src/objects/statement.cpp",
    signature: "NODE_GETTER(Statement::JS_busy) {",
    from: "Unwrap<Statement>(PROPERTY_HOLDER(info))",
    to: "Unwrap<Statement>(info.HolderV2())",
  },
  {
    filePath: "node_modules/better-sqlite3/src/objects/database.cpp",
    signature: "NODE_GETTER(Database::JS_open) {",
    from: "Unwrap<Database>(PROPERTY_HOLDER(info))",
    to: "Unwrap<Database>(info.HolderV2())",
  },
  {
    filePath: "node_modules/better-sqlite3/src/objects/database.cpp",
    signature: "NODE_GETTER(Database::JS_inTransaction) {",
    from: "Unwrap<Database>(PROPERTY_HOLDER(info))",
    to: "Unwrap<Database>(info.HolderV2())",
  },
];

function findMatchingBraceIndex(source, openBraceIndex) {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`Unclosed block starting at index ${openBraceIndex}`);
}

export function patchScopedSourceBlock(args) {
  const signatureIndex = args.source.indexOf(args.signature);
  if (signatureIndex === -1) {
    throw new Error(`Patch signature not found: ${args.signature}`);
  }

  const openBraceIndex = args.source.indexOf("{", signatureIndex);
  if (openBraceIndex === -1) {
    throw new Error(`Patch block has no opening brace: ${args.signature}`);
  }

  const closeBraceIndex = findMatchingBraceIndex(args.source, openBraceIndex);
  const block = args.source.slice(signatureIndex, closeBraceIndex + 1);

  if (block.includes(args.to)) {
    return args.source;
  }
  if (!block.includes(args.from)) {
    throw new Error(`Patch target not found inside ${args.signature}`);
  }

  const nextBlock = block.replace(args.from, args.to);
  return args.source.slice(0, signatureIndex) + nextBlock + args.source.slice(closeBraceIndex + 1);
}

export function applyBetterSqlite3ElectronPatch(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;

  for (const target of PATCH_TARGETS) {
    const absoluteFilePath = path.join(repoRoot, target.filePath);
    const source = readFileSync(absoluteFilePath, "utf8");
    const nextSource = patchScopedSourceBlock({
      source,
      signature: target.signature,
      from: target.from,
      to: target.to,
    });
    if (nextSource !== source) {
      writeFileSync(absoluteFilePath, nextSource, "utf8");
    }
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  applyBetterSqlite3ElectronPatch();
}
