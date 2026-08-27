function normalizeWorkspacePath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function normalizeComparableWorkspacePath(value: string) {
  return normalizeWorkspacePath(value).toLowerCase();
}

export function resolvePastedFileAbsolutePath(args: {
  file: File;
  getPathForFile?: (file: File) => string;
}): string | null {
  // Electron 32+ removed the legacy `File.path` property; the preload-exposed
  // `webUtils.getPathForFile` bridge is the only supported mapping there. The
  // `File.path` fallback keeps non-Electron/browser-mode behavior unchanged.
  if (args.getPathForFile) {
    try {
      const resolved = args.getPathForFile(args.file).trim();
      if (resolved) {
        return resolved;
      }
    } catch {
      // Fall through to the legacy property.
    }
  }
  const legacyPath = (args.file as File & { path?: string }).path?.trim();
  return legacyPath || null;
}

export function toWorkspaceRelativeFilePath(args: {
  absolutePath: string;
  rootPath: string;
}) {
  const normalizedRoot = normalizeWorkspacePath(args.rootPath);
  const normalizedAbsolute = normalizeWorkspacePath(args.absolutePath);
  const comparableRoot = normalizeComparableWorkspacePath(args.rootPath);
  const comparableAbsolute = normalizeComparableWorkspacePath(args.absolutePath);

  if (!comparableAbsolute.startsWith(`${comparableRoot}/`)) {
    return null;
  }

  return normalizedAbsolute.slice(normalizedRoot.length + 1);
}

export function buildAttachedFileContext(args: {
  filePath: string;
  kind: "text" | "image";
  content: string;
  language: string;
}) {
  if (args.kind === "image") {
    return {
      filePath: args.filePath,
      content: "[Workspace image attached by path.]",
      language: "image",
      instruction:
        "Inspect the attached workspace image with an available image or file tool.",
    };
  }

  return {
    filePath: args.filePath,
    content: args.content,
    language: args.language,
  };
}
