import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRootFilePath } from "../utils/filesystem";

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|d\.[cm]?ts)$/;
const TYPE_DECLARATION_FILE_PATTERN = /\.d\.[cm]?ts$/;
const AMBIENT_SCAN_EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "build",
  ".next",
  ".nuxt",
  "coverage",
]);
const RESOLVABLE_SOURCE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".d.ts",
  ".d.mts",
  ".d.cts",
  "/index.ts",
  "/index.tsx",
  "/index.mts",
  "/index.cts",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
  "/index.d.ts",
  "/index.d.mts",
  "/index.d.cts",
] as const;
const IMPORT_SPECIFIER_PATTERN = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const DEFAULT_MAX_FOCUSED_SOURCE_FILE_COUNT = 600;
const DEFAULT_MAX_FOCUSED_PACKAGE_COUNT = 160;

interface RawTypeScriptCompilerOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  types?: string[];
}

interface InspectTsConfig {
  baseUrl: string;
  paths: Array<{
    pattern: string;
    targets: string[];
  }>;
  types: string[];
}

export interface FocusedWorkspaceInspectContext {
  sourceFiles: Array<{
    content: string;
    filePath: string;
  }>;
  packageNames: string[];
}

function stripJsonComments(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (!current) {
      continue;
    }

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (current === "\"") {
      inString = true;
    }

    result += current;
  }

  return result;
}

function stripTrailingCommas(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (!current) {
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead] ?? "")) {
        lookahead += 1;
      }
      const nextNonWhitespace = value[lookahead];
      if (nextNonWhitespace === "}" || nextNonWhitespace === "]") {
        continue;
      }
    }

    result += current;
  }

  return result;
}

function normalizeWorkspaceRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const output: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }

  return output.join("/");
}

function normalizePathTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("file:///")) {
    return trimmed;
  }
  return trimmed.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\/+/, "");
}

function toBarePackageName(specifier: string) {
  const trimmed = specifier.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("file:")) {
    return null;
  }
  if (trimmed.startsWith("@")) {
    const [scope, name] = trimmed.split("/");
    return scope && name ? `${scope}/${name}` : null;
  }
  const [name] = trimmed.split("/");
  return name || null;
}

function resolveCandidateWorkspacePath(args: {
  baseUrl: string;
  candidate: string;
}) {
  return normalizeWorkspaceRelativePath(
    args.baseUrl
      ? path.posix.join(args.baseUrl, args.candidate)
      : args.candidate,
  );
}

async function pathIsFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveWorkspaceFile(args: {
  rootPath: string;
  candidate: string;
}) {
  const normalizedCandidate = normalizeWorkspaceRelativePath(args.candidate);
  if (!normalizedCandidate) {
    return null;
  }

  for (const suffix of RESOLVABLE_SOURCE_SUFFIXES) {
    const relativePath = suffix
      ? suffix.startsWith("/") ? `${normalizedCandidate}${suffix}` : `${normalizedCandidate}${suffix}`
      : normalizedCandidate;
    const absolutePath = resolveRootFilePath({
      rootPath: args.rootPath,
      filePath: relativePath,
    });
    if (!absolutePath) {
      continue;
    }
    if (!await pathIsFile(absolutePath)) {
      continue;
    }
    return {
      absolutePath,
      filePath: relativePath,
    };
  }

  return null;
}

function extractImportSpecifiers(content: string) {
  const matches = new Set<string>();
  for (const match of content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      matches.add(specifier);
    }
  }
  return Array.from(matches);
}

async function readInspectTsConfig(rootPath: string): Promise<InspectTsConfig | null> {
  try {
    const content = await fs.readFile(path.join(rootPath, "tsconfig.json"), "utf8");
    const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(content))) as {
      compilerOptions?: RawTypeScriptCompilerOptions;
    };
    const compilerOptions = parsed.compilerOptions;
    if (!compilerOptions) {
      return null;
    }

    return {
      baseUrl: compilerOptions.baseUrl ? normalizeWorkspaceRelativePath(compilerOptions.baseUrl) : "",
      paths: Object.entries(compilerOptions.paths ?? {}).map(([pattern, targets]) => ({
        pattern,
        targets: targets.map((target) => normalizePathTarget(target)).filter(Boolean),
      })),
      types: Array.from(new Set(
        (compilerOptions.types ?? [])
          .map((entry) => toBarePackageName(entry))
          .filter((entry): entry is string => Boolean(entry)),
      )),
    };
  } catch {
    return null;
  }
}

async function resolveWorkspaceImport(args: {
  rootPath: string;
  fromFilePath: string;
  specifier: string;
  tsConfig: InspectTsConfig | null;
}) {
  const specifier = args.specifier.trim();
  if (!specifier || specifier.startsWith("file:")) {
    return null;
  }

  const candidates: string[] = [];
  if (specifier.startsWith(".")) {
    const fromDir = path.posix.dirname(args.fromFilePath.replaceAll("\\", "/"));
    candidates.push(normalizeWorkspaceRelativePath(path.posix.join(fromDir, specifier)));
  } else {
    for (const mapping of args.tsConfig?.paths ?? []) {
      const wildcardIndex = mapping.pattern.indexOf("*");
      if (wildcardIndex >= 0) {
        const prefix = mapping.pattern.slice(0, wildcardIndex);
        const suffix = mapping.pattern.slice(wildcardIndex + 1);
        if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
          continue;
        }
        const wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
        for (const target of mapping.targets) {
          candidates.push(resolveCandidateWorkspacePath({
            baseUrl: args.tsConfig?.baseUrl ?? "",
            candidate: target.replace("*", wildcard),
          }));
        }
        continue;
      }

      if (specifier === mapping.pattern) {
        for (const target of mapping.targets) {
          candidates.push(resolveCandidateWorkspacePath({
            baseUrl: args.tsConfig?.baseUrl ?? "",
            candidate: target,
          }));
        }
      }
    }

    if (args.tsConfig?.baseUrl) {
      candidates.push(resolveCandidateWorkspacePath({
        baseUrl: args.tsConfig.baseUrl,
        candidate: specifier,
      }));
    }
  }

  for (const candidate of candidates) {
    const resolved = await resolveWorkspaceFile({
      rootPath: args.rootPath,
      candidate,
    });
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function collectAmbientTypeDeclarationFiles(args: {
  rootPath: string;
  maxFileCount: number;
  visitedFiles: Set<string>;
}) {
  const files: Array<{ content: string; filePath: string }> = [];
  const directoryQueue: string[] = [""];

  while (directoryQueue.length > 0 && files.length < args.maxFileCount) {
    const relativeDir = directoryQueue.shift();
    if (relativeDir === undefined) {
      continue;
    }

    const absoluteDir = relativeDir
      ? path.join(args.rootPath, relativeDir)
      : args.rootPath;

    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= args.maxFileCount) {
        break;
      }
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!AMBIENT_SCAN_EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          directoryQueue.push(relativePath);
        }
        continue;
      }

      if (!entry.isFile() || !TYPE_DECLARATION_FILE_PATTERN.test(entry.name)) {
        continue;
      }
      if (args.visitedFiles.has(relativePath)) {
        continue;
      }

      try {
        const content = await fs.readFile(path.join(absoluteDir, entry.name), "utf8");
        files.push({ content, filePath: relativePath });
      } catch {
        // Skip unreadable files.
      }
    }
  }

  return files;
}

export async function collectFocusedWorkspaceInspectContext(args: {
  rootPath?: string | null;
  entryFilePath?: string | null;
  maxSourceFileCount?: number;
  maxPackageCount?: number;
}): Promise<FocusedWorkspaceInspectContext> {
  const rootPath = resolveRootFilePath({ rootPath: args.rootPath, filePath: "." });
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }

  const entryFilePath = normalizeWorkspaceRelativePath(args.entryFilePath ?? "");
  if (!entryFilePath) {
    return {
      sourceFiles: [],
      packageNames: [],
    };
  }

  const maxSourceFileCount = args.maxSourceFileCount ?? DEFAULT_MAX_FOCUSED_SOURCE_FILE_COUNT;
  const maxPackageCount = args.maxPackageCount ?? DEFAULT_MAX_FOCUSED_PACKAGE_COUNT;
  const tsConfig = await readInspectTsConfig(rootPath);
  const packageNames = new Set<string>(tsConfig?.types ?? []);
  const sourceFiles: Array<{ content: string; filePath: string }> = [];
  const queuedFiles = new Set<string>();
  const visitedFiles = new Set<string>();
  const fileQueue: string[] = [];

  function enqueueFile(filePath: string | null) {
    if (!filePath || queuedFiles.has(filePath) || visitedFiles.has(filePath)) {
      return;
    }
    queuedFiles.add(filePath);
    fileQueue.push(filePath);
  }

  enqueueFile(entryFilePath);

  while (fileQueue.length > 0 && sourceFiles.length < maxSourceFileCount) {
    const filePath = fileQueue.shift();
    if (!filePath) {
      continue;
    }
    queuedFiles.delete(filePath);
    if (visitedFiles.has(filePath)) {
      continue;
    }
    visitedFiles.add(filePath);

    const absolutePath = resolveRootFilePath({ rootPath, filePath });
    if (!absolutePath || !SOURCE_FILE_PATTERN.test(filePath)) {
      continue;
    }

    let content = "";
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    sourceFiles.push({ content, filePath });

    for (const specifier of extractImportSpecifiers(content)) {
      const resolvedFile = await resolveWorkspaceImport({
        rootPath,
        fromFilePath: filePath,
        specifier,
        tsConfig,
      });
      if (resolvedFile) {
        enqueueFile(resolvedFile.filePath);
        continue;
      }

      if (packageNames.size >= maxPackageCount) {
        continue;
      }
      const packageName = toBarePackageName(specifier);
      if (packageName) {
        packageNames.add(packageName);
      }
    }
  }

  const remainingCapacity = maxSourceFileCount - sourceFiles.length;
  if (remainingCapacity > 0) {
    const ambientFiles = await collectAmbientTypeDeclarationFiles({
      rootPath,
      maxFileCount: remainingCapacity,
      visitedFiles,
    });
    for (const file of ambientFiles) {
      sourceFiles.push(file);
    }
  }

  return {
    sourceFiles,
    packageNames: Array.from(packageNames),
  };
}
