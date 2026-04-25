import { resolvePathBaseName } from "@/lib/path-utils";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";

export interface ResolvedWorkspaceFileLink {
  filePath: string;
  fileName: string;
  line?: number;
  column?: number;
}

const knownFilePathSetCache = new WeakMap<readonly string[], Set<string>>();
const FILE_PATH_SPECIAL_BASENAMES = new Set([
  "brewfile",
  "contributing",
  "dockerfile",
  "gemfile",
  "gitignore",
  "makefile",
  "readme",
  "license",
  "gitattributes",
  "jenkinsfile",
  "justfile",
  "procfile",
  "env",
]);

function stripLineSuffix(href: string) {
  return href
    .replace(/#L\d+(?:C\d+)?$/i, "")
    .replace(/:\d+(?::\d+)?$/, "");
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[),.;:!?]+$/g, "");
}

function hasFileLikeBaseName(filePath: string) {
  const baseName = toBaseName(filePath);
  if (!baseName || baseName === "." || baseName === "..") {
    return false;
  }

  const hasExtension = /\.[a-z0-9_-]{1,16}$/i.test(baseName);
  const isDotFile = /^\.[a-z0-9._-]+$/i.test(baseName);
  const isSpecialBaseName = FILE_PATH_SPECIAL_BASENAMES.has(baseName.toLowerCase());

  return hasExtension || isDotFile || isSpecialBaseName;
}

export function isLikelyWorkspaceFilePath(filePath: string) {
  const normalized = trimTrailingPunctuation(stripLineSuffix(filePath.trim()))
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized) {
    return false;
  }
  if (/[`"'[\]{}()<>|*?]/.test(normalized)) {
    return false;
  }
  if (/\s/.test(normalized)) {
    return false;
  }
  if (normalized.startsWith("-")) {
    return false;
  }
  return hasFileLikeBaseName(normalized);
}

function parseFileLinkLocation(href: string) {
  const hashMatch = href.match(/#L(\d+)(?:C(\d+))?$/i);
  if (hashMatch) {
    return {
      line: Number(hashMatch[1]),
      column: hashMatch[2] ? Number(hashMatch[2]) : undefined,
    };
  }

  const colonMatch = href.match(/:(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    return {
      line: Number(colonMatch[1]),
      column: colonMatch[2] ? Number(colonMatch[2]) : undefined,
    };
  }

  return null;
}

export function formatFileLinkLocation(args: { line?: number; column?: number }) {
  if (!args.line) {
    return null;
  }

  return args.column ? `L${args.line}:C${args.column}` : `L${args.line}`;
}

export function toBaseName(filePath: string) {
  return resolvePathBaseName({ path: filePath, fallback: filePath });
}

export function getKnownFilePathSet(filePaths: readonly string[]) {
  const cached = knownFilePathSetCache.get(filePaths);
  if (cached) {
    return cached;
  }
  const next = new Set(filePaths);
  knownFilePathSetCache.set(filePaths, next);
  return next;
}

export function resolveWorkspaceFileLink(args: {
  href?: string;
  workspaceCwd?: string;
  knownFilePaths?: ReadonlySet<string>;
  allowUnknownPaths?: boolean;
}): ResolvedWorkspaceFileLink | null {
  const raw = args.href?.trim();
  if (!raw || raw.startsWith("#")) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith("file://")) {
    return null;
  }

  let decoded = raw.replace(/^file:\/\//, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Ignore decoding failures and keep the original href.
  }

  const withoutQuery = decoded.split("?")[0] ?? decoded;
  const location = parseFileLinkLocation(withoutQuery);
  const normalized = resolveWorkspaceRelativeFilePath({
    filePath: stripLineSuffix(trimTrailingPunctuation(withoutQuery)),
    workspacePath: args.workspaceCwd,
  });
  if (!normalized) {
    return null;
  }

  const filePath = normalized;
  if (!filePath || filePath === ".." || filePath.startsWith("../")) {
    return null;
  }

  if (args.knownFilePaths && args.knownFilePaths.size > 0 && !args.knownFilePaths.has(filePath)) {
    if (!args.allowUnknownPaths || !isLikelyWorkspaceFilePath(filePath)) {
      return null;
    }
  } else if ((!args.knownFilePaths || args.knownFilePaths.size === 0) && args.allowUnknownPaths && !isLikelyWorkspaceFilePath(filePath)) {
    return null;
  }

  return {
    filePath,
    fileName: toBaseName(filePath),
    ...(location ?? {}),
  };
}
